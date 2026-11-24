import type { Request, Response } from "express";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { and, or } from "@prisma/orm-postgres/orm-client";
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
import { likePattern, pageMeta, pageWindow } from "../utils/pagination.ts";
import type { PageQuery } from "../utils/pagination.ts";

const Courses = db.orm.public.Courses;
const Lessons = db.orm.public.Lessons;
const Enrollments = db.orm.public.Enrollments;

// The approved catalog, optionally filtered by level
// Filters shared by the catalog and the admin list: a status, a level, and `q` against the
// title, the description or any lesson title. Only the filters that were given go into the
// WHERE clause.
const courseFilter = (filters: { status?: CourseStatus; level?: CourseLevel; q?: string }) => {
  const pattern = likePattern(filters.q);
  return Courses.where((c) =>
    and(
      filters.status ? c.status.eq(filters.status) : c.courseId.isNotNull(),
      filters.level ? c.targetLevel.eq(filters.level) : c.courseId.isNotNull(),
      pattern
        ? or(
            c.title.ilike(pattern),
            c.description.ilike(pattern),
            c.lessons.some((l) => l.title.ilike(pattern)),
          )
        : c.courseId.isNotNull(),
    ),
  );
};

const countCourses = async (filtered: ReturnType<typeof courseFilter>) => {
  const { count } = await filtered.aggregate((agg) => ({ count: agg.count() }));
  return count;
};

// The approved courses, one page at a time, oldest course first
const listCatalog = async (req: Request, res: Response) => {
  const { level, q, ...paging }: { level?: CourseLevel; q?: string } & PageQuery = req.value!.query;

  const filtered = courseFilter({ status: "approved", level, q });
  const { limit, offset } = pageWindow(paging);
  const [total, rows] = await Promise.all([
    countCourses(filtered),
    filtered.orderBy((c) => c.courseId.asc()).limit(limit).offset(offset).all(),
  ]);

  return res.status(200).json({
    courses: await buildCourses(rows, req.user!),
    ...pageMeta(total, paging),
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

// Every course, for admins. `?status=pending_review` is the review queue, oldest submission
// first; without a status, the newest course first.
const listAllCourses = async (req: Request, res: Response) => {
  const { status, q, ...paging }: { status?: CourseStatus; q?: string } & PageQuery =
    req.value!.query;

  const filtered = courseFilter({ status, q });
  const ordered = status
    ? filtered.orderBy([(c) => c.submittedAt.asc({ nulls: "last" }), (c) => c.courseId.asc()])
    : filtered.orderBy((c) => c.courseId.desc());
  const { limit, offset } = pageWindow(paging);
  const [total, rows] = await Promise.all([
    countCourses(filtered),
    ordered.limit(limit).offset(offset).all(),
  ]);

  return res.status(200).json({
    courses: await buildCourses(rows, req.user!),
    ...pageMeta(total, paging),
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
