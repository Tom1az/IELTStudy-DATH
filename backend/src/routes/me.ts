import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateQuery, schemas } from "../utils/validator.ts";

import attemptsController from "../controllers/attempts.ts";
import meController from "../controllers/me.ts";

const router = express.Router();

// Every role may read and edit their own profile, so only `authenticate` is needed
router.use(authenticate);

router
  .route("/")
  .get(meController.getMe)
  .patch(validateBody(schemas.profileUpdateSchema), meController.updateMe);

// Only learners enrol in courses
router.get("/enrollments", authorize("learner"), meController.listMyEnrollments);

// Only learners take quizzes
router.get(
  "/attempts",
  authorize("learner"),
  validateQuery(schemas.myAttemptsQuerySchema),
  attemptsController.listMyAttempts,
);

export default router;
