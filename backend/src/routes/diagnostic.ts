import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";

import quizzesController from "../controllers/quizzes.ts";

const router = express.Router();

router.get("/", authenticate, authorize("learner"), quizzesController.getDiagnostic);

export default router;
