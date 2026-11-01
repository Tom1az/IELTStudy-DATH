import type { Request, Response } from "express";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { buildAttemptResult, buildAttemptSummaries, toAttempt } from "../services/attempt-views.ts";
import { fetchAttemptOutcome, processAttemptWithAdvanced } from "../services/advanced-client.ts";
import {
  closeAttemptIfTimeIsUp,
  findOwnAttempt,
  startOrResumeAttempt,
  submitAttempt,
} from "../services/attempts.ts";
import type { SubmittedResponse } from "../services/attempts.ts";
import { buildQuiz } from "../services/quiz-views.ts";
import { httpError } from "../utils/http-error.ts";

const orm = db.orm.public;

// Starts a quiz, or resumes my unfinished attempt. The questions come without answers.
const startAttempt = async (req: Request, res: Response) => {
  const { attempt, quiz, created } = await startOrResumeAttempt(
    req.value!.params!.quizId,
    req.user!,
    req.headers.authorization,
  );

  return res.status(created ? 201 : 200).json({
    attempt: toAttempt(attempt),
    quiz: await buildQuiz(quiz, "learner"),
    message: created ? "Attempt started" : "Attempt resumed",
  });
};

// Grades my answers and returns the full result for the post-quiz review
const submitMyAttempt = async (req: Request, res: Response) => {
  const attempt = await findOwnAttempt(req.value!.params!.attemptId, req.user!);
  const { responses }: { responses: SubmittedResponse[] } = req.value!.body;

  if (await closeAttemptIfTimeIsUp(attempt)) {
    throw httpError(409, "Time is up: this attempt was closed");
  }

  const closed = await submitAttempt(attempt, responses);
  const result = await buildAttemptResult(closed);

  // Phase 3: ask the Advanced service to update the learner's BKT mastery and recommendations.
  // The submit is already saved, so if Advanced is unavailable the lists simply stay empty.
  const advanced = await processAttemptWithAdvanced(closed.attemptId, req.headers.authorization);

  return res.status(200).json({
    result: advanced
      ? {
          ...result,
          masteryChanges: advanced.masteryChanges,
          recommendations: advanced.recommendations,
        }
      : result,
    message: "Attempt submitted",
  });
};

// The graded result once submitted; before that, the open attempt without answers
const getAttempt = async (req: Request, res: Response) => {
  let attempt = await findOwnAttempt(req.value!.params!.attemptId, req.user!);
  // An unfinished attempt that ran out of time is closed here, so it shows as submitted
  if (await closeAttemptIfTimeIsUp(attempt)) {
    attempt = await findOwnAttempt(attempt.attemptId, req.user!);
  }
  const result = await buildAttemptResult(attempt);

  // A submitted attempt was normally processed by the Advanced service at submit time: read back
  // what it stored, so the post-quiz review still shows the skill changes and recommendations.
  // Nothing stored means Advanced was down then, so process it now. Advanced applies an attempt
  // once and ignores one with no answers, so this is safe to repeat on every read.
  let advanced = null;
  if (attempt.completedAt !== null) {
    advanced =
      attempt.masteryChanges === null
        ? await processAttemptWithAdvanced(attempt.attemptId, req.headers.authorization)
        : await fetchAttemptOutcome(attempt.attemptId, req.headers.authorization);
  }

  return res.status(200).json({
    result: advanced
      ? {
          ...result,
          masteryChanges: advanced.masteryChanges,
          recommendations: advanced.recommendations,
        }
      : result,
    message: "Attempt",
  });
};

// My attempt history, newest first, optionally for one quiz
const listMyAttempts = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { quizId }: { quizId?: number } = req.value!.query ?? {};

  const query =
    quizId === undefined
      ? orm.QuizAttempts.where({ userId })
      : orm.QuizAttempts.where((a) => and(a.userId.eq(userId), a.quizId.eq(quizId)));
  const rows = await query.orderBy([(a) => a.startedAt.desc(), (a) => a.attemptId.desc()]).all();

  return res.status(200).json({
    attempts: await buildAttemptSummaries(rows),
    message: "My attempts",
  });
};

export default {
  startAttempt,
  submitMyAttempt,
  getAttempt,
  listMyAttempts,
};
