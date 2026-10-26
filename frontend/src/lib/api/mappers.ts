import type { Course, CourseStatus, Enrollment, Lesson, Level, Recommendation, Skill, SkillCategory, User } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import type {
  BackendCourse, BackendCourseLevel, BackendCourseStatus, BackendLesson, BackendLessonDetail, BackendRecommendation, BackendSkill, BackendUser,
} from "./backend-types";

/**
 * Converts a backend user into the `User` shape the pages use. `placementDone` is not
 * stored on the user: the caller works it out from `GET /diagnostic` (a completed
 * diagnostic attempt means the placement is done).
 */
export function toUser(u: BackendUser, placementDone: boolean): User {
  return {
    id: String(u.userId),
    email: u.email,
    name: u.fullName,
    role: u.role,
    status: u.isActive ? "active" : "suspended",
    // The UI needs a number. 0 means "no target set yet".
    targetBand: u.targetBand ?? 0,
    createdAt: u.createdAt,
    placementDone,
  };
}

/* ───────── Skills ───────── */

export function toSkill(s: BackendSkill): Skill {
  return { id: String(s.skillId), code: s.skillCode, category: s.category, name: s.name, description: s.description ?? "" };
}

/** skillId → category, so lessons and recommendations can be grouped by the four IELTS skills. */
export type SkillCategories = Map<number, SkillCategory>;

export function toSkillCategories(skills: BackendSkill[]): SkillCategories {
  const map: SkillCategories = new Map();
  for (const s of skills) map.set(s.skillId, s.category);
  return map;
}

/**
 * The UI shows each lesson under one of the four skills, but a backend lesson can be
 * tagged with several micro-skills. We use the category of its heaviest tag.
 */
export function lessonCategory(lesson: BackendLesson, categories: SkillCategories): SkillCategory {
  let best = lesson.skills[0];
  for (const tag of lesson.skills) {
    if (tag.weight > best.weight) best = tag;
  }
  // Every lesson has at least one tag (API rule); "reading" is only a fallback for unknown skills
  return (best && categories.get(best.skillId)) ?? "reading";
}

/* ───────── Courses ───────── */

const LEVELS: Record<BackendCourseLevel, { level: Level; name: string }> = {
  beginner: { level: 1, name: "Beginner" },
  intermediate: { level: 2, name: "Intermediate" },
  advanced: { level: 3, name: "Advanced" },
};

const COURSE_STATUS: Record<BackendCourseStatus, CourseStatus> = {
  draft: "draft",
  pending_review: "pending",
  approved: "published",
  rejected: "rejected",
  archived: "hidden",
};

/** Converts a backend course into the UI `Course`. URLs use the course id (`/courses/3`). */
export function toCourse(c: BackendCourse): Course {
  const level = LEVELS[c.targetLevel];
  return {
    id: String(c.courseId),
    level: level.level,
    levelName: level.name,
    title: c.title,
    description: c.description ?? "",
    instructorId: String(c.instructor.userId),
    status: COURSE_STATUS[c.status],
    reviewFeedback: c.reviewFeedback ?? undefined,
    submittedAt: c.submittedAt ?? undefined,
    updatedAt: c.updatedAt,
    createdAt: c.createdAt,
  };
}

/* ───────── Lessons ───────── */

export interface SyllabusEntry {
  lesson: BackendLesson;
  skill: SkillCategory;
  /** 1-based position inside its skill section. */
  order: number;
}

/**
 * Groups a course's core lessons into the UI's four skill sections, in the usual
 * Listening → Reading → Writing → Speaking order. Inside a section the backend order
 * (`orderIndex`) is kept. Remedial lessons are left out: learners only reach them
 * through recommendations.
 */
export function buildSyllabus(lessons: BackendLesson[], categories: SkillCategories): { skill: SkillCategory; entries: SyllabusEntry[] }[] {
  const sections: { skill: SkillCategory; entries: SyllabusEntry[] }[] = [];
  for (const skill of SKILL_CATEGORIES) {
    const entries: SyllabusEntry[] = [];
    for (const lesson of lessons) {
      if (lesson.kind === "core" && lessonCategory(lesson, categories) === skill) {
        entries.push({ lesson, skill, order: entries.length + 1 });
      }
    }
    if (entries.length > 0) sections.push({ skill, entries });
  }
  return sections;
}

/** Converts a lesson into the UI `Lesson`. Its passages and quizzes are returned separately. */
export function toLesson(detail: BackendLessonDetail, skill: SkillCategory, order: number): Lesson {
  return { id: String(detail.lessonId), courseId: String(detail.courseId), skill, order, title: detail.title, content: detail.content };
}

/** Lesson ids I have completed, from the `progress` field the backend sends to learners. */
export function completedLessonIds(lessons: BackendLesson[]): string[] {
  const ids: string[] = [];
  for (const lesson of lessons) {
    if (lesson.progress?.status === "completed") ids.push(String(lesson.lessonId));
  }
  return ids;
}

/**
 * Builds the UI `Enrollment` for a course I'm enrolled in. The course is completed
 * when every core lesson is, which is the same rule the backend uses for `completedAt`.
 */
export function toEnrollment(input: { courseId: number; lessons: BackendLesson[]; enrolledAt?: string; completedAt?: string | null }): Enrollment {
  const core = input.lessons.filter((l) => l.kind === "core");
  const doneIds = completedLessonIds(input.lessons);
  const allCoreDone = core.length > 0 && core.every((l) => doneIds.includes(String(l.lessonId)));
  return {
    courseId: String(input.courseId),
    status: input.completedAt || allCoreDone ? "completed" : "active",
    enrolledAt: input.enrolledAt ?? "",
    completedAt: input.completedAt ?? undefined,
    completedLessonIds: doneIds,
  };
}

/* ───────── Recommendations (Phase 3) ───────── */

export function toRecommendation(r: BackendRecommendation, categories: SkillCategories): Recommendation {
  return {
    id: String(r.recommendationId),
    kind: r.type === "quiz" ? "practice" : "lesson",
    targetId: String(r.lesson?.lessonId ?? r.quiz?.quizId ?? ""),
    courseId: r.lesson ? String(r.lesson.courseId) : "",
    title: r.lesson?.title ?? r.quiz?.title ?? "",
    skill: categories.get(r.skill.skillId) ?? "reading",
    score: r.score,
    reason: r.rationale,
    skillId: String(r.skill.skillId),
    mastery: r.masteryProb,
  };
}
