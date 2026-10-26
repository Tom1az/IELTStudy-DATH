import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, validateQuery, schemas } from "../utils/validator.ts";

import adminController from "../controllers/admin.ts";
import coursesController from "../controllers/courses.ts";

const router = express.Router();

router.use(authenticate, authorize("admin"));

router.get("/users", validateQuery(schemas.adminUsersQuerySchema), adminController.listUsers);

router.patch(
  "/users/:userId",
  validateParams(schemas.idSchema, "userId"),
  validateBody(schemas.adminUserUpdateSchema),
  adminController.updateUserAccess,
);

// The review queue is `?status=pending_review`
router.get(
  "/courses",
  validateQuery(schemas.courseStatusQuerySchema),
  coursesController.listAllCourses,
);

router.get("/stats", adminController.getStats);

export default router;
