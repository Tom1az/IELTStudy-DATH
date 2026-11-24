import type { Paginated } from "@/lib/types";
import type { BackendAnswer, BackendAnswerKey, BackendAttemptResult, BackendResponseResult } from "./backend-types";
import { backendRequest, optional } from "./client";

/**
 * Instructor grading: the queue of submitted attempts, one attempt with its answers, and
 * the written feedback an instructor leaves on it. Also the instructor's learner list.
 *
 * Contract (`backend/src/docs/openapi.yaml`, tag Grading):
 *
 *   GET  /instructor/learners                        -> { learners }
 *   GET  /instructor/submissions?courseId=&quizId=   -> { submissions }
 *   GET  /instructor/submissions/{attemptId}         -> { result, submission }
 *   PUT  /instructor/submissions/{attemptId}/feedback  { comment, totalScore } -> { feedback }
 *   GET  /attempts/{attemptId}/feedback              -> { feedback }   (the learner's own view)
 *
 * The reads go through `optional()`, so a backend without these routes (an old deploy) shows
 * the "not available" card instead of an error.
 */

/* ───────── Backend shapes (proposed contract) ───────── */

interface BackendFeedback {
  attemptId: number;
  comment: string;
  /** The score the instructor set by hand, or null to keep the automatic one. */
  totalScore: number | null;
  gradedBy: { userId: number; fullName: string } | null;
  gradedAt: string;
}

interface BackendSubmission {
  attemptId: number;
  learner: { userId: number; fullName: string; email: string };
  course: { courseId: number; title: string };
  quiz: { quizId: number; title: string };
  totalScore: number | null;
  maxScore: number;
  completedAt: string;
  feedback: BackendFeedback | null;
}

interface BackendInstructorLearner {
  user: { userId: number; fullName: string; email: string };
  courses: { courseId: number; title: string; completedLessons: number; totalCoreLessons: number; progressPercent: number }[];
  completedAttempts: number;
  lastActiveAt: string | null;
}

/* ───────── What the pages use ───────── */

export interface AttemptFeedback {
  comment: string;
  /** Null when the instructor kept the automatic score. */
  score: number | null;
  by: string;
  at: string;
}

export interface Submission {
  attemptId: string;
  learner: { id: string; name: string; email: string };
  course: { id: string; title: string };
  quiz: { id: string; title: string };
  /** The marked score, which is the instructor's one if they changed it. */
  score: number;
  autoScore: number;
  maxScore: number;
  submittedAt: string;
  graded: boolean;
}

/** The queue, plus the course and quiz values to offer in the filters. */
export interface SubmissionQueue extends Paginated<Submission> {
  courses: { id: string; title: string }[];
  quizzes: { id: string; title: string }[];
}

/** One answer, already turned into the text the instructor reads. */
export interface GradedAnswer {
  questionId: string;
  number: number;
  prompt: string;
  given: string;
  expected: string;
  isCorrect: boolean;
}

export interface SubmissionDetail {
  submission: Submission;
  answers: GradedAnswer[];
  feedback: AttemptFeedback | null;
}

export interface InstructorLearner {
  id: string;
  name: string;
  email: string;
  courses: { id: string; title: string; done: number; total: number; percent: number }[];
  attempts: number;
  lastActiveAt: string | null;
  /** Average progress over the learner's courses, for the sort order and the bar. */
  overallPercent: number;
}

/* ───────── Converters ───────── */

/** A stored answer can be one value, several accepted ones, or a matching map. */
function answerText(value: BackendAnswer | BackendAnswerKey | null): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/_/g, " ");
  if (Array.isArray(value)) return value.join(" / ");
  return Object.entries(value)
    .map(([item, choice]) => `${item} → ${choice}`)
    .join(", ");
}

function toFeedback(row: BackendFeedback | null): AttemptFeedback | null {
  if (!row) return null;
  return { comment: row.comment, score: row.totalScore, by: row.gradedBy?.fullName ?? "An instructor", at: row.gradedAt };
}

function toSubmission(row: BackendSubmission): Submission {
  const auto = row.totalScore ?? 0;
  const override = row.feedback?.totalScore;
  return {
    attemptId: String(row.attemptId),
    learner: { id: String(row.learner.userId), name: row.learner.fullName, email: row.learner.email },
    course: { id: String(row.course.courseId), title: row.course.title },
    quiz: { id: String(row.quiz.quizId), title: row.quiz.title },
    score: override ?? auto,
    autoScore: auto,
    maxScore: row.maxScore,
    submittedAt: row.completedAt,
    graded: row.feedback !== null,
  };
}

function toAnswers(responses: BackendResponseResult[]): GradedAnswer[] {
  return responses.map((r, i) => ({
    questionId: String(r.questionId),
    number: i + 1,
    prompt: r.questionText,
    given: answerText(r.userAnswer),
    expected: answerText(r.correctAnswer),
    isCorrect: r.isCorrect,
  }));
}

/* ───────── API ───────── */

export const gradingApi = {
  /**
   * The grading queue: attempts learners have submitted on this instructor's courses,
   * newest first. The filters are built from the rows, so they can only offer a course
   * or quiz that actually has submissions. Paging runs here, like the admin tables.
   */
  async queue(params: { courseId?: string; quizId?: string; onlyUngraded?: boolean; page?: number; pageSize?: number } = {}): Promise<SubmissionQueue | null> {
    const query = new URLSearchParams();
    if (params.courseId && params.courseId !== "all") query.set("courseId", params.courseId);
    if (params.quizId && params.quizId !== "all") query.set("quizId", params.quizId);
    const qs = query.toString();
    const res = await optional(() => backendRequest<{ submissions: BackendSubmission[] }>("GET", `/instructor/submissions${qs ? `?${qs}` : ""}`));
    if (!res) return null;

    const all = res.submissions.map(toSubmission);
    all.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const rows = params.onlyUngraded ? all.filter((s) => !s.graded) : all;

    // Built from every submission, not from `rows`, so switching a filter never empties the dropdowns
    const byCourse = new Map(all.map((s) => [s.course.id, s.course.title]));
    const byQuiz = new Map(all.filter((s) => !params.courseId || params.courseId === "all" || s.course.id === params.courseId).map((s) => [s.quiz.id, s.quiz.title]));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = params.pageSize ?? 12;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      courses: Array.from(byCourse, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)),
      quizzes: Array.from(byQuiz, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)),
    };
  },

  /** One submitted attempt: every answer the learner gave, next to the expected one. */
  async submission(attemptId: string): Promise<SubmissionDetail | null> {
    const res = await optional(() =>
      backendRequest<{ result: BackendAttemptResult; submission: BackendSubmission }>("GET", `/instructor/submissions/${attemptId}`),
    );
    if (!res) return null;
    return {
      submission: toSubmission(res.submission),
      answers: toAnswers(res.result.responses),
      feedback: toFeedback(res.submission.feedback),
    };
  },

  /**
   * Saves the written comment and, when the instructor changed it, the score. Sending
   * `totalScore: null` puts the automatic score back.
   */
  async saveFeedback(attemptId: string, input: { comment: string; score: number | null }): Promise<AttemptFeedback> {
    const res = await backendRequest<{ feedback: BackendFeedback }>("PUT", `/instructor/submissions/${attemptId}/feedback`, {
      comment: input.comment.trim(),
      totalScore: input.score,
    });
    return toFeedback(res.feedback)!;
  },

  /**
   * Learners enrolled in this instructor's courses, least progress first (they need help
   * most). The whole list comes back in one call and the page filters it, the same way the
   * admin tables work.
   */
  async learners(): Promise<InstructorLearner[] | null> {
    const res = await optional(() => backendRequest<{ learners: BackendInstructorLearner[] }>("GET", "/instructor/learners"));
    if (!res) return null;

    const list = res.learners.map((row) => {
      const courses = row.courses.map((c) => ({
        id: String(c.courseId),
        title: c.title,
        done: c.completedLessons,
        total: c.totalCoreLessons,
        percent: Math.round(c.progressPercent),
      }));
      return {
        id: String(row.user.userId),
        name: row.user.fullName,
        email: row.user.email,
        courses,
        attempts: row.completedAttempts,
        lastActiveAt: row.lastActiveAt,
        overallPercent: courses.length ? Math.round(courses.reduce((sum, c) => sum + c.percent, 0) / courses.length) : 0,
      };
    });
    list.sort((a, b) => a.overallPercent - b.overallPercent || a.name.localeCompare(b.name));
    return list;
  },

  /** The feedback on my own attempt, shown under the score on the result page. */
  async myFeedback(attemptId: string): Promise<AttemptFeedback | null> {
    const res = await optional(() => backendRequest<{ feedback: BackendFeedback | null }>("GET", `/attempts/${attemptId}/feedback`));
    return res ? toFeedback(res.feedback) : null;
  },
};
