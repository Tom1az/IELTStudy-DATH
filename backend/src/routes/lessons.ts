import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, schemas } from "../utils/validator.ts";

import lessonsController from "../controllers/lessons.ts";

const router = express.Router();

router.use(authenticate);

const lessonId = validateParams(schemas.idSchema, "lessonId");

router
  .route("/:lessonId")
  .get(lessonId, lessonsController.getLesson)
  .patch(
    authorize("instructor"),
    lessonId,
    validateBody(schemas.lessonUpdateSchema),
    lessonsController.updateLesson,
  )
  .delete(authorize("instructor"), lessonId, lessonsController.deleteLesson);

router.put(
  "/:lessonId/progress",
  authorize("learner"),
  lessonId,
  validateBody(schemas.progressInputSchema),
  lessonsController.setLessonProgress,
);

export default router;
