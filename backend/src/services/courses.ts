// Access rules for courses and the lessons inside them, shared by the course, lesson and
// passage controllers. The rules come from the API contract and docs/ERD.md
// ("Course status transitions", "Content edit rights", "Locked content").
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";

const Courses = db.orm.public.Courses;
const Lessons = db.orm.public.Lessons;
const Enrollments = db.orm.public.Enrollments;

export type CourseStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";
export type CourseLevel = "beginner" | "intermediate" | "advanced";

// A course row as the database returns it
export type CourseRow = {
  courseId: number;
  instructorId: number;
  title: string;
  description: string | null;
  targetLevel: CourseLevel;
  status: CourseStatus;
  reviewFeedback: string | null;
  reviewedById: number | null;
  submittedAt: Temporal.Instant | null;
  reviewedAt: Temporal.Instant | null;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
};

export type LessonRow = {
  lessonId: number;
  courseId: number;
  title: string;
  content: string | null;
  kind: "core" | "remedial";
  orderIndex: number;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
};

// Content inside a course (lessons, passages, quizzes) may only change in these statuses
export const EDITABLE_STATUSES: CourseStatus[] = ["draft", "rejected"];

export const isCourseOwner = (course: CourseRow, user: PublicUser) => {
  return course.instructorId === user.userId;
};

// Everyone sees approved courses. Other statuses are visible only to the owner and admins.
export const canSeeCourse = (course: CourseRow, user: PublicUser) => {
  if (course.status === "approved") return true;
  if (user.role === "admin") return true;
  return isCourseOwner(course, user);
};

// Loads a course the user may see. A course they may not see gets the same 404 as a missing
// one, so the API doesn't reveal that it exists.
export const findVisibleCourse = async (courseId: number, user: PublicUser) => {
  const course = await Courses.first({ courseId });
  if (!course || !canSeeCourse(course, user)) {
    throw httpError(404, "Course not found");
  }
  return course;
};

// Loads a lesson and its course, with the same visibility rule as the course
export const findVisibleLesson = async (lessonId: number, user: PublicUser) => {
  const lesson = await Lessons.first({ lessonId });
  if (!lesson) {
    throw httpError(404, "Lesson not found");
  }

  const course = await Courses.first({ courseId: lesson.courseId });
  if (!course || !canSeeCourse(course, user)) {
    throw httpError(404, "Lesson not found");
  }

  return { lesson, course };
};

export const assertCourseOwner = (course: CourseRow, user: PublicUser) => {
  if (!isCourseOwner(course, user)) {
    throw httpError(403, "Only the course's instructor can do this");
  }
};

// Locked content: an approved course must be withdrawn to draft before it can change
export const assertEditable = (course: CourseRow) => {
  if (!EDITABLE_STATUSES.includes(course.status)) {
    throw httpError(409, "Only draft or rejected courses can be edited");
  }
};

export const isEnrolled = async (userId: number, courseId: number) => {
  const enrollment = await Enrollments.first({ userId, courseId });
  return enrollment !== null;
};

// Learners may open a lesson only in a course they are enrolled in. Instructors and admins
// who can see the course may always open its lessons.
export const assertCanStudy = async (course: CourseRow, user: PublicUser) => {
  if (user.role !== "learner") return;

  if (!(await isEnrolled(user.userId, course.courseId))) {
    throw httpError(403, "Enrol in this course to open its lessons");
  }
};

type StatusChanges = {
  status: CourseStatus;
  reviewFeedback?: string | null;
  reviewedById?: number | null;
  submittedAt?: Temporal.Instant;
  reviewedAt?: Temporal.Instant;
};

// Moves a course to a new status, but only if its status is one of `from`.
// The status is checked twice:
// 1. on the row we already loaded, to answer with a clear 409;
// 2. in the UPDATE's WHERE clause. If another request changed the status in between (say an
//    admin approved the course while the owner withdrew it), the UPDATE matches no row and
//    returns null, so this request gets a 409 instead of overwriting the other change.
export const changeCourseStatus = async (
  course: CourseRow,
  from: CourseStatus[],
  changes: StatusChanges,
  conflictMessage: string,
) => {
  if (!from.includes(course.status)) {
    throw httpError(409, conflictMessage);
  }

  const updated = await Courses.where((c) =>
    and(c.courseId.eq(course.courseId), c.status.in(from)),
  ).update(changes);

  if (!updated) {
    throw httpError(409, conflictMessage);
  }
  return updated;
};
