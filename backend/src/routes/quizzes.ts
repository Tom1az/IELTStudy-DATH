import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, schemas } from "../utils/validator.ts";

import quizzesController from "../controllers/quizzes.ts";

const router = express.Router();

// Everyone may read a quiz (the controller picks the author or learner view).
// Only instructors and admins write them; ownership is checked in the controller.
router.use(authenticate);

const quizId = validateParams(schemas.idSchema, "quizId");

router.post(
  "/",
  authorize("instructor", "admin"),
  validateBody(schemas.quizInputSchema),
  quizzesController.createQuiz,
);

router
  .route("/:quizId")
  .get(quizId, quizzesController.getQuiz)
  .patch(
    authorize("instructor", "admin"),
    quizId,
    validateBody(schemas.quizUpdateSchema),
    quizzesController.updateQuiz,
  )
  .delete(authorize("instructor", "admin"), quizId, quizzesController.deleteQuiz);

export default router;
