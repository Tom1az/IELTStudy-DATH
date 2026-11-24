import express from "express";
import { authenticate } from "../middlewares/auth.ts";
import { validateBody, validateParams, schemas } from "../utils/validator.ts";

import discussionController from "../controllers/discussion.ts";

// PATCH / DELETE /comments/{commentId}. Listing and posting live under /lessons/{lessonId}/comments
// (routes/lessons.ts); who may do what is checked in services/comments.ts.
const commentsRouter = express.Router();
commentsRouter.use(authenticate);
const commentId = validateParams(schemas.idSchema, "commentId");
commentsRouter
  .route("/:commentId")
  .patch(commentId, validateBody(schemas.commentUpdateSchema), discussionController.patchComment)
  .delete(commentId, discussionController.deleteComment);

// POST /reports: any logged-in user
const reportsRouter = express.Router();
reportsRouter.post(
  "/",
  authenticate,
  validateBody(schemas.reportInputSchema),
  discussionController.postReport,
);

export { commentsRouter, reportsRouter };
