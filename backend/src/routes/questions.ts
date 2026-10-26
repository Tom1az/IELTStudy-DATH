import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, validateQuery, schemas } from "../utils/validator.ts";

import questionsController from "../controllers/questions.ts";

const router = express.Router();

// The question bank is for authors only. Learners see questions inside quizzes, without answers.
router.use(authenticate, authorize("instructor", "admin"));

const questionId = validateParams(schemas.idSchema, "questionId");

router
  .route("/")
  .get(validateQuery(schemas.questionQuerySchema), questionsController.listQuestions)
  .post(validateBody(schemas.questionInputSchema), questionsController.createQuestion);

router
  .route("/:questionId")
  .get(questionId, questionsController.getQuestion)
  .patch(questionId, validateBody(schemas.questionUpdateSchema), questionsController.updateQuestion)
  .delete(questionId, questionsController.deleteQuestion);

export default router;
