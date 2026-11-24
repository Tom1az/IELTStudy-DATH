import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, validateQuery, schemas } from "../utils/validator.ts";

import attemptsController from "../controllers/attempts.ts";
import learningController from "../controllers/learning.ts";
import meController from "../controllers/me.ts";
import notificationsController from "../controllers/notifications.ts";

const router = express.Router();

// Every role may read and edit their own profile, so only `authenticate` is needed
router.use(authenticate);

router
  .route("/")
  .get(meController.getMe)
  .patch(validateBody(schemas.profileUpdateSchema), meController.updateMe);

// Only learners enroll in courses
router.get("/enrollments", authorize("learner"), meController.listMyEnrollments);

// BKT mastery per skill (the radar chart)
router.get("/mastery", authorize("learner"), learningController.getMyMastery);

// Only learners take quizzes
router.get(
  "/attempts",
  authorize("learner"),
  validateQuery(schemas.myAttemptsQuerySchema),
  attemptsController.listMyAttempts,
);

// Every role gets notifications
router.get(
  "/notifications",
  validateQuery(schemas.notificationsQuerySchema),
  notificationsController.listMine,
);
// Before the `/:notificationId` route, so "read-all" is never read as an id
router.post("/notifications/read-all", notificationsController.markEveryRead);
router.patch(
  "/notifications/:notificationId/read",
  validateParams(schemas.idSchema, "notificationId"),
  notificationsController.markOneRead,
);

export default router;
