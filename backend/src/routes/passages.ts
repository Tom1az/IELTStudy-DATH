import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, schemas } from "../utils/validator.ts";

import passagesController from "../controllers/passages.ts";

const router = express.Router();

// Learners never call these: they see passages inside lessons and quizzes
router.use(authenticate, authorize("instructor", "admin"));

const passageId = validateParams(schemas.idSchema, "passageId");

router.post("/", validateBody(schemas.passageInputSchema), passagesController.createPassage);

router
  .route("/:passageId")
  .get(passageId, passagesController.getPassage)
  .patch(passageId, validateBody(schemas.passageUpdateSchema), passagesController.updatePassage)
  .delete(passageId, passagesController.deletePassage);

export default router;
