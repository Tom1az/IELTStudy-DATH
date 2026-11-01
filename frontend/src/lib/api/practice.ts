import type { PracticeSet, QuizAttempt, Recommendation, SkillCategory } from "@/lib/types";
import type {
  BackendAttempt, BackendAttemptResult, BackendAttemptSummary, BackendEnrollment, BackendLesson, BackendLessonDetail, BackendQuizForLearner, BackendSkill,
} from "./backend-types";
import { ApiError, backendRequest } from "./client";
import { meApi } from "./learning";
import { buildSyllabus, lessonCategory, toCourse, toRecommendation, toSkillCategories, type SkillCategories } from "./mappers";
import { toBackendAnswer, toSections, toUiAnswer } from "./quiz-mappers";

/**
 * Quizzes: the practice list, taking a quiz, the post-quiz review, history and the
 * diagnostic (placement quiz). Decisions: `docs/plans/phase-4-frontend.md`.
 */

/* ───────── DTOs ───────── */

/** The quiz as the player and the review show it in their header. */
export interface QuizInfo {
  id: string;
  title: string;
  skill: SkillCategory;
  minutes: number; // 0 = no time limit
}

export interface AttemptSession {
  quiz: QuizInfo;
  /** The passages and their questions (answers removed). */
  sections: PracticeSet[];
  attempt: QuizAttempt;
  /** The lesson the quiz belongs to, for the "exit" link. Null for the diagnostic. */
  courseId: string | null;
  lessonId: string | null;
  lessonTitle?: string;
}

export interface SkillChange {
  skillId: string;
  name: string;
  category: SkillCategory;
  before: number;
  after: number;
}

export interface AttemptResult {
  attempt: QuizAttempt;
  quiz: QuizInfo;
  /** The passages and questions, with answers and explanations. */
  sections: PracticeSet[];
  /** How each measured skill's mastery moved. Empty until BKT runs (Phase 3). */
  changes: SkillChange[];
  /** Estimated bands. Null until BKT mastery exists (Phase 3). */
  bands: Record<SkillCategory, number> | null;
  overall: number | null;
  recommendations: Recommendation[];
}

export interface PracticeListItem {
  quiz: { id: string; title: string; skill: SkillCategory; minutes: number; questions: number };
  course: { id: string; levelName: string; level: number };
  lessonId: string;
  lessonTitle: string;
  attempts: number;
  best: number | null;
  last: { score: number; max: number; at: string; attemptId: string } | null;
  inProgress: boolean;
}

export interface HistoryRow {
  attemptId: string;
  quiz: { id: string; title: string; skill: SkillCategory | null };
  courseLevelName: string;
  score: number;
  max: number;
  completedAt: string;
  kind: "practice" | "placement";
}

export interface Placement {
  sections: PracticeSet[];
  totalQuestions: number;
  minutes: number;
  alreadyDone: boolean;
  quizId: string;
  /** My finished diagnostic attempt, to link to its review. */
  completedAttemptId?: string;
}

/* ───────── Shared loaders ───────── */

async function loadCategories(): Promise<SkillCategories> {
  const res = await backendRequest<{ skills: BackendSkill[] }>("GET", "/skills");
  return toSkillCategories(res.skills);
}

async function loadQuiz(quizId: number | string): Promise<BackendQuizForLearner> {
  const res = await backendRequest<{ quiz: BackendQuizForLearner }>("GET", `/quizzes/${quizId}`);
  return res.quiz;
}

async function loadLesson(lessonId: number | string): Promise<BackendLessonDetail> {
  const res = await backendRequest<{ lesson: BackendLessonDetail }>("GET", `/lessons/${lessonId}`);
  return res.lesson;
}

const minutesOf = (seconds: number | null) => (seconds ? Math.round(seconds / 60) : 0);

/* ───────── Answers in progress ───────── */

// The backend has no autosave, so answers stay in this browser until the attempt is submitted
const draftKey = (attemptId: string) => `ieltstudy.attempt.${attemptId}`;

interface Draft {
  answers: Record<string, string>;
  remainingSeconds?: number;
}

function loadDraft(attemptId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(attemptId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function clearDraft(attemptId: string) {
  try {
    window.localStorage.removeItem(draftKey(attemptId));
  } catch {
    /* storage unavailable */
  }
}

function toAttempt(a: BackendAttempt, kind: QuizAttempt["kind"], draft: Draft | null): QuizAttempt {
  return {
    id: String(a.attemptId),
    quizId: String(a.quizId),
    kind,
    status: a.status === "completed" ? "submitted" : "in_progress",
    answers: draft?.answers ?? {},
    remainingSeconds: draft?.remainingSeconds,
    totalScore: a.totalScore ?? 0,
    maxScore: a.maxScore,
    startedAt: a.startedAt,
    completedAt: a.completedAt ?? undefined,
    responses: [],
  };
}

/* ───────── Post-quiz review ───────── */

/** The quiz's main skill: the category that carries the most weight across its questions. */
function mainCategory(result: BackendAttemptResult, categories: SkillCategories): SkillCategory {
  const weight: Record<SkillCategory, number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  for (const r of result.responses) {
    for (const tag of r.skills) {
      const category = categories.get(tag.skillId);
      if (category) weight[category] += tag.weight;
    }
  }
  let best: SkillCategory = "reading";
  for (const c of Object.keys(weight) as SkillCategory[]) {
    if (weight[c] > weight[best]) best = c;
  }
  return best;
}

function buildResult(result: BackendAttemptResult, quiz: BackendQuizForLearner, categories: SkillCategories): AttemptResult {
  const skill = mainCategory(result, categories);
  const sections = toSections(quiz, skill);
  const byId = new Map(result.responses.map((r) => [String(r.questionId), r]));

  // Fill in the answers and explanations, which only come with the graded result
  for (const section of sections) {
    for (const q of section.questions) {
      const r = byId.get(q.id);
      const backendQ = quiz.questions.find((x) => String(x.questionId) === q.id);
      if (!r || !backendQ) continue;
      q.answerKey = toUiAnswer(backendQ, r.correctAnswer);
      q.explanation = r.explanation ?? "";
    }
  }

  const attempt = toAttempt(result.attempt, quiz.kind === "diagnostic" ? "placement" : "practice", null);
  for (const r of result.responses) {
    const backendQ = quiz.questions.find((x) => x.questionId === r.questionId);
    const value = backendQ ? toUiAnswer(backendQ, r.userAnswer) : "";
    attempt.answers[String(r.questionId)] = value;
    attempt.responses.push({ questionId: String(r.questionId), userAnswer: value, isCorrect: r.isCorrect, attemptOrder: r.attemptOrder ?? 0, responseTimeSeconds: r.responseTimeSeconds ?? 0 });
  }

  const changes: SkillChange[] = result.masteryChanges.map((c) => ({
    skillId: String(c.skillId),
    name: c.name,
    category: categories.get(c.skillId) ?? skill,
    // `before` is null the first time a skill is measured; showing no change is the honest picture
    before: c.before ?? c.after,
    after: c.after,
  }));

  return {
    attempt,
    quiz: { id: String(quiz.quizId), title: quiz.title, skill, minutes: minutesOf(quiz.timeLimitSeconds) },
    sections,
    changes,
    bands: null,
    overall: null,
    recommendations: result.recommendations.map((r) => toRecommendation(r, categories)),
  };
}

/**
 * Fills in the estimated bands from my current mastery (Advanced service). They stay null when
 * that service isn't available or I haven't been measured in all four skills yet.
 */
async function withBands(result: AttemptResult): Promise<AttemptResult> {
  const mastery = await meApi.mastery().catch(() => null);
  return { ...result, bands: mastery?.bands ?? null, overall: mastery?.overall ?? null };
}

/* ───────── API ───────── */

export const practiceApi = {
  /**
   * Every quiz in the lessons of my enrolled courses, with my best and last score.
   * Quizzes are only listed on the lesson itself (`GET /lessons/:id`), so this loads each
   * open core lesson. Locked lessons are skipped: their content is not served until they
   * unlock. Remedial lessons are skipped too, as learners reach them through recommendations.
   */
  async list(params: { skill?: SkillCategory | "all"; courseId?: string } = {}): Promise<PracticeListItem[]> {
    const [enrollmentsRes, attemptsRes, categories] = await Promise.all([
      backendRequest<{ enrollments: BackendEnrollment[] }>("GET", "/me/enrollments"),
      backendRequest<{ attempts: BackendAttemptSummary[] }>("GET", "/me/attempts"),
      loadCategories(),
    ]);

    const enrollments = enrollmentsRes.enrollments.filter((e) => !params.courseId || String(e.course.courseId) === params.courseId);
    const lessonLists = await Promise.all(
      enrollments.map((e) => backendRequest<{ lessons: BackendLesson[] }>("GET", `/courses/${e.course.courseId}/lessons`).then((r) => r.lessons)),
    );

    // The lessons to open, in syllabus order, with the course and skill section they belong to
    const toOpen: { course: PracticeListItem["course"]; lesson: BackendLesson; skill: SkillCategory }[] = [];
    for (let i = 0; i < enrollments.length; i++) {
      const course = toCourse(enrollments[i].course);
      for (const section of buildSyllabus(lessonLists[i], categories)) {
        if (params.skill && params.skill !== "all" && section.skill !== params.skill) continue;
        for (const entry of section.entries) {
          if (!entry.lesson.locked) toOpen.push({ course: { id: course.id, levelName: course.levelName, level: course.level }, lesson: entry.lesson, skill: section.skill });
        }
      }
    }
    const details = await Promise.all(toOpen.map((x) => loadLesson(x.lesson.lessonId)));

    const items: PracticeListItem[] = [];
    for (let i = 0; i < toOpen.length; i++) {
      const { course, skill } = toOpen[i];
      for (const quiz of details[i].quizzes) {
        // `/me/attempts` is newest first, so the first completed attempt is the last one
        const mine = attemptsRes.attempts.filter((a) => a.quizId === quiz.quizId);
        const done = mine.filter((a) => a.status === "completed");
        let best: number | null = null;
        for (const a of done) {
          if (best === null || (a.totalScore ?? 0) > best) best = a.totalScore ?? 0;
        }
        const last = done[0];
        items.push({
          quiz: { id: String(quiz.quizId), title: quiz.title, skill, minutes: minutesOf(quiz.timeLimitSeconds), questions: quiz.questionCount },
          course,
          lessonId: String(details[i].lessonId),
          lessonTitle: details[i].title,
          attempts: done.length,
          best,
          last: last ? { score: last.totalScore ?? 0, max: last.maxScore, at: last.completedAt ?? last.startedAt, attemptId: String(last.attemptId) } : null,
          inProgress: mine.some((a) => a.status === "in_progress"),
        });
      }
    }
    // Highest level first
    items.sort((a, b) => b.course.level - a.course.level);
    return items;
  },

  /**
   * Starts the quiz, or resumes my unfinished attempt (the backend returns it again, and
   * the answers saved in this browser are restored). The lesson is loaded too, for the
   * skill label and the "exit" link.
   */
  async start(quizId: string): Promise<AttemptSession> {
    const [res, categories] = await Promise.all([
      backendRequest<{ attempt: BackendAttempt; quiz: BackendQuizForLearner }>("POST", `/quizzes/${quizId}/attempts`),
      loadCategories(),
    ]);
    const quiz = res.quiz;

    let lesson: BackendLessonDetail | null = null;
    let skill: SkillCategory | undefined;
    if (quiz.lessonId !== null) {
      lesson = await loadLesson(quiz.lessonId);
      skill = lessonCategory(lesson, categories);
    }

    const sections = toSections(quiz, skill);
    return {
      quiz: { id: String(quiz.quizId), title: quiz.title, skill: sections[0].skill, minutes: minutesOf(quiz.timeLimitSeconds) },
      sections,
      attempt: toAttempt(res.attempt, quiz.kind === "diagnostic" ? "placement" : "practice", loadDraft(String(res.attempt.attemptId))),
      courseId: lesson ? String(lesson.courseId) : null,
      lessonId: lesson ? String(lesson.lessonId) : null,
      lessonTitle: lesson?.title,
    };
  },

  /** Keeps my answers in this browser (the backend has no autosave). */
  save(attemptId: string, answers: Record<string, string>, remainingSeconds: number) {
    try {
      window.localStorage.setItem(draftKey(attemptId), JSON.stringify({ answers, remainingSeconds: Math.round(remainingSeconds) }));
    } catch {
      /* storage full or unavailable: the answers are still in the page */
    }
    return Promise.resolve();
  },

  /**
   * Sends my answers. The backend wants them in the order I answered, which the player
   * records as the order of `timings` (the first time each question was touched).
   * Questions left empty are not sent: the backend counts them as wrong.
   */
  async submit(attemptId: string, answers: Record<string, string>, timings: Record<string, number> = {}): Promise<AttemptResult> {
    const before = await backendRequest<{ result: BackendAttemptResult }>("GET", `/attempts/${attemptId}`);
    const quiz = await loadQuiz(before.result.attempt.quizId);

    const order: string[] = [];
    for (const id of Object.keys(timings)) order.push(id);
    for (const id of Object.keys(answers)) {
      if (!order.includes(id)) order.push(id);
    }

    const responses: { questionId: number; answer: unknown; responseTimeSeconds?: number }[] = [];
    for (const id of order) {
      const question = quiz.questions.find((q) => String(q.questionId) === id);
      if (!question) continue;
      const answer = toBackendAnswer(question, answers[id] ?? "");
      if (answer === null) continue;
      const seconds = timings[id];
      responses.push({ questionId: question.questionId, answer, responseTimeSeconds: seconds === undefined ? undefined : Math.round(seconds * 10) / 10 });
    }

    const res = await backendRequest<{ result: BackendAttemptResult }>("POST", `/attempts/${attemptId}/submit`, { responses });
    clearDraft(attemptId);
    return withBands(buildResult(res.result, quiz, await loadCategories()));
  },

  /** The post-quiz review: the graded attempt, merged with the quiz for its options and passages. */
  async result(attemptId: string): Promise<AttemptResult> {
    const res = await backendRequest<{ result: BackendAttemptResult }>("GET", `/attempts/${attemptId}`);
    if (res.result.attempt.status !== "completed") throw new ApiError(409, "HTTP_409", "This attempt hasn't been submitted yet.");
    const [quiz, categories] = await Promise.all([loadQuiz(res.result.attempt.quizId), loadCategories()]);
    return withBands(buildResult(res.result, quiz, categories));
  },

  /** My finished attempts, newest first. */
  async history(): Promise<HistoryRow[]> {
    const [attemptsRes, practice] = await Promise.all([
      backendRequest<{ attempts: BackendAttemptSummary[] }>("GET", "/me/attempts"),
      practiceApi.list({}),
    ]);
    // The practice list knows each quiz's skill and course; the attempt summary doesn't
    const quizInfo = new Map(practice.map((p) => [p.quiz.id, p]));

    const rows: HistoryRow[] = [];
    for (const a of attemptsRes.attempts) {
      if (a.status !== "completed") continue;
      const info = quizInfo.get(String(a.quizId));
      const isDiagnostic = a.quiz.kind === "diagnostic";
      rows.push({
        attemptId: String(a.attemptId),
        quiz: { id: String(a.quizId), title: a.quiz.title, skill: info?.quiz.skill ?? null },
        courseLevelName: isDiagnostic ? "Placement" : info?.course.levelName ?? "",
        score: a.totalScore ?? 0,
        max: a.maxScore,
        completedAt: a.completedAt ?? a.startedAt,
        kind: isDiagnostic ? "placement" : "practice",
      });
    }
    return rows;
  },

  /* ───────── Diagnostic (placement quiz) ───────── */

  async placement(): Promise<Placement> {
    const res = await backendRequest<{ quiz: BackendQuizForLearner; completedAttemptId: number | null }>("GET", "/diagnostic");
    return {
      sections: toSections(res.quiz),
      totalQuestions: res.quiz.questions.length,
      minutes: minutesOf(res.quiz.timeLimitSeconds),
      alreadyDone: res.completedAttemptId !== null,
      quizId: String(res.quiz.quizId),
      completedAttemptId: res.completedAttemptId === null ? undefined : String(res.completedAttemptId),
    };
  },

  /** Starts (or resumes) my diagnostic attempt, when I press "Start the quiz". */
  async startPlacement(quizId: string): Promise<string> {
    const res = await backendRequest<{ attempt: BackendAttempt }>("POST", `/quizzes/${quizId}/attempts`);
    return String(res.attempt.attemptId);
  },
};
