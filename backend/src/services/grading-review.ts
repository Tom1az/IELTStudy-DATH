// Instructor review of submitted attempts (contract: Grading). An instructor sees the completed
// attempts on quizzes whose lesson belongs to a course they own, writes feedback, and may override
// the score. `attempt_feedback.score_override` holds the override; `quiz_attempts.total_score`
// keeps the automatic score.
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import { notify } from "./notifications.ts";

const orm = db.orm.public;

type FeedbackRow = {
  attemptId: number;
  instructorId: number | null;
  comment: string;
  scoreOverride: number | null;
  updatedAt: Temporal.Instant;
};

const toFeedback = (row: FeedbackRow, names: Map<number, string>) => ({
  attemptId: row.attemptId,
  comment: row.comment,
  totalScore: row.scoreOverride,
  gradedBy:
    row.instructorId !== null
      ? { userId: row.instructorId, fullName: names.get(row.instructorId) ?? "An instructor" }
      : null,
  gradedAt: row.updatedAt,
});

const namesOf = async (userIds: number[]) => {
  const ids = [...new Set(userIds)];
  const users = ids.length > 0 ? await orm.Users.where((u) => u.userId.in(ids)).all() : [];
  return new Map(users.map((u) => [u.userId, u.fullName]));
};

// The quizzes in an instructor's courses, with their course, as lookups
const loadMyQuizzes = async (instructorId: number) => {
  const courses = await orm.Courses.where({ instructorId }).all();
  if (courses.length === 0) return { courses, lessons: [], quizzes: [] };
  const lessons = await orm.Lessons.where((l) => l.courseId.in(courses.map((c) => c.courseId))).all();
  const quizzes =
    lessons.length > 0
      ? await orm.Quizzes.where((q) => q.lessonId.in(lessons.map((l) => l.lessonId))).all()
      : [];
  return { courses, lessons, quizzes };
};

type SubmissionFilters = { courseId?: number; quizId?: number; attemptId?: number };

// GET /instructor/submissions: completed attempts on my quizzes, newest first
export const listSubmissions = async (instructorId: number, filters: SubmissionFilters = {}) => {
  const { courses, lessons, quizzes } = await loadMyQuizzes(instructorId);
  const courseById = new Map(courses.map((c) => [c.courseId, c]));
  const lessonById = new Map(lessons.map((l) => [l.lessonId, l]));
  const quizById = new Map(
    quizzes
      .filter((q) => filters.quizId === undefined || q.quizId === filters.quizId)
      .filter(
        (q) =>
          filters.courseId === undefined ||
          lessonById.get(q.lessonId!)?.courseId === filters.courseId,
      )
      .map((q) => [q.quizId, q]),
  );
  if (quizById.size === 0) return [];

  const attempts = await orm.QuizAttempts.where((a) =>
    and(
      a.quizId.in([...quizById.keys()]),
      a.completedAt.isNotNull(),
      filters.attemptId !== undefined ? a.attemptId.eq(filters.attemptId) : a.attemptId.isNotNull(),
    ),
  )
    .orderBy([(a) => a.completedAt.desc(), (a) => a.attemptId.desc()])
    .all();
  if (attempts.length === 0) return [];

  const attemptIds = attempts.map((a) => a.attemptId);
  const [learners, feedbackRows] = await Promise.all([
    orm.Users.where((u) => u.userId.in([...new Set(attempts.map((a) => a.userId))])).all(),
    orm.AttemptFeedback.where((f) => f.attemptId.in(attemptIds)).all(),
  ]);
  const learnerById = new Map(learners.map((u) => [u.userId, u]));
  const feedbackById = new Map(feedbackRows.map((f) => [f.attemptId, f]));
  const names = await namesOf(
    feedbackRows.map((f) => f.instructorId).filter((id): id is number => id !== null),
  );

  return attempts.map((attempt) => {
    const quiz = quizById.get(attempt.quizId)!;
    const course = courseById.get(lessonById.get(quiz.lessonId!)!.courseId)!;
    const learner = learnerById.get(attempt.userId)!;
    const feedback = feedbackById.get(attempt.attemptId);
    return {
      attemptId: attempt.attemptId,
      learner: { userId: learner.userId, fullName: learner.fullName, email: learner.email },
      course: { courseId: course.courseId, title: course.title },
      quiz: { quizId: quiz.quizId, title: quiz.title },
      totalScore: attempt.totalScore,
      maxScore: attempt.maxScore,
      completedAt: attempt.completedAt!,
      feedback: feedback ? toFeedback(feedback, names) : null,
    };
  });
};

// One submitted attempt on my quiz. 404 if it doesn't exist or isn't submitted, 403 if the quiz
// isn't in one of my courses.
export const findMySubmission = async (instructorId: number, attemptId: number) => {
  const attempt = await orm.QuizAttempts.first({ attemptId });
  if (!attempt || attempt.completedAt === null) {
    throw httpError(404, "Submission not found");
  }
  const [submission] = await listSubmissions(instructorId, { attemptId });
  if (!submission) {
    throw httpError(403, "This attempt is not on one of your quizzes");
  }
  return { attempt, submission };
};

// PUT /instructor/submissions/{attemptId}/feedback. Creates or replaces my feedback and tells
// the learner, in one transaction.
export const saveFeedback = async (
  instructor: { userId: number; fullName: string },
  attemptId: number,
  input: { comment: string; totalScore: number | null },
) => {
  const { attempt, submission } = await findMySubmission(instructor.userId, attemptId);
  if (input.totalScore !== null && input.totalScore > attempt.maxScore) {
    throw httpError(400, `totalScore can't be more than the attempt's maxScore (${attempt.maxScore})`);
  }

  const row = await db.transaction(async (tx) => {
    const txOrm = tx.orm.public;
    const existing = await txOrm.AttemptFeedback.first({ attemptId });
    const values = {
      instructorId: instructor.userId,
      comment: input.comment,
      scoreOverride: input.totalScore,
    };
    const saved = existing
      ? await txOrm.AttemptFeedback.where({ attemptId }).update(values)
      : await txOrm.AttemptFeedback.create({ attemptId, ...values });

    await notify(txOrm, attempt.userId, {
      type: "attempt.feedback",
      title: `${instructor.fullName} left feedback on "${submission.quiz.title}"`,
      body: input.comment || null,
      link: `/practice/result/${attemptId}`,
    });
    return saved!;
  });

  return toFeedback(row, new Map([[instructor.userId, instructor.fullName]]));
};

// GET /attempts/{attemptId}/feedback, for the learner's own result page
export const getAttemptFeedback = async (attemptId: number) => {
  const row = await orm.AttemptFeedback.first({ attemptId });
  if (!row) return null;
  return toFeedback(row, await namesOf(row.instructorId !== null ? [row.instructorId] : []));
};

// GET /instructor/learners: every learner enrolled in one of my courses, with progress per course
export const listMyLearners = async (instructorId: number) => {
  const { courses, lessons, quizzes } = await loadMyQuizzes(instructorId);
  if (courses.length === 0) return [];
  const courseIds = courses.map((c) => c.courseId);

  const enrollments = await orm.Enrollments.where((e) => e.courseId.in(courseIds)).all();
  if (enrollments.length === 0) return [];
  const learnerIds = [...new Set(enrollments.map((e) => e.userId))];

  const coreLessons = lessons.filter((l) => l.kind === "core");
  const quizIds = quizzes.map((q) => q.quizId);
  const [users, progress, attempts] = await Promise.all([
    orm.Users.where((u) => u.userId.in(learnerIds)).all(),
    lessons.length > 0
      ? orm.LessonProgress.where((p) =>
          and(p.userId.in(learnerIds), p.lessonId.in(lessons.map((l) => l.lessonId))),
        ).all()
      : [],
    quizIds.length > 0
      ? orm.QuizAttempts.where((a) =>
          and(a.userId.in(learnerIds), a.quizId.in(quizIds), a.completedAt.isNotNull()),
        ).all()
      : [],
  ]);

  const courseById = new Map(courses.map((c) => [c.courseId, c]));
  const completed = new Set(
    progress.filter((p) => p.status === "completed").map((p) => `${p.userId}:${p.lessonId}`),
  );

  return users
    .map((user) => {
      const myCourses = enrollments
        .filter((e) => e.userId === user.userId)
        .map((e) => {
          const core = coreLessons.filter((l) => l.courseId === e.courseId);
          const done = core.filter((l) => completed.has(`${user.userId}:${l.lessonId}`)).length;
          return {
            courseId: e.courseId,
            title: courseById.get(e.courseId)!.title,
            completedLessons: done,
            totalCoreLessons: core.length,
            progressPercent: core.length === 0 ? 0 : Math.round((done / core.length) * 100),
          };
        });

      // The latest thing they did in my courses: a submitted attempt or a lesson progress change
      const times = [
        ...attempts.filter((a) => a.userId === user.userId).map((a) => a.completedAt!),
        ...progress.filter((p) => p.userId === user.userId).map((p) => p.updatedAt),
      ];
      const lastActiveAt = times.reduce<Temporal.Instant | null>(
        (latest, t) => (latest === null || Temporal.Instant.compare(t, latest) > 0 ? t : latest),
        null,
      );

      return {
        user: { userId: user.userId, fullName: user.fullName, email: user.email },
        courses: myCourses,
        completedAttempts: attempts.filter((a) => a.userId === user.userId).length,
        lastActiveAt,
      };
    })
    .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName));
};
