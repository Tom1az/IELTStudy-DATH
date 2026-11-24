import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, schemas } from "../utils/validator.ts";

import attemptsController from "../controllers/attempts.ts";
import gradingController from "../controllers/grading.ts";

const router = express.Router();

// Learners read and submit their own attempts; admins may read anyone's.
// Starting an attempt is POST /quizzes/{quizId}/attempts (routes/quizzes.ts).
router.use(authenticate);

const attemptId = validateParams(schemas.idSchema, "attemptId");

router.get("/:attemptId", authorize("learner", "admin"), attemptId, attemptsController.getAttempt);

router.post(
  "/:attemptId/submit",
  authorize("learner"),
  attemptId,
  validateBody(schemas.submitAttemptSchema),
  attemptsController.submitMyAttempt,
);

router.get(
  "/:attemptId/feedback",
  authorize("learner", "admin"),
  attemptId,
  gradingController.getMyAttemptFeedback,
);

export default router;
