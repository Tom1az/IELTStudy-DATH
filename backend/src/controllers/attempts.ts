import type { Request, Response } from "express";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { buildAttemptResult, buildAttemptSummaries, toAttempt } from "../services/attempt-views.ts";
import {
  closeAttemptIfTimeIsUp,
  findOwnAttempt,
  getDraftAnswers,
  saveDraftAnswers,
  startOrResumeAttempt,
  submitAttempt,
} from "../services/attempts.ts";
import type { Answer } from "../services/grading.ts";
import type { SubmittedResponse } from "../services/attempts.ts";
import { buildQuiz } from "../services/quiz-views.ts";
import { httpError } from "../utils/http-error.ts";
import { pageMeta, pageWindow } from "../utils/pagination.ts";
import type { PageQuery } from "../utils/pagination.ts";

const orm = db.orm.public;

// Starts a quiz, or resumes my unfinished attempt. The questions come without answers.
const startAttempt = async (req: Request, res: Response) => {
  const { attempt, quiz, created } = await startOrResumeAttempt(req.value!.params!.quizId, req.user!);

  return res.status(created ? 201 : 200).json({
    attempt: toAttempt(attempt),
    quiz: await buildQuiz(quiz, "learner"),
    message: created ? "Attempt started" : "Attempt resumed",
  });
};

// Grades my answers, updates my mastery and recommendations, and returns the full result for
// the post-quiz review
const submitMyAttempt = async (req: Request, res: Response) => {
  const attempt = await findOwnAttempt(req.value!.params!.attemptId, req.user!);
  const { responses }: { responses: SubmittedResponse[] } = req.value!.body;

  if (await closeAttemptIfTimeIsUp(attempt)) {
    throw httpError(409, "Time is up: this attempt was closed");
  }

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

// Autosave: the answers on my open attempt
const putDraftAnswers = async (req: Request, res: Response) => {
  const attempt = await findOwnAttempt(req.value!.params!.attemptId, req.user!);
  const { responses }: { responses: Array<{ questionId: number; answer: Answer }> } = req.value!.body;
  const savedAt = await saveDraftAnswers(attempt, responses);
  return res.status(200).json({ savedAt, message: "Answers saved" });
};

const getMyDraftAnswers = async (req: Request, res: Response) => {
  const attempt = await findOwnAttempt(req.value!.params!.attemptId, req.user!);
  return res.status(200).json({ ...(await getDraftAnswers(attempt)), message: "Saved answers" });
};

// My attempt history, newest first, one page at a time, optionally for one quiz or status
const listMyAttempts = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const {
    quizId,
    status,
    ...paging
  }: { quizId?: number; status?: "in_progress" | "completed" } & PageQuery = req.value!.query;

  // Only the filters that were given go into the WHERE clause
  const query = orm.QuizAttempts.where((a) =>
    and(
      a.userId.eq(userId),
      quizId !== undefined ? a.quizId.eq(quizId) : a.attemptId.isNotNull(),
      status === "completed"
        ? a.completedAt.isNotNull()
        : status === "in_progress"
          ? a.completedAt.isNull()
          : a.attemptId.isNotNull(),
    ),
  );
  const { limit, offset } = pageWindow(paging);
  const [{ count }, rows] = await Promise.all([
    query.aggregate((agg) => ({ count: agg.count() })),
    query
      .orderBy([(a) => a.startedAt.desc(), (a) => a.attemptId.desc()])
      .limit(limit)
      .offset(offset)
      .all(),
  ]);

  return res.status(200).json({
    attempts: await buildAttemptSummaries(rows),
    ...pageMeta(count, paging),
    message: "My attempts",
  });
};

export default {
  startAttempt,
  submitMyAttempt,
  getAttempt,
  putDraftAnswers,
  getMyDraftAnswers,
  listMyAttempts,
};
