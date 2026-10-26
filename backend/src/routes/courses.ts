import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, validateParams, validateQuery, schemas } from "../utils/validator.ts";

import coursesController from "../controllers/courses.ts";
import lessonsController from "../controllers/lessons.ts";

const router = express.Router();

// Every course route needs a logged-in user. Ownership ("only the course's instructor")
// is checked in the controllers.
router.use(authenticate);

const courseId = validateParams(schemas.idSchema, "courseId");

router
  .route("/")
  .get(validateQuery(schemas.catalogQuerySchema), coursesController.listCatalog)
  .post(
    authorize("instructor"),
    validateBody(schemas.courseInputSchema),
    coursesController.createCourse,
  );

router
  .route("/:courseId")
  .get(courseId, coursesController.getCourse)
  .patch(
    authorize("instructor"),
    courseId,
    validateBody(schemas.courseUpdateSchema),
    coursesController.updateCourse,
  )
  .delete(authorize("instructor"), courseId, coursesController.deleteCourse);

// The review flow: draft -> pending_review -> approved | rejected
router.post("/:courseId/submit", authorize("instructor"), courseId, coursesController.submitCourse);
router.post(
  "/:courseId/withdraw",
  authorize("instructor"),
  courseId,
  coursesController.withdrawCourse,
);
router.post(
  "/:courseId/approve",
  authorize("admin"),
  courseId,
  validateBody(schemas.approveInputSchema),
  coursesController.approveCourse,
);
router.post(
  "/:courseId/reject",
  authorize("admin"),
  courseId,
  validateBody(schemas.rejectInputSchema),
  coursesController.rejectCourse,
);
router.post(
  "/:courseId/archive",
  authorize("instructor", "admin"),
  courseId,
  coursesController.archiveCourse,
);
router.post("/:courseId/enroll", authorize("learner"), courseId, coursesController.enrollInCourse);

// Lessons are listed and created under their course
router
  .route("/:courseId/lessons")
  .get(courseId, lessonsController.listLessons)
  .post(
    authorize("instructor"),
    courseId,
    validateBody(schemas.lessonInputSchema),
    lessonsController.createLesson,
  );

export default router;
