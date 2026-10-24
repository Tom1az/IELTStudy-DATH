// Builds the contract's response shapes (Course, Lesson, LessonDetail, Passage, Enrollment)
// from database rows. Each function loads the related rows for a whole list in a few queries
// (one per related table, filtered with IN), instead of one query per course or lesson.
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { isCourseOwner } from "./courses.ts";
import type { CourseRow, LessonRow } from "./courses.ts";

const orm = db.orm.public;

type PassageRow = {
  passageId: number;
  lessonId: number | null;
  type: "reading_text" | "listening_audio" | "video";
  title: string | null;
  content: string | null;
  mediaPath: string | null;
  orderIndex: number;
};

type ProgressRow = {
  lessonId: number;
  status: "in_progress" | "completed";
  startedAt: Temporal.Instant;
  completedAt: Temporal.Instant | null;
};

type EnrollmentRow = {
  userId: number;
  courseId: number;
  enrolledAt: Temporal.Instant;
  completedAt: Temporal.Instant | null;
};

// The contract's Course object
export type CourseView = {
  courseId: number;
  instructor: { userId: number; fullName: string };
  title: string;
  description: string | null;
  targetLevel: CourseRow["targetLevel"];
  status: CourseRow["status"];
  reviewFeedback: string | null;
  submittedAt: Temporal.Instant | null;
  reviewedAt: Temporal.Instant | null;
  lessonCount: number;
  isEnrolled?: boolean;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
};

export const toPassage = (row: PassageRow) => ({
  passageId: row.passageId,
  lessonId: row.lessonId,
  type: row.type,
  title: row.title,
  content: row.content,
  mediaPath: row.mediaPath,
  // Signed Storage URLs arrive with the Uploads task; until then there is nothing to sign
  mediaUrl: null,
  orderIndex: row.orderIndex,
});

export const toProgress = (row: ProgressRow) => ({
  lessonId: row.lessonId,
  status: row.status,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});

// Counts the core lessons of each course: courseId -> count
const countCoreLessons = async (courseIds: number[]) => {
  const counts = new Map<number, number>();
  if (courseIds.length === 0) return counts;

  const lessons = await orm.Lessons.where((l) => and(l.courseId.in(courseIds), l.kind.eq("core")))
    .select("courseId")
    .all();
  for (const lesson of lessons) {
    counts.set(lesson.courseId, (counts.get(lesson.courseId) ?? 0) + 1);
  }
  return counts;
};

// The contract's Course objects, in the same order as `courses`.
// - `reviewFeedback` is shown only to the owner and admins.
// - `isEnrolled` is only present for learners.
export const buildCourses = async (courses: CourseRow[], viewer: PublicUser) => {
  if (courses.length === 0) return [];

  const courseIds = courses.map((course) => course.courseId);
  const instructorIds = courses.map((course) => course.instructorId);

  const instructors = await orm.Users.where((u) => u.userId.in(instructorIds))
    .select("userId", "fullName")
    .all();
  const instructorNames = new Map<number, string>();
  for (const instructor of instructors) {
    instructorNames.set(instructor.userId, instructor.fullName);
  }

  const lessonCounts = await countCoreLessons(courseIds);

  const enrolledCourseIds = new Set<number>();
  if (viewer.role === "learner") {
    const enrollments = await orm.Enrollments.where((e) =>
      and(e.userId.eq(viewer.userId), e.courseId.in(courseIds)),
    )
      .select("courseId")
      .all();
    for (const enrollment of enrollments) {
      enrolledCourseIds.add(enrollment.courseId);
    }
  }

  const result: CourseView[] = [];
  for (const course of courses) {
    const canSeeFeedback = viewer.role === "admin" || isCourseOwner(course, viewer);

    const view: CourseView = {
      courseId: course.courseId,
      instructor: {
        userId: course.instructorId,
        fullName: instructorNames.get(course.instructorId) ?? "",
      },
      title: course.title,
      description: course.description,
      targetLevel: course.targetLevel,
      status: course.status,
      reviewFeedback: canSeeFeedback ? course.reviewFeedback : null,
      submittedAt: course.submittedAt,
      reviewedAt: course.reviewedAt,
      lessonCount: lessonCounts.get(course.courseId) ?? 0,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
    if (viewer.role === "learner") {
      view.isEnrolled = enrolledCourseIds.has(course.courseId);
    }
    result.push(view);
  }
  return result;
};

export const buildCourse = async (course: CourseRow, viewer: PublicUser) => {
  const [result] = await buildCourses([course], viewer);
  return result!;
};

// The contract's Enrollment objects: the course plus how many core lessons are completed
export const buildEnrollments = async (enrollments: EnrollmentRow[], viewer: PublicUser) => {
  if (enrollments.length === 0) return [];

  const courseIds = enrollments.map((enrollment) => enrollment.courseId);
  const courseRows = await orm.Courses.where((c) => c.courseId.in(courseIds)).all();
  const courseViews = await buildCourses(courseRows, viewer);
  const coursesById = new Map<number, CourseView>();
  for (const view of courseViews) {
    coursesById.set(view.courseId, view);
  }

  // Core lessons of these courses, and which of them this learner has completed
  const coreLessons = await orm.Lessons.where((l) =>
    and(l.courseId.in(courseIds), l.kind.eq("core")),
  )
    .select("lessonId", "courseId")
    .all();
  const completedLessonIds = new Set<number>();
  if (coreLessons.length > 0) {
    const completed = await orm.LessonProgress.where((p) =>
      and(
        p.userId.eq(viewer.userId),
        p.status.eq("completed"),
        p.lessonId.in(coreLessons.map((lesson) => lesson.lessonId)),
      ),
    )
      .select("lessonId")
      .all();
    for (const row of completed) {
      completedLessonIds.add(row.lessonId);
    }
  }

  const result = [];
  for (const enrollment of enrollments) {
    let totalCoreLessons = 0;
    let completedLessons = 0;
    for (const lesson of coreLessons) {
      if (lesson.courseId !== enrollment.courseId) continue;
      totalCoreLessons += 1;
      if (completedLessonIds.has(lesson.lessonId)) completedLessons += 1;
    }

    // A course without core lessons counts as 0%, so the frontend never divides by zero
    const progressPercent =
      totalCoreLessons === 0 ? 0 : Math.round((completedLessons / totalCoreLessons) * 100);

    result.push({
      course: coursesById.get(enrollment.courseId)!,
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
      completedLessons,
      totalCoreLessons,
      progressPercent,
    });
  }
  return result;
};

// Skill tags of each lesson: lessonId -> [{ skillId, skillCode, name, weight }]
const loadSkillTags = async (lessonIds: number[]) => {
  const tagsByLesson = new Map<
    number,
    { skillId: number; skillCode: string; name: string; weight: number }[]
  >();
  if (lessonIds.length === 0) return tagsByLesson;

  const rows = await orm.LessonSkills.where((ls) => ls.lessonId.in(lessonIds))
    .include("skill", (skill) => skill.select("skillCode", "name"))
    .orderBy((ls) => ls.skillId.asc())
    .all();
  for (const row of rows) {
    // skill_id is a required foreign key, so the skill always exists; the ORM's type just
    // can't know that
    if (!row.skill) continue;

    const tags = tagsByLesson.get(row.lessonId) ?? [];
    tags.push({
      skillId: row.skillId,
      skillCode: row.skill.skillCode,
      name: row.skill.name,
      weight: row.weight,
    });
    tagsByLesson.set(row.lessonId, tags);
  }
  return tagsByLesson;
};

// The contract's Lesson objects. Learners also get `progress` (null if not started) and
// `locked`. The unlock rule is a Phase 3 decision, so nothing is locked yet.
export const buildLessons = async (lessons: LessonRow[], viewer: PublicUser) => {
  const lessonIds = lessons.map((lesson) => lesson.lessonId);
  const tagsByLesson = await loadSkillTags(lessonIds);

  const progressByLesson = new Map<number, ProgressRow>();
  if (viewer.role === "learner" && lessonIds.length > 0) {
    const rows = await orm.LessonProgress.where((p) =>
      and(p.userId.eq(viewer.userId), p.lessonId.in(lessonIds)),
    ).all();
    for (const row of rows) {
      progressByLesson.set(row.lessonId, row);
    }
  }

  const result = [];
  for (const lesson of lessons) {
    const view = {
      lessonId: lesson.lessonId,
      courseId: lesson.courseId,
      title: lesson.title,
      kind: lesson.kind,
      orderIndex: lesson.orderIndex,
      skills: tagsByLesson.get(lesson.lessonId) ?? [],
    };

    if (viewer.role === "learner") {
      const progress = progressByLesson.get(lesson.lessonId);
      result.push({ ...view, progress: progress ? toProgress(progress) : null, locked: false });
    } else {
      result.push(view);
    }
  }
  return result;
};

// The contract's LessonDetail: a Lesson plus its content, passages and quiz summaries
export const buildLessonDetail = async (lesson: LessonRow, viewer: PublicUser) => {
  const [view] = await buildLessons([lesson], viewer);

  const passages = await orm.PassagesMedia.where({ lessonId: lesson.lessonId })
    .orderBy([(p) => p.orderIndex.asc(), (p) => p.passageId.asc()])
    .all();

  const quizzes = await orm.Quizzes.where({ lessonId: lesson.lessonId })
    .orderBy((q) => q.quizId.asc())
    .all();

  // Number of questions in each quiz: quizId -> count
  const questionCounts = new Map<number, number>();
  if (quizzes.length > 0) {
    const quizIds = quizzes.map((quiz) => quiz.quizId);
    const links = await orm.QuizQuestions.where((qq) => qq.quizId.in(quizIds))
      .select("quizId")
      .all();
    for (const link of links) {
      questionCounts.set(link.quizId, (questionCounts.get(link.quizId) ?? 0) + 1);
    }
  }

  const quizSummaries = [];
  for (const quiz of quizzes) {
    quizSummaries.push({
      quizId: quiz.quizId,
      kind: quiz.kind,
      title: quiz.title,
      questionCount: questionCounts.get(quiz.quizId) ?? 0,
      timeLimitSeconds: quiz.timeLimitSeconds,
    });
  }

  return {
    ...view!,
    content: lesson.content,
    passages: passages.map(toPassage),
    quizzes: quizSummaries,
  };
};
