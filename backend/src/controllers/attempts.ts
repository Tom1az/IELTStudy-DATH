import type { Request, Response } from "express";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { buildAttemptResult, buildAttemptSummaries, toAttempt } from "../services/attempt-views.ts";
import {
  closeAttemptIfTimeIsUp,
  findOwnAttempt,
  startOrResumeAttempt,
  submitAttempt,
} from "../services/attempts.ts";
import type { SubmittedResponse } from "../services/attempts.ts";
import { buildQuiz } from "../services/quiz-views.ts";

const orm = db.orm.public;

// Starts a quiz, or resumes my unfinished attempt. The questions come without answers.
const startAttempt = async (req: Request, res: Response) => {
  const { attempt, quiz, created } = await startOrResumeAttempt(
    req.value!.params!.quizId,
    req.user!,
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

  const closed = await submitAttempt(attempt, responses);

  return res.status(200).json({
    result: await buildAttemptResult(closed),
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

  return res.status(200).json({
    result: await buildAttemptResult(attempt),
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
