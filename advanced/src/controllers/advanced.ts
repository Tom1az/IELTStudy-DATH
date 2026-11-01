import type { Request, Response } from "express";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import { getLearnerMastery, processAttemptMastery } from "../services/bkt.ts";
import { computeCourseLessonGates, getLearnerGoalAndProgress } from "../services/gating.ts";
import {
  buildRecommendationViews,
  generateRecommendationsForLearner,
  getLatestRecommendations,
  markRecommendationClicked,
} from "../services/recommender.ts";

const orm = db.orm.public;

const getMyMastery = async (req: Request, res: Response) => {
  const mastery = await getLearnerMastery(req.user!.userId);
  return res.status(200).json({
    mastery,
    message: "Your skill mastery",
  });
};

const getRecommendations = async (req: Request, res: Response) => {
  const recommendations = await getLatestRecommendations(req.user!.userId);
  return res.status(200).json({
    recommendations,
    message: "Recommendations",
  });
};

const clickRecommendation = async (req: Request, res: Response) => {
  const recommendationId = req.value!.params!.recommendationId;
  await markRecommendationClicked(recommendationId, req.user!.userId);
  return res.status(200).json({
    message: "Recommendation click recorded",
  });
};

const processPlacement = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const diagnostic = await orm.Quizzes.first({ kind: "diagnostic" });
  if (!diagnostic) {
    throw httpError(404, "The diagnostic hasn't been set up yet");
  }

  const completedAttempt = await orm.QuizAttempts.where((a) =>
    and(a.userId.eq(userId), a.quizId.eq(diagnostic.quizId), a.completedAt.isNotNull()),
  ).first();

  if (!completedAttempt) {
    throw httpError(409, "Complete and submit the diagnostic quiz first");
  }

  const masteryChanges = await processAttemptMastery(completedAttempt.attemptId);
  const recommendations = await generateRecommendationsForLearner(userId, {
    sourceAttemptId: completedAttempt.attemptId,
  });

  return res.status(200).json({
    attemptId: completedAttempt.attemptId,
    masteryChanges,
    recommendations,
    mastery: await getLearnerMastery(userId),
    message: "Placement mastery initialized",
  });
};

const processAttempt = async (req: Request, res: Response) => {
  const attemptId = req.value!.params!.attemptId;
  const attempt = await orm.QuizAttempts.first({ attemptId });
  if (!attempt) {
    throw httpError(404, "Attempt not found");
  }
  if (req.user!.role !== "admin" && attempt.userId !== req.user!.userId) {
    throw httpError(403, "This is another learner's attempt");
  }
  if (attempt.completedAt === null) {
    throw httpError(409, "Attempt has not been submitted yet");
  }

  const masteryChanges = await processAttemptMastery(attemptId);
  const recommendations = await generateRecommendationsForLearner(attempt.userId, {
    sourceAttemptId: attemptId,
  });

  return res.status(200).json({
    attemptId,
    masteryChanges,
    recommendations,
    message: "Attempt mastery processed",
  });
};

// Read-only: what BKT already stored for a submitted attempt (skill changes + the recommendations it
// produced). Unlike `processAttempt` it never recomputes mastery, so it is safe to call every time
// the post-quiz review is opened.
const getAttemptOutcome = async (req: Request, res: Response) => {
  const attemptId = req.value!.params!.attemptId;
  const attempt = await orm.QuizAttempts.first({ attemptId });
  if (!attempt) {
    throw httpError(404, "Attempt not found");
  }
  if (req.user!.role !== "admin" && attempt.userId !== req.user!.userId) {
    throw httpError(403, "This is another learner's attempt");
  }
  if (attempt.completedAt === null) {
    throw httpError(409, "Attempt has not been submitted yet");
  }

  const stored = (Array.isArray(attempt.masteryChanges) ? attempt.masteryChanges : []) as unknown as Array<{
    skillId: number;
    before: number | null;
    after: number;
  }>;
  const skillIds = stored.map((c) => c.skillId);
  const skills = skillIds.length > 0 ? await orm.Skills.where((s) => s.skillId.in(skillIds)).all() : [];
  const skillById = new Map(skills.map((s) => [s.skillId, s]));

  const masteryChanges = [];
  for (const change of stored) {
    const skill = skillById.get(change.skillId);
    if (!skill) continue;
    masteryChanges.push({
      skillId: change.skillId,
      skillCode: skill.skillCode,
      name: skill.name,
      before: change.before,
      after: change.after,
    });
  }

  const rows = await orm.Recommendations.where({ userId: attempt.userId, sourceAttemptId: attemptId })
    .orderBy((r) => r.rank.asc())
    .all();

  return res.status(200).json({
    attemptId,
    masteryChanges,
    recommendations: await buildRecommendationViews(rows),
    message: "Attempt mastery",
  });
};

const getMyProgress = async (req: Request, res: Response) => {
  const progress = await getLearnerGoalAndProgress(req.user!.userId);
  const recommendations = await getLatestRecommendations(req.user!.userId);
  return res.status(200).json({
    progress,
    nextBestStep: recommendations[0] ?? null,
    recommendations,
    message: "Learner goal and progress",
  });
};

const getCourseGates = async (req: Request, res: Response) => {
  const courseId = req.value!.params!.courseId;
  const gatesMap = await computeCourseLessonGates(req.user!.userId, courseId);
  return res.status(200).json({
    courseId,
    gates: Array.from(gatesMap.values()),
    message: "Course lesson gates",
  });
};

export default {
  getMyMastery,
  getRecommendations,
  clickRecommendation,
  processPlacement,
  processAttempt,
  getAttemptOutcome,
  getMyProgress,
  getCourseGates,
};
