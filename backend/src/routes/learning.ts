import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateParams, schemas } from "../utils/validator.ts";

import learningController from "../controllers/learning.ts";

// GET /recommendations, POST /recommendations/{id}/click and GET /progress/me (learners only).
// GET /me/mastery is in routes/me.ts and GET /courses/{id}/gates in routes/courses.ts.
const recommendationsRouter = express.Router();
recommendationsRouter.use(authenticate, authorize("learner"));
recommendationsRouter.get("/", learningController.getRecommendations);
recommendationsRouter.post(
  "/:recommendationId/click",
  validateParams(schemas.idSchema, "recommendationId"),
  learningController.clickRecommendation,
);

const progressRouter = express.Router();
progressRouter.get("/me", authenticate, authorize("learner"), learningController.getMyProgress);

export { recommendationsRouter, progressRouter };
