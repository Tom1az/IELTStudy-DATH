import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, validateQuery, schemas } from "../utils/validator.ts";

import adminController from "../controllers/admin.ts";
import coursesController from "../controllers/courses.ts";
import discussionController from "../controllers/discussion.ts";

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

router.get("/audit", validateQuery(schemas.auditQuerySchema), adminController.listAudit);

// The moderation queue
router.get("/reports", validateQuery(schemas.reportListQuerySchema), discussionController.getReports);
router.patch(
  "/reports/:reportId",
  validateParams(schemas.idSchema, "reportId"),
  validateBody(schemas.reportUpdateSchema),
  discussionController.patchReport,
);

export default router;
