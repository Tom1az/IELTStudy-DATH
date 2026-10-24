import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateQuery, schemas } from "../utils/validator.ts";

import coursesController from "../controllers/courses.ts";

const router = express.Router();

router.use(authenticate, authorize("admin"));

// The review queue is `?status=pending_review`
router.get(
  "/courses",
  validateQuery(schemas.courseStatusQuerySchema),
  coursesController.listAllCourses,
);

export default router;
