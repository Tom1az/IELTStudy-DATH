import type { Request, Response } from "express";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "../prisma/db.ts";
import { buildCourse, buildCourses, buildEnrollments } from "../services/course-views.ts";
import {
  assertCourseOwner,
  assertEditable,
  changeCourseStatus,
  findVisibleCourse,
  isCourseOwner,
} from "../services/courses.ts";
import type { CourseLevel, CourseStatus } from "../services/courses.ts";
import { isUniqueViolation } from "../utils/db-errors.ts";
import { varchar } from "../utils/db-types.ts";
import { httpError } from "../utils/http-error.ts";

const Courses = db.orm.public.Courses;
const Lessons = db.orm.public.Lessons;
const Enrollments = db.orm.public.Enrollments;

// The approved catalog, optionally filtered by level
const listCatalog = async (req: Request, res: Response) => {
  const { level }: { level?: CourseLevel } = req.value!.query;

  const rows = level
    ? await Courses.where({ status: "approved", targetLevel: level })
        .orderBy((c) => c.courseId.asc())
        .all()
    : await Courses.where({ status: "approved" })
        .orderBy((c) => c.courseId.asc())
        .all();

  return res.status(200).json({
    courses: await buildCourses(rows, req.user!),
    message: "Approved courses",
  });
};

// The instructor's own courses, in every status
const listMyCourses = async (req: Request, res: Response) => {
  const rows = await Courses.where({ instructorId: req.user!.userId })
    .orderBy((c) => c.courseId.asc())
    .all();

  return res.status(200).json({
    courses: await buildCourses(rows, req.user!),
    message: "Your courses",
  });
};

// Every course, for admins. `?status=pending_review` is the review queue, oldest submission first.
const listAllCourses = async (req: Request, res: Response) => {
  const { status }: { status?: CourseStatus } = req.value!.query;

  const rows = status
    ? await Courses.where({ status })
        .orderBy([(c) => c.submittedAt.asc({ nulls: "last" }), (c) => c.courseId.asc()])
        .all()
    : await Courses.orderBy((c) => c.courseId.asc()).all();

  return res.status(200).json({
    courses: await buildCourses(rows, req.user!),
    message: "Courses",
  });
};

const createCourse = async (req: Request, res: Response) => {
  const {
    title,
    description,
    targetLevel,
  }: { title: string; description?: string | null; targetLevel: CourseLevel } = req.value!.body;

  // The status isn't set here, so the database default (draft) applies
  const course = await Courses.create({
    instructorId: req.user!.userId,
    title: varchar<255>(title),
    description: description ?? null,
    targetLevel,
  });

  return res.status(201).json({
    course: await buildCourse(course, req.user!),
    message: "Draft course created",
  });
};

const getCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);

  return res.status(200).json({
    course: await buildCourse(course, req.user!),
    message: "Course",
  });
};

const updateCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  assertCourseOwner(course, req.user!);
  assertEditable(course);

  const {
    title,
    description,
    targetLevel,
  }: { title?: string; description?: string | null; targetLevel?: CourseLevel } = req.value!.body;

  const changes: { title?: Varchar<255>; description?: string | null; targetLevel?: CourseLevel } =
    {};
  if (title !== undefined) changes.title = varchar<255>(title);
  if (description !== undefined) changes.description = description;
  if (targetLevel !== undefined) changes.targetLevel = targetLevel;

  const updated = await Courses.where({ courseId: course.courseId }).update(changes);
  if (!updated) {
    throw httpError(404, "Course not found");
  }

  return res.status(200).json({
    course: await buildCourse(updated, req.user!),
    message: "Course updated",
  });
};

// Only a draft that no learner has ever enrolled in can be deleted. Deleting cascades to the
// lessons and their content (see docs/ERD.md, "Delete rules"). A course with learners is archived.
const deleteCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  assertCourseOwner(course, req.user!);

  if (course.status !== "draft") {
    throw httpError(409, "Only draft courses can be deleted; archive it instead");
  }
  const enrollment = await Enrollments.first({ courseId: course.courseId });
  if (enrollment) {
    throw httpError(409, "Learners have enrolled in this course; archive it instead");
  }

  await Courses.where({ courseId: course.courseId }).delete();

  return res.status(200).json({ message: "Course deleted" });
};

// draft | rejected -> pending_review. The course needs at least one core lesson.
const submitCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  assertCourseOwner(course, req.user!);

  const coreLesson = await Lessons.first({ courseId: course.courseId, kind: "core" });
  if (!coreLesson) {
    throw httpError(409, "Add at least one core lesson before submitting");
  }

  const updated = await changeCourseStatus(
    course,
    ["draft", "rejected"],
    { status: "pending_review", submittedAt: Temporal.Now.instant() },
    "Only draft or rejected courses can be submitted",
  );

  return res.status(200).json({
    course: await buildCourse(updated, req.user!),
    message: "Course submitted for review",
  });
};

// pending_review | approved -> draft, so the owner can edit it. Enrolments are kept.
const withdrawCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  assertCourseOwner(course, req.user!);

  const updated = await changeCourseStatus(
    course,
    ["pending_review", "approved"],
    { status: "draft" },
    "Only courses waiting for review or approved can be withdrawn",
  );

  return res.status(200).json({
    course: await buildCourse(updated, req.user!),
    message: "Course withdrawn to draft",
  });
};

// pending_review -> approved (admin). Feedback is optional; empty feedback is stored as null.
const approveCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  const { feedback }: { feedback?: string } = req.value!.body;

  const updated = await changeCourseStatus(
    course,
    ["pending_review"],
    {
      status: "approved",
      reviewFeedback: feedback ? feedback : null,
      reviewedById: req.user!.userId,
      reviewedAt: Temporal.Now.instant(),
    },
    "Only courses waiting for review can be approved",
  );

  return res.status(200).json({
    course: await buildCourse(updated, req.user!),
    message: "Course approved",
  });
};

// pending_review -> rejected (admin). Joi has already made sure there is feedback.
const rejectCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  const { feedback }: { feedback: string } = req.value!.body;

  const updated = await changeCourseStatus(
    course,
    ["pending_review"],
    {
      status: "rejected",
      reviewFeedback: feedback,
      reviewedById: req.user!.userId,
      reviewedAt: Temporal.Now.instant(),
    },
    "Only courses waiting for review can be rejected",
  );

  return res.status(200).json({
    course: await buildCourse(updated, req.user!),
    message: "Course rejected",
  });
};

// Any status -> archived (owner or admin). Archiving an archived course changes nothing.
const archiveCourse = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  if (req.user!.role !== "admin" && !isCourseOwner(course, req.user!)) {
    throw httpError(403, "Only the course's instructor or an admin can archive it");
  }

  const updated = await Courses.where({ courseId: course.courseId }).update({
    status: "archived",
  });
  if (!updated) {
    throw httpError(404, "Course not found");
  }

  return res.status(200).json({
    course: await buildCourse(updated, req.user!),
    message: "Course archived",
  });
};

// Learners enrol in approved courses (findVisibleCourse gives 404 for any other status).
// Enrolling twice is harmless: the second call returns the existing enrolment with 200.
const enrollInCourse = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);

  let status = 200;
  let enrollment = await Enrollments.first({ userId, courseId: course.courseId });

  if (!enrollment) {
    try {
      enrollment = await Enrollments.create({ userId, courseId: course.courseId });
      status = 201;
    } catch (err) {
      // Two enrol requests at the same moment: both found no row, and the primary key
      // (user_id, course_id) rejected the second insert. That learner is enrolled, so read it back.
      if (!isUniqueViolation(err)) throw err;
      enrollment = await Enrollments.first({ userId, courseId: course.courseId });
    }
  }

  const [view] = await buildEnrollments([enrollment!], req.user!);

  return res.status(status).json({
    enrollment: view,
    message: status === 201 ? "Enrolled" : "Already enrolled",
  });
};

const leaveCourse = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const courseId: number = req.value!.params!.courseId;

  const enrollment = await Enrollments.first({ userId, courseId });
  if (!enrollment) {
    throw httpError(404, "You are not enrolled in this course");
  }

  await Enrollments.where({ userId, courseId }).delete();

  return res.status(200).json({ message: "Left the course" });
};

export default {
  listCatalog,
  listMyCourses,
  listAllCourses,
  createCourse,
  getCourse,
  updateCourse,
  deleteCourse,
  submitCourse,
  withdrawCourse,
  approveCourse,
  rejectCourse,
  archiveCourse,
  enrollInCourse,
  leaveCourse,
};
