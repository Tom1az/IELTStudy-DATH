import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, validateQuery, schemas } from "../utils/validator.ts";

import coursesController from "../controllers/courses.ts";
import gradingController from "../controllers/grading.ts";

const router = express.Router();

router.use(authenticate, authorize("instructor"));

router.get("/courses", coursesController.listMyCourses);

// Grading: submitted attempts on my quizzes, my feedback, my learners
const attemptId = validateParams(schemas.idSchema, "attemptId");
router.get(
  "/submissions",
  validateQuery(schemas.submissionsQuerySchema),
  gradingController.listMySubmissions,
);
router.get("/submissions/:attemptId", attemptId, gradingController.getSubmission);
router.put(
  "/submissions/:attemptId/feedback",
  attemptId,
  validateBody(schemas.feedbackInputSchema),
  gradingController.putFeedback,
);
router.get("/learners", gradingController.listLearners);

export default router;
