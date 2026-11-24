import type { Request, Response } from "express";
import { buildAttemptResult } from "../services/attempt-views.ts";
import { findOwnAttempt } from "../services/attempts.ts";
import {
  findMySubmission,
  getAttemptFeedback,
  listMyLearners,
  listSubmissions,
  saveFeedback,
} from "../services/grading-review.ts";

const listMySubmissions = async (req: Request, res: Response) => {
  const { courseId, quizId }: { courseId?: number; quizId?: number } = req.value!.query;
  return res.status(200).json({
    submissions: await listSubmissions(req.user!.userId, { courseId, quizId }),
    message: "Submissions",
  });
};

const getSubmission = async (req: Request, res: Response) => {
  const { attempt, submission } = await findMySubmission(
    req.user!.userId,
    req.value!.params!.attemptId,
  );
  return res.status(200).json({
    result: await buildAttemptResult(attempt),
    submission,
    message: "Submission",
  });
};

const putFeedback = async (req: Request, res: Response) => {
  const { comment, totalScore }: { comment: string; totalScore?: number | null } = req.value!.body;
  const feedback = await saveFeedback(req.user!, req.value!.params!.attemptId, {
    comment,
    totalScore: totalScore ?? null,
  });
  return res.status(200).json({ feedback, message: "Feedback saved" });
};

const listLearners = async (req: Request, res: Response) => {
  return res.status(200).json({
    learners: await listMyLearners(req.user!.userId),
    message: "Your learners",
  });
};

// The learner's own view (or an admin's)
const getMyAttemptFeedback = async (req: Request, res: Response) => {
  const attempt = await findOwnAttempt(req.value!.params!.attemptId, req.user!);
  return res.status(200).json({
    feedback: await getAttemptFeedback(attempt.attemptId),
    message: "Feedback",
  });
};

export default { listMySubmissions, getSubmission, putFeedback, listLearners, getMyAttemptFeedback };
