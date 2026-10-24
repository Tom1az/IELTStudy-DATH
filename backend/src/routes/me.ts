import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, schemas } from "../utils/validator.ts";

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

export default router;
