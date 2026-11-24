// Module gating (decided 2026-11-24, docs/ROADMAP.md): inside a course the first core lesson is
// open, and each next core lesson opens when the core lesson before it is completed OR every
// skill tagged on it has mastery >= 0.65. Remedial lessons are never locked, and any learner may
// open the remedial lessons of an approved course without enrolling.
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { MASTERY_THRESHOLD } from "./bkt-params.ts";
import { isEnrolled } from "./courses.ts";
import type { CourseRow, LessonRow } from "./courses.ts";

const orm = db.orm.public;

export type LessonGate = {
  lessonId: number;
  locked: boolean;
  reason: string | null;
};

type GateLesson = {
  lessonId: number;
  title: string;
  kind: "core" | "remedial";
  orderIndex: number;
};

// The unlock rule for the lessons of one course, from data already loaded
export const gateCourseLessons = (
  lessons: GateLesson[],
  completedLessonIds: Set<number>,
  masteryBySkill: Map<number, number>,
  skillsByLesson: Map<number, Array<{ skillId: number }>>,
): Map<number, LessonGate> => {
  const gates = new Map<number, LessonGate>();

  for (const lesson of lessons) {
    if (lesson.kind === "remedial") {
      gates.set(lesson.lessonId, { lessonId: lesson.lessonId, locked: false, reason: null });
    }
  }

  const core = lessons
    .filter((l) => l.kind === "core")
    .sort((a, b) => a.orderIndex - b.orderIndex || a.lessonId - b.lessonId);

  for (let i = 0; i < core.length; i++) {
    const current = core[i]!;
    if (i === 0) {
      gates.set(current.lessonId, { lessonId: current.lessonId, locked: false, reason: null });
      continue;
    }
    const prev = core[i - 1]!;
    const prevSkills = skillsByLesson.get(prev.lessonId) ?? [];
    const mastered =
      prevSkills.length > 0 &&
      prevSkills.every((sk) => (masteryBySkill.get(sk.skillId) ?? 0) >= MASTERY_THRESHOLD);
    const unlocked = completedLessonIds.has(prev.lessonId) || mastered;
    gates.set(current.lessonId, {
      lessonId: current.lessonId,
      locked: !unlocked,
      reason: unlocked
        ? null
        : `Complete '${prev.title}' or reach ${MASTERY_THRESHOLD} mastery on its skills to unlock.`,
    });
  }
  return gates;
};

// The gates of one course for one learner
export const computeCourseLessonGates = async (userId: number, courseId: number) => {
  const lessons = await orm.Lessons.where({ courseId }).all();
  if (lessons.length === 0) return new Map<number, LessonGate>();
  const lessonIds = lessons.map((l) => l.lessonId);

  const [progressRows, lessonSkills, masteryRows] = await Promise.all([
    orm.LessonProgress.where((p) => and(p.userId.eq(userId), p.lessonId.in(lessonIds))).all(),
    orm.LessonSkills.where((ls) => ls.lessonId.in(lessonIds)).all(),
    orm.UserSkillMastery.where({ userId }).all(),
  ]);

  const completed = new Set(progressRows.filter((p) => p.status === "completed").map((p) => p.lessonId));
  const masteryBySkill = new Map(masteryRows.map((m) => [m.skillId, m.masteryProb]));
  const skillsByLesson = new Map<number, Array<{ skillId: number }>>();
  for (const ls of lessonSkills) {
    const list = skillsByLesson.get(ls.lessonId) ?? [];
    list.push({ skillId: ls.skillId });
    skillsByLesson.set(ls.lessonId, list);
  }
  return gateCourseLessons(lessons, completed, masteryBySkill, skillsByLesson);
};

// Whether a learner may open a lesson's content (the lesson, its passages and quizzes).
// Instructors and admins who can see the course may always open it. The caller has already
// checked that the course is visible (findVisibleLesson / findVisibleCourse).
export const assertCanOpenLesson = async (
  lesson: Pick<LessonRow, "lessonId" | "courseId" | "kind">,
  course: CourseRow,
  user: PublicUser,
) => {
  if (user.role !== "learner") return;
  // Remedial lessons are reached through recommendations, from any approved course
  if (lesson.kind === "remedial" && course.status === "approved") return;

  if (!(await isEnrolled(user.userId, course.courseId))) {
    throw httpError(403, "Enrol in this course to open its lessons");
  }
  const gate = (await computeCourseLessonGates(user.userId, course.courseId)).get(lesson.lessonId);
  if (gate?.locked) {
    throw httpError(403, gate.reason ?? "This lesson is locked");
  }
};

// GET /progress/me: average mastery against the target band
export const getLearnerGoalAndProgress = async (userId: number) => {
  const [user, masteryRows, enrollments, attempts, skills] = await Promise.all([
    orm.Users.first({ userId }),
    orm.UserSkillMastery.where({ userId }).all(),
    orm.Enrollments.where({ userId }).all(),
    orm.QuizAttempts.where((a) => and(a.userId.eq(userId), a.completedAt.isNotNull())).aggregate(
      (agg) => ({ count: agg.count() }),
    ),
    orm.Skills.aggregate((agg) => ({ count: agg.count() })),
  ]);

  const mastered = masteryRows.filter((m) => m.masteryProb >= MASTERY_THRESHOLD).length;
  const avgMastery =
    masteryRows.length > 0
      ? masteryRows.reduce((acc, r) => acc + r.masteryProb, 0) / masteryRows.length
      : 0;
  // Band 6.5 needs about 0.72 average mastery; the requirement stays between 0.5 and 0.9
  const targetBand = user?.targetBand ?? 6.5;
  const required = Math.min(0.9, Math.max(0.5, targetBand / 9));

  return {
    targetBand: user?.targetBand ?? null,
    averageMastery: Math.round(avgMastery * 1000) / 1000,
    masteredSkillsCount: mastered,
    totalSkillsCount: skills.count,
    goalReadinessPercent: Math.min(100, Math.round((avgMastery / required) * 100)),
    enrolledCoursesCount: enrollments.length,
    completedCoursesCount: enrollments.filter((e) => e.completedAt !== null).length,
    completedAttemptsCount: attempts.count,
  };
};
