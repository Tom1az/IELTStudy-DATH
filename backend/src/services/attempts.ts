// Rules for taking a quiz, used by controllers/attempts.ts. They come from the API contract
// (Attempts) and docs/ERD.md ("Rules the database enforces", "One completed diagnostic").
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { isUniqueViolation } from "../utils/db-errors.ts";
import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { checkAnswerShape, isAnswerCorrect } from "./grading.ts";
import type { Answer } from "./grading.ts";
import { assertCanStudy } from "./courses.ts";
import { loadQuizQuestions } from "./quiz-views.ts";
import type { QuestionRow } from "./quiz-views.ts";
import { findVisibleQuiz } from "./quizzes.ts";

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

// A submit that arrives this many seconds after the time limit is still treated as on time.
// It covers network delay between the learner's timer reaching zero and the request arriving.
const GRACE_SECONDS = 30;

// The time limit rule (spec: quizzes have an optional time limit, enforced by the server):
// - A submit that arrives late is still graded with whatever answers it contains
//   ("graded as far as the learner got"). It is never rejected.
// - An attempt that is never submitted is closed by the server the next time anyone opens it,
//   with score 0, because the server only receives answers at submit time. Its completed_at
//   is the deadline, not the moment we noticed.
// - Not for the diagnostic: an empty, completed diagnostic would block a retake for good (409)
//   and seed the learner's mastery with zeros.
// Returns true if this call closed the attempt.
export const closeAttemptIfTimeIsUp = async (attempt: {
  attemptId: number;
  quizId: number;
  startedAt: Temporal.Instant;
  completedAt: Temporal.Instant | null;
}) => {
  if (attempt.completedAt !== null) {
    return false;
  }

  const quiz = await orm.Quizzes.first({ quizId: attempt.quizId });
  if (!quiz || quiz.kind === "diagnostic" || quiz.timeLimitSeconds === null) {
    return false;
  }

  const deadlineMs = attempt.startedAt.epochMilliseconds + quiz.timeLimitSeconds * 1000;
  const lastAcceptedMs = deadlineMs + GRACE_SECONDS * 1000;
  if (Temporal.Now.instant().epochMilliseconds <= lastAcceptedMs) {
    return false;
  }

  // One UPDATE ... WHERE completed_at IS NULL (updateAndCount), so a submit that arrives at the
  // same moment wins or loses cleanly: only one of the two closes the attempt.
  const closedCount = await orm.QuizAttempts.where((a) =>
    and(a.attemptId.eq(attempt.attemptId), a.completedAt.isNull()),
  ).updateAndCount({
    completedAt: Temporal.Instant.fromEpochMilliseconds(deadlineMs),
    totalScore: 0,
  });
  return closedCount > 0;
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
  // learner isn't enrolled. The diagnostic has no course, so every learner may take it.
  const { quiz, course } = await findVisibleQuiz(quizId, user);
  if (course !== null) {
    await assertCanStudy(course, user);
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

// POST /attempts/{attemptId}/submit. Grades every answer, then closes the attempt and logs one
// question_responses row per answer, all in one transaction. Skipped questions get no row and
// count as wrong. Returns the closed attempt. A late submit is graded like any other: it
// grades what the learner got to (time limit rule: closeAttemptIfTimeIsUp).
export const submitAttempt = async (
  attempt: { attemptId: number; quizId: number; completedAt: Temporal.Instant | null },
  responses: SubmittedResponse[],
) => {
  if (attempt.completedAt !== null) {
    throw httpError(409, "This attempt has already been submitted");
  }

  const questions = await loadQuizQuestions(attempt.quizId);
  const questionById = new Map<number, QuestionRow>();
  for (const question of questions) {
    questionById.set(question.questionId, question);
  }

  // Grade on the server; the client never sends isCorrect. Joi has already rejected a
  // questionId sent twice.
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
      // 1 = answered first: the position in the submitted array
      attemptOrder: index + 1,
      responseTimeSeconds: response.responseTimeSeconds ?? null,
    });
  }

  return db.transaction(async (tx) => {
    // Close the attempt first, and only if it is still open. This must be ONE SQL statement,
    // UPDATE ... WHERE attempt_id = ? AND completed_at IS NULL, so we use updateAndCount:
    // the ORM's update() reads the matching row first and then updates it by id alone, which
    // lets two parallel submits both pass the check. With one statement, Postgres makes the
    // second submit wait for the first, then finds completed_at already set and updates
    // nothing, so only one set of responses is ever written.
    // maxScore is recounted so total_score <= max_score holds even if a question was removed
    // from the quiz while the attempt was open.
    const closedCount = await tx.orm.public.QuizAttempts.where((a) =>
      and(a.attemptId.eq(attempt.attemptId), a.completedAt.isNull()),
    ).updateAndCount({
      completedAt: Temporal.Now.instant(),
      totalScore,
      maxScore: questions.length,
    });
    if (closedCount === 0) {
      throw httpError(409, "This attempt has already been submitted");
    }

    for (const row of graded) {
      await tx.orm.public.QuestionResponses.create({ attemptId: attempt.attemptId, ...row });
    }

    // Phase 3: the BKT mastery update (services/bkt.ts) goes here, in the same transaction
    // We closed this row a moment ago in this transaction, so it exists
    const closed = await tx.orm.public.QuizAttempts.first({ attemptId: attempt.attemptId });
    return closed!;
  });
};
