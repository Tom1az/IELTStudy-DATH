import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { MASTERY_THRESHOLD } from "../config/bkt-params.ts";

const orm = db.orm.public;

export type LessonGateStatus = {
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

// The unlock rule for the lessons of one course. Remedial lessons are always open; a core lesson
// opens when the core lesson before it is completed or all that lesson's skills are mastered.
export const gateCourseLessons = (
  lessons: GateLesson[],
  completedLessonIds: Set<number>,
  masteryBySkill: Map<number, number>,
  skillsByLesson: Map<number, Array<{ skillId: number }>>,
): Map<number, LessonGateStatus> => {
  const gates = new Map<number, LessonGateStatus>();

  const coreLessons = lessons
    .filter((l) => l.kind === "core")
    .sort((a, b) => a.orderIndex - b.orderIndex || a.lessonId - b.lessonId);

  for (const lesson of lessons) {
    if (lesson.kind === "remedial") {
      gates.set(lesson.lessonId, { lessonId: lesson.lessonId, locked: false, reason: null });
    }
  }

  for (let i = 0; i < coreLessons.length; i++) {
    const current = coreLessons[i]!;
    if (i === 0) {
      gates.set(current.lessonId, { lessonId: current.lessonId, locked: false, reason: null });
      continue;
    }

    const prev = coreLessons[i - 1]!;
    const prevCompleted = completedLessonIds.has(prev.lessonId);
    const prevSkills = skillsByLesson.get(prev.lessonId) ?? [];
    const prevSkillsMastered =
      prevSkills.length > 0 &&
      prevSkills.every((sk) => (masteryBySkill.get(sk.skillId) ?? 0) >= MASTERY_THRESHOLD);

    const unlocked = prevCompleted || prevSkillsMastered;
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

export const computeCourseLessonGates = async (
  userId: number,
  courseId: number,
): Promise<Map<number, LessonGateStatus>> => {
  const lessons = await orm.Lessons.where({ courseId }).all();
  if (lessons.length === 0) return new Map();

  const lessonIds = lessons.map((l) => l.lessonId);

  const [progressRows, lessonSkills, masteryRows] = await Promise.all([
    orm.LessonProgress.where((p) => and(p.userId.eq(userId), p.lessonId.in(lessonIds))).all(),
    orm.LessonSkills.where((ls) => ls.lessonId.in(lessonIds)).all(),
    orm.UserSkillMastery.where({ userId }).all(),
  ]);

  const completedSet = new Set(
    progressRows.filter((p) => p.status === "completed").map((p) => p.lessonId),
  );
  const masteryBySkill = new Map(masteryRows.map((m) => [m.skillId, m.masteryProb]));

  const skillsByLesson = new Map<number, Array<{ skillId: number }>>();
  for (const ls of lessonSkills) {
    const list = skillsByLesson.get(ls.lessonId) ?? [];
    list.push({ skillId: ls.skillId });
    skillsByLesson.set(ls.lessonId, list);
  }

  return gateCourseLessons(lessons, completedSet, masteryBySkill, skillsByLesson);
};

export const getLearnerGoalAndProgress = async (userId: number) => {
  const [user, masteryRows, enrollments, attempts] = await Promise.all([
    orm.Users.first({ userId }),
    orm.UserSkillMastery.where({ userId })
      .include("skill", (s) => s.select("skillCode", "name", "category"))
      .all(),
    orm.Enrollments.where({ userId }).all(),
    orm.QuizAttempts.where((a) => and(a.userId.eq(userId), a.completedAt.isNotNull())).all(),
  ]);

  const totalSkills = 20;
  const masteredCount = masteryRows.filter((m) => m.masteryProb >= MASTERY_THRESHOLD).length;
  const avgMastery =
    masteryRows.length > 0
      ? masteryRows.reduce((acc, r) => acc + r.masteryProb, 0) / masteryRows.length
      : 0;

  const targetBand = user?.targetBand ?? 6.5;
  const targetMasteryRequired = Math.min(0.9, Math.max(0.5, targetBand / 9.0));
  const goalReadinessPercent = Math.min(
    100,
    Math.round((avgMastery / targetMasteryRequired) * 100),
  );

  return {
    targetBand: user?.targetBand ?? null,
    averageMastery: Math.round(avgMastery * 1000) / 1000,
    masteredSkillsCount: masteredCount,
    totalSkillsCount: totalSkills,
    goalReadinessPercent,
    enrolledCoursesCount: enrollments.length,
    completedCoursesCount: enrollments.filter((e) => e.completedAt !== null).length,
    completedAttemptsCount: attempts.length,
  };
};
