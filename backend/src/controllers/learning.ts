// The learner's adaptive dashboard: BKT mastery, recommendations, goal progress and lesson gates
import type { Request, Response } from "express";
import { getLearnerMastery } from "../services/bkt.ts";
import { findVisibleCourse } from "../services/courses.ts";
import { computeCourseLessonGates, getLearnerGoalAndProgress } from "../services/gating.ts";
import { getLatestRecommendations, markRecommendationClicked } from "../services/recommender.ts";

const getMyMastery = async (req: Request, res: Response) => {
  return res.status(200).json({
    mastery: await getLearnerMastery(req.user!.userId),
    message: "Your skill mastery",
  });
};

const getRecommendations = async (req: Request, res: Response) => {
  return res.status(200).json({
    recommendations: await getLatestRecommendations(req.user!.userId),
    message: "Recommendations",
  });
};

const clickRecommendation = async (req: Request, res: Response) => {
  await markRecommendationClicked(req.value!.params!.recommendationId, req.user!.userId);
  return res.status(200).json({ message: "Recommendation click recorded" });
};

const getMyProgress = async (req: Request, res: Response) => {
  const [progress, recommendations] = await Promise.all([
    getLearnerGoalAndProgress(req.user!.userId),
    getLatestRecommendations(req.user!.userId),
  ]);
  return res.status(200).json({
    progress,
    nextBestStep: recommendations[0] ?? null,
    recommendations,
    message: "Learner goal and progress",
  });
};

// Approved courses only: learners can't see others, so they get the same 404 as a missing course
const getCourseGates = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  const gates = await computeCourseLessonGates(req.user!.userId, course.courseId);
  return res.status(200).json({
    courseId: course.courseId,
    gates: Array.from(gates.values()),
    message: "Course lesson gates",
  });
};

export default { getMyMastery, getRecommendations, clickRecommendation, getMyProgress, getCourseGates };
