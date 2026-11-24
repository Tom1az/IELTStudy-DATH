// Rules for taking a quiz, used by controllers/attempts.ts. They come from the API contract
// (Attempts) and docs/ERD.md ("Rules the database enforces", "One completed diagnostic").
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { isUniqueViolation } from "../utils/db-errors.ts";
import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { applyAttemptMastery } from "./bkt.ts";
import { assertCanOpenLesson } from "./gating.ts";
import { checkAnswerShape, isAnswerCorrect } from "./grading.ts";
import type { Answer } from "./grading.ts";
import { lockLearner } from "./learner-lock.ts";
import type { Json } from "./questions.ts";
import { loadQuizQuestions } from "./quiz-views.ts";
import type { QuestionRow } from "./quiz-views.ts";
import { findVisibleQuiz } from "./quizzes.ts";
import { generateRecommendationRows } from "./recommender.ts";

const orm = db.orm.public;

// One answer in the submit body, after Joi (utils/validator.ts)
export type SubmittedResponse = {
  questionId: number;
  answer: Answer;
  responseTimeSeconds?: number;
};

// One graded answer, ready to insert into question_responses
type GradedResponse = {
  questionId: number;
  userAnswer: Answer;
  isCorrect: boolean;
  attemptOrder: number;
  responseTimeSeconds: number | null;
};

// quiz_attempts.draft_answers: questionId -> the answer and when it was given (docs/ERD.md)
type DraftAnswers = Record<string, { answer: Answer; savedAt: string }>;

type OpenAttempt = {
  attemptId: number;
  userId: number;
  quizId: number;
  startedAt: Temporal.Instant;
  completedAt: Temporal.Instant | null;
  draftAnswers?: Json | null;
};

// A submit that arrives this many seconds after the time limit is still treated as on time.
// It covers network delay between the learner's timer reaching zero and the request arriving.
const GRACE_SECONDS = 30;

// Grades answers on the server; the client never sends isCorrect. The array order is the order
// the learner answered in (`attemptOrder`).
const gradeResponses = (
  questionById: Map<number, QuestionRow>,
  responses: Array<{ questionId: number; answer: Answer; responseTimeSeconds?: number }>,
) => {
  const graded: GradedResponse[] = [];
  let totalScore = 0;
  for (let index = 0; index < responses.length; index++) {
    const response = responses[index]!;
    const question = questionById.get(response.questionId);
    if (!question) {
      throw httpError(400, `Question ${response.questionId} is not in this quiz`);
    }
    checkAnswerShape(question.questionType, response.answer, question.questionId);
    const isCorrect = isAnswerCorrect(question.questionType, question.answerKey, response.answer);
    if (isCorrect) totalScore += 1;
    graded.push({
      questionId: question.questionId,
      userAnswer: response.answer,
      isCorrect,
      attemptOrder: index + 1,
      responseTimeSeconds: response.responseTimeSeconds ?? null,
    });
  }
  return { graded, totalScore };
};

const questionMap = async (quizId: number) => {
  const questions = await loadQuizQuestions(quizId);
  return { questions, byId: new Map(questions.map((q) => [q.questionId, q])) };
};

// Closes an open attempt with its graded answers, logs the responses, updates the learner's BKT
// mastery and makes the recommendations, all in one transaction. Returns null if the attempt was
// already closed (by a parallel submit or the time limit).
// Closing must be ONE SQL statement, UPDATE ... WHERE attempt_id = ? AND completed_at IS NULL, so
// it uses updateAndCount: the ORM's update() reads the matching row first and then updates it by
// id alone, which lets two parallel submits both pass the check. With one statement, Postgres
// makes the second wait for the first, then finds completed_at set and updates nothing.
const finishAttempt = async (
  attempt: OpenAttempt,
  graded: GradedResponse[],
  close: { completedAt: Temporal.Instant; totalScore: number; maxScore: number },
) => {
  return db.transaction(async (tx) => {
    const txOrm = tx.orm.public;
    const closedCount = await txOrm.QuizAttempts.where((a) =>
      and(a.attemptId.eq(attempt.attemptId), a.completedAt.isNull()),
    ).updateAndCount(close);
    if (closedCount === 0) return null;

    for (const row of graded) {
      await txOrm.QuestionResponses.create({ attemptId: attempt.attemptId, ...row });
    }

    // BKT and the recommendations, under the learner's lock (services/learner-lock.ts)
    await lockLearner(tx, attempt.userId);
    const changes = await applyAttemptMastery(txOrm, attempt.attemptId);
    if (changes.length > 0) {
      await generateRecommendationRows(txOrm, attempt.userId, attempt.attemptId);
    }

    return (await txOrm.QuizAttempts.first({ attemptId: attempt.attemptId }))!;
  });
};

// The quiz's deadline for an attempt, or null without a time limit
const deadlineOf = (attempt: OpenAttempt, quiz: { timeLimitSeconds: number | null }) =>
  quiz.timeLimitSeconds === null
    ? null
    : attempt.startedAt.epochMilliseconds + quiz.timeLimitSeconds * 1000;

const readDraft = (value: Json | null | undefined): DraftAnswers =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as DraftAnswers) : {};

// The time limit rule (spec: quizzes have an optional time limit, enforced by the server):
// - A submit or an autosave that arrives after the deadline and the grace period is rejected (409).
// - An attempt that is late or never submitted is closed by the server the next time anyone
//   touches it. It is graded with the autosaved answers given before the deadline (plus the
//   grace period), in the order they were given; anything else counts as unanswered. Its
//   completed_at is the deadline, not the moment we noticed.
// - Not for the diagnostic: an incomplete diagnostic would block a retake for good (409) and
//   seed the learner's mastery from a few answers.
// Returns true if this call closed the attempt.
export const closeAttemptIfTimeIsUp = async (attempt: OpenAttempt) => {
  if (attempt.completedAt !== null) {
    return false;
  }

  const quiz = await orm.Quizzes.first({ quizId: attempt.quizId });
  if (!quiz || quiz.kind === "diagnostic") return false;
  const deadlineMs = deadlineOf(attempt, quiz);
  if (deadlineMs === null) return false;
  const lastAcceptedMs = deadlineMs + GRACE_SECONDS * 1000;
  if (Temporal.Now.instant().epochMilliseconds <= lastAcceptedMs) {
    return false;
  }

  const row = await orm.QuizAttempts.first({ attemptId: attempt.attemptId });
  const { questions, byId } = await questionMap(attempt.quizId);
  const onTime = Object.entries(readDraft(row?.draftAnswers))
    .map(([questionId, saved]) => ({ questionId: Number(questionId), ...saved }))
    .filter((saved) => Date.parse(saved.savedAt) <= lastAcceptedMs && byId.has(saved.questionId))
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt) || a.questionId - b.questionId);

  // A saved answer that no longer fits its question (the quiz changed) is left out, not a 400
  const valid = onTime.filter((saved) => {
    try {
      checkAnswerShape(byId.get(saved.questionId)!.questionType, saved.answer, saved.questionId);
      return true;
    } catch {
      return false;
    }
  });
  const { graded, totalScore } = gradeResponses(byId, valid);

  const closed = await finishAttempt(attempt, graded, {
    completedAt: Temporal.Instant.fromEpochMilliseconds(deadlineMs),
    totalScore,
    maxScore: questions.length,
  });
  return closed !== null;
};

// A learner reads their own attempts; an admin may read anyone's
export const findOwnAttempt = async (attemptId: number, user: PublicUser) => {
  const attempt = await orm.QuizAttempts.first({ attemptId });
  if (!attempt) {
    throw httpError(404, "Attempt not found");
  }
  if (user.role !== "admin" && attempt.userId !== user.userId) {
    throw httpError(403, "This is another learner's attempt");
  }
  return attempt;
};

// The learner's unfinished attempt on a quiz, if any. The database allows at most one
// (partial unique index quiz_attempts_one_open).
const findOpenAttempt = async (userId: number, quizId: number) => {
  return orm.QuizAttempts.where((a) =>
    and(a.userId.eq(userId), a.quizId.eq(quizId), a.completedAt.isNull()),
  ).first();
};

// POST /quizzes/{quizId}/attempts. Resumes the learner's unfinished attempt if there is one
// (`created: false`), otherwise starts a new one (`created: true`).
export const startOrResumeAttempt = async (quizId: number, user: PublicUser) => {
  // Same access rule as the quiz's learner view: 404 if the course isn't visible, 403 if the
  // learner may not open the lesson (not enrolled in a core lesson's course, or still locked).
  // The diagnostic has no course, so every learner may take it.
  const { quiz, course } = await findVisibleQuiz(quizId, user);
  if (course !== null) {
    const lesson = (await orm.Lessons.first({ lessonId: quiz.lessonId! }))!;
    await assertCanOpenLesson(lesson, course, user);
  }

  // One completed diagnostic per learner (docs/ERD.md): it seeds their starting mastery
  if (quiz.kind === "diagnostic") {
    const completed = await orm.QuizAttempts.where((a) =>
      and(a.userId.eq(user.userId), a.quizId.eq(quiz.quizId), a.completedAt.isNotNull()),
    ).first();
    if (completed) {
      throw httpError(409, "You have already completed the diagnostic");
    }
  }

  // An unfinished attempt whose time ran out is closed now (see closeAttemptIfTimeIsUp), so it
  // can't be resumed to keep working past the limit. The learner then gets a fresh attempt.
  const open = await findOpenAttempt(user.userId, quiz.quizId);
  if (open && !(await closeAttemptIfTimeIsUp(open))) {
    return { attempt: open, quiz, created: false };
  }

  const questions = await loadQuizQuestions(quiz.quizId);
  if (questions.length === 0) {
    throw httpError(409, "This quiz has no questions yet");
  }

  try {
    const attempt = await orm.QuizAttempts.create({
      userId: user.userId,
      quizId: quiz.quizId,
      completedAt: null,
      totalScore: null,
      maxScore: questions.length,
      masteryChanges: null,
    });
    return { attempt, quiz, created: true };
  } catch (err) {
    // Two starts at the same moment (a double click): the partial unique index let only one
    // insert through, so the other request resumes that attempt
    if (isUniqueViolation(err)) {
      const existing = await findOpenAttempt(user.userId, quiz.quizId);
      if (existing) return { attempt: existing, quiz, created: false };
    }
    throw err;
  }
};

// POST /attempts/{attemptId}/submit. Grades every answer, then closes the attempt, logs one
// question_responses row per answer and updates BKT, all in one transaction (finishAttempt).
// Skipped questions get no row and count as wrong. A late submit never gets here: the controller
// closes it first (closeAttemptIfTimeIsUp).
export const submitAttempt = async (attempt: OpenAttempt, responses: SubmittedResponse[]) => {
  if (attempt.completedAt !== null) {
    throw httpError(409, "This attempt has already been submitted");
  }

  const { questions, byId } = await questionMap(attempt.quizId);
  const { graded, totalScore } = gradeResponses(byId, responses);

  // maxScore is recounted so total_score <= max_score holds even if a question was removed
  // from the quiz while the attempt was open
  const closed = await finishAttempt(attempt, graded, {
    completedAt: Temporal.Now.instant(),
    totalScore,
    maxScore: questions.length,
  });
  if (!closed) {
    throw httpError(409, "This attempt has already been submitted");
  }
  return closed;
};

// ----- Autosave (PUT / GET /attempts/{attemptId}/answers) -----

// Replaces the saved answers with `responses`. An answer that didn't change keeps its savedAt,
// so the time limit knows when each answer was really given.
export const saveDraftAnswers = async (
  attempt: OpenAttempt,
  responses: Array<{ questionId: number; answer: Answer }>,
) => {
  if (attempt.completedAt !== null) {
    throw httpError(409, "This attempt has already been submitted");
  }
  if (await closeAttemptIfTimeIsUp(attempt)) {
    throw httpError(409, "Time is up: this attempt was closed");
  }

  const { byId } = await questionMap(attempt.quizId);
  for (const response of responses) {
    const question = byId.get(response.questionId);
    if (!question) {
      throw httpError(400, `Question ${response.questionId} is not in this quiz`);
    }
    checkAnswerShape(question.questionType, response.answer, question.questionId);
  }

  const now = Temporal.Now.instant();
  const row = await orm.QuizAttempts.first({ attemptId: attempt.attemptId });
  const previous = readDraft(row?.draftAnswers);
  const next: DraftAnswers = {};
  for (const response of responses) {
    const before = previous[String(response.questionId)];
    const unchanged = before && JSON.stringify(before.answer) === JSON.stringify(response.answer);
    next[String(response.questionId)] = {
      answer: response.answer,
      savedAt: unchanged ? before.savedAt : now.toString(),
    };
  }

  // Only while the attempt is still open: a submit at the same moment wins cleanly
  const saved = await orm.QuizAttempts.where((a) =>
    and(a.attemptId.eq(attempt.attemptId), a.completedAt.isNull()),
  ).updateAndCount({ draftAnswers: next as unknown as Json, draftSavedAt: now });
  if (saved === 0) {
    throw httpError(409, "This attempt has already been submitted");
  }
  return now;
};

export const getDraftAnswers = async (attempt: OpenAttempt) => {
  const row = (await orm.QuizAttempts.first({ attemptId: attempt.attemptId }))!;
  const quiz = await orm.Quizzes.first({ quizId: attempt.quizId });
  const deadlineMs = quiz ? deadlineOf(attempt, quiz) : null;
  const remainingSeconds =
    deadlineMs === null || row.completedAt !== null
      ? null
      : Math.max(0, Math.round((deadlineMs - Temporal.Now.instant().epochMilliseconds) / 1000));

  return {
    responses: Object.entries(readDraft(row.draftAnswers))
      .map(([questionId, saved]) => ({ questionId: Number(questionId), answer: saved.answer, savedAt: saved.savedAt }))
      .sort((a, b) => a.questionId - b.questionId),
    remainingSeconds,
    savedAt: row.draftSavedAt,
  };
};
