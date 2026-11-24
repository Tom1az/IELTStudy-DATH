import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import type { CourseStatus } from "./courses.ts";
import type { UserRole } from "../utils/public-user.ts";

const orm = db.orm.public;

// The contract's `AdminStats` shape (GET /admin/stats)
export type AdminStats = {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, number>;
  };
  courses: {
    total: number;
    byStatus: Record<CourseStatus, number>;
  };
  enrollments: number;
  attempts: {
    completed: number;
    completedLast7Days: number;
  };
  activeLearnersLast7Days: number;
  completion: CompletionStats;
  learning: LearningStats;
};

type CompletionStats = {
  averageProgressPercent: number | null;
  completionRatePercent: number | null;
  courses: Array<{
    courseId: number;
    title: string;
    coreLessons: number;
    enrolled: number;
    completed: number;
    completionRatePercent: number | null;
    averageProgressPercent: number | null;
  }>;
};

type SkillCategory = "listening" | "reading" | "writing" | "speaking";

type LearningStats = {
  averageScorePercent: number | null;
  scoredAttempts: number;
  averageMastery: number | null;
  masteredPercent: number | null;
  byCategory: Array<{ category: SkillCategory; averageMastery: number | null; learners: number }>;
  bySkill: Array<{
    skillId: number;
    skillCode: string;
    name: string;
    category: SkillCategory;
    averageMastery: number | null;
    learners: number;
  }>;
};

const MASTERY_THRESHOLD = 0.65;
const round1 = (value: number) => Math.round(value * 10) / 10;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const percentOf = (part: number, whole: number) => (whole === 0 ? null : round1((part / whole) * 100));

// Platform usage numbers for the admin panel. Every number is counted by Postgres
// (`groupBy` / `aggregate`), so no table is loaded into memory.
export const getUsageStats = async (): Promise<AdminStats> => {
  // "Last 7 days" is a rolling window: the 168 hours before this request
  const since = Temporal.Now.instant().subtract({ hours: 168 });

  const [userGroups, courseGroups, enrollments, completed, completedLast7Days, recentLearners] =
    await Promise.all([
      // One row per (role, isActive) pair that exists, with how many users have it
      orm.Users.groupBy("role", "isActive").aggregate((agg) => ({ count: agg.count() })),
      // One row per course status that exists
      orm.Courses.groupBy("status").aggregate((agg) => ({ count: agg.count() })),
      orm.Enrollments.aggregate((agg) => ({ count: agg.count() })),
      // Open attempts (completedAt is null) are not counted
      orm.QuizAttempts.where((a) => a.completedAt.isNotNull()).aggregate((agg) => ({
        count: agg.count(),
      })),
      orm.QuizAttempts.where((a) => a.completedAt.gte(since)).aggregate((agg) => ({
        count: agg.count(),
      })),
      // One row per learner who completed an attempt in the window, so a learner with
      // several attempts is counted once
      orm.QuizAttempts.where((a) => a.completedAt.gte(since))
        .groupBy("userId")
        .aggregate((agg) => ({ count: agg.count() })),
    ]);

  // Groups with no rows don't come back from the database, so every count starts at 0
  const byRole: Record<UserRole, number> = { learner: 0, instructor: 0, admin: 0 };
  let active = 0;
  let inactive = 0;
  for (const group of userGroups) {
    byRole[group.role] += group.count;
    if (group.isActive) {
      active += group.count;
    } else {
      inactive += group.count;
    }
  }

  const byStatus: Record<CourseStatus, number> = {
    draft: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    archived: 0,
  };
  let totalCourses = 0;
  for (const group of courseGroups) {
    byStatus[group.status] += group.count;
    totalCourses += group.count;
  }

  const [completion, learning] = await Promise.all([getCompletionStats(), getLearningStats()]);

  return {
    users: { total: active + inactive, active, inactive, byRole },
    courses: { total: totalCourses, byStatus },
    enrollments: enrollments.count,
    attempts: {
      completed: completed.count,
      completedLast7Days: completedLast7Days.count,
    },
    activeLearnersLast7Days: recentLearners.length,
    completion,
    learning,
  };
};

// Course completion over approved courses. A learner completes a course by completing every
// core lesson in it; progress is the share of core lessons completed.
const getCompletionStats = async (): Promise<CompletionStats> => {
  const courses = await orm.Courses.where({ status: "approved" })
    .orderBy((c) => c.courseId.asc())
    .all();
  if (courses.length === 0) {
    return { averageProgressPercent: null, completionRatePercent: null, courses: [] };
  }
  const courseIds = courses.map((c) => c.courseId);

  const [coreLessons, enrollments] = await Promise.all([
    orm.Lessons.where((l) => and(l.courseId.in(courseIds), l.kind.eq("core")))
      .select("lessonId", "courseId")
      .all(),
    orm.Enrollments.where((e) => e.courseId.in(courseIds)).select("userId", "courseId").all(),
  ]);
  const completedRows =
    coreLessons.length > 0
      ? await orm.LessonProgress.where((p) =>
          and(p.status.eq("completed"), p.lessonId.in(coreLessons.map((l) => l.lessonId))),
        )
          .select("userId", "lessonId")
          .all()
      : [];

  const courseOfLesson = new Map(coreLessons.map((l) => [l.lessonId, l.courseId]));
  const coreCount = new Map<number, number>();
  for (const lesson of coreLessons) coreCount.set(lesson.courseId, (coreCount.get(lesson.courseId) ?? 0) + 1);
  // Completed core lessons per (learner, course)
  const done = new Map<string, number>();
  for (const row of completedRows) {
    const key = `${row.userId}:${courseOfLesson.get(row.lessonId)}`;
    done.set(key, (done.get(key) ?? 0) + 1);
  }

  let progressSum = 0;
  let progressCount = 0;
  let completedTotal = 0;
  const perCourse = courses.map((course) => {
    const total = coreCount.get(course.courseId) ?? 0;
    const enrolled = enrollments.filter((e) => e.courseId === course.courseId);
    let sum = 0;
    let completed = 0;
    for (const e of enrolled) {
      const ratio = total === 0 ? 0 : Math.min(1, (done.get(`${e.userId}:${course.courseId}`) ?? 0) / total);
      sum += ratio;
      if (total > 0 && ratio === 1) completed += 1;
    }
    progressSum += sum;
    progressCount += enrolled.length;
    completedTotal += completed;
    return {
      courseId: course.courseId,
      title: course.title,
      coreLessons: total,
      enrolled: enrolled.length,
      completed,
      completionRatePercent: percentOf(completed, enrolled.length),
      averageProgressPercent: enrolled.length === 0 ? null : round1((sum / enrolled.length) * 100),
    };
  });

  return {
    averageProgressPercent: progressCount === 0 ? null : round1((progressSum / progressCount) * 100),
    completionRatePercent: percentOf(completedTotal, progressCount),
    courses: perCourse,
  };
};

// Learning results: the share of correct answers over completed attempts, and BKT mastery
const getLearningStats = async (): Promise<LearningStats> => {
  const [scores, skills, mastery] = await Promise.all([
    orm.QuizAttempts.where((a) => a.completedAt.isNotNull()).aggregate((agg) => ({
      count: agg.count(),
      correct: agg.sum("totalScore"),
      questions: agg.sum("maxScore"),
    })),
    orm.Skills.orderBy((s) => s.skillId.asc()).all(),
    orm.UserSkillMastery.select("userId", "skillId", "masteryProb").all(),
  ]);

  const skillById = new Map(skills.map((s) => [s.skillId, s]));
  const bySkill = new Map<number, { sum: number; learners: number }>();
  const byCategory = new Map<SkillCategory, { sum: number; pairs: number; learners: Set<number> }>();
  let sum = 0;
  let mastered = 0;
  for (const row of mastery) {
    const skill = skillById.get(row.skillId);
    if (!skill) continue;
    sum += row.masteryProb;
    if (row.masteryProb >= MASTERY_THRESHOLD) mastered += 1;
    const s = bySkill.get(row.skillId) ?? { sum: 0, learners: 0 };
    s.sum += row.masteryProb;
    s.learners += 1;
    bySkill.set(row.skillId, s);
    const c = byCategory.get(skill.category) ?? { sum: 0, pairs: 0, learners: new Set<number>() };
    c.sum += row.masteryProb;
    c.pairs += 1;
    c.learners.add(row.userId);
    byCategory.set(skill.category, c);
  }

  const categories: SkillCategory[] = ["listening", "reading", "writing", "speaking"];
  return {
    averageScorePercent:
      scores.questions && scores.questions > 0 ? round1(((scores.correct ?? 0) / scores.questions) * 100) : null,
    scoredAttempts: scores.count,
    averageMastery: mastery.length === 0 ? null : round3(sum / mastery.length),
    masteredPercent: percentOf(mastered, mastery.length),
    byCategory: categories.map((category) => {
      const c = byCategory.get(category);
      return {
        category,
        averageMastery: c && c.pairs > 0 ? round3(c.sum / c.pairs) : null,
        learners: c ? c.learners.size : 0,
      };
    }),
    bySkill: skills.map((skill) => {
      const s = bySkill.get(skill.skillId);
      return {
        skillId: skill.skillId,
        skillCode: skill.skillCode,
        name: skill.name,
        category: skill.category,
        averageMastery: s && s.learners > 0 ? round3(s.sum / s.learners) : null,
        learners: s ? s.learners : 0,
      };
    }),
  };
};
