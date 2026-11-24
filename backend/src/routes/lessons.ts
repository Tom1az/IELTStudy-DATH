import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, validateQuery, schemas } from "../utils/validator.ts";

import discussionController from "../controllers/discussion.ts";
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

// The lesson's discussion: whoever may open the lesson (services/comments.ts)
router
  .route("/:lessonId/comments")
  .get(
    validateParams(schemas.idSchema, "lessonId"),
    validateQuery(schemas.commentListQuerySchema),
    discussionController.listLessonComments,
  )
  .post(
    validateParams(schemas.idSchema, "lessonId"),
    validateBody(schemas.commentInputSchema),
    discussionController.postLessonComment,
  );

export default router;
