import "temporal-polyfill/global";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import { MASTERY_THRESHOLD } from "../config/bkt-params.ts";

const orm = db.orm.public;

export type RecommendationView = {
  recommendationId: number;
  type: "lesson" | "quiz";
  lesson: {
    lessonId: number;
    title: string;
    courseId: number;
    courseTitle: string;
  } | null;
  quiz: {
    quizId: number;
    title: string;
  } | null;
  skill: {
    skillId: number;
    skillCode: string;
    name: string;
  };
  masteryProb: number;
  rank: number;
  score: number;
  rationale: string;
  createdAt: Temporal.Instant;
  clickedAt: Temporal.Instant | null;
};

const getPreferredLevel = (targetBand: number | null): "beginner" | "intermediate" | "advanced" => {
  if (targetBand === null || targetBand < 6.0) return "beginner";
  if (targetBand < 7.0) return "intermediate";
  return "advanced";
};

const cosineSimilarity = (
  needMap: Map<number, number>,
  itemSkills: Array<{ skillId: number; weight: number }>,
): number => {
  if (needMap.size === 0 || itemSkills.length === 0) return 0;

  let dot = 0;
  let itemNormSq = 0;
  for (const tag of itemSkills) {
    const need = needMap.get(tag.skillId) ?? 0;
    dot += need * tag.weight;
    itemNormSq += tag.weight * tag.weight;
  }

  let needNormSq = 0;
  for (const val of needMap.values()) {
    needNormSq += val * val;
  }

  const denom = Math.sqrt(needNormSq) * Math.sqrt(itemNormSq);
  return denom > 0 ? dot / denom : 0;
};

export const generateRecommendationsForLearner = async (
  userId: number,
  options: { sourceAttemptId?: number; forceRefresh?: boolean } = {},
): Promise<RecommendationView[]> => {
  const { sourceAttemptId, forceRefresh = false } = options;

  if (sourceAttemptId !== undefined && !forceRefresh) {
    const existingForAttempt = await orm.Recommendations.where({
      userId,
      sourceAttemptId,
    })
      .orderBy((r) => r.rank.asc())
      .all();
    if (existingForAttempt.length > 0) {
      return buildRecommendationViews(existingForAttempt);
    }
  }

  const user = await orm.Users.first({ userId });
  if (!user) return [];

  const masteryRows = await orm.UserSkillMastery.where({ userId })
    .include("skill", (s) => s.select("skillId", "skillCode", "name", "category"))
    .all();

  if (masteryRows.length === 0) return [];

  const weakSkills = masteryRows
    .filter((m) => m.skill !== null && m.masteryProb < MASTERY_THRESHOLD)
    .sort((a, b) => a.masteryProb - b.masteryProb);

  if (weakSkills.length === 0) return [];

  const emphasizedSkillIds = new Set<number>();
  if (sourceAttemptId !== undefined) {
    const attempt = await orm.QuizAttempts.first({ attemptId: sourceAttemptId });
    if (attempt) {
      const qLinks = await orm.QuizQuestions.where({ quizId: attempt.quizId }).all();
      const qIds = qLinks.map((l) => l.questionId);
      if (qIds.length > 0) {
        const qSkills = await orm.QuestionSkills.where((qs) => qs.questionId.in(qIds)).all();
        for (const qs of qSkills) emphasizedSkillIds.add(qs.skillId);
      }
    }
  }

  const needMap = new Map<number, number>();
  const weakSkillById = new Map<
    number,
    { skillId: number; skillCode: string; name: string; masteryProb: number }
  >();

  for (const w of weakSkills) {
    const gap = Math.max(0.01, MASTERY_THRESHOLD - w.masteryProb);
    const boost = emphasizedSkillIds.has(w.skillId) ? 1.25 : 1.0;
    needMap.set(w.skillId, gap * boost);
    weakSkillById.set(w.skillId, {
      skillId: w.skillId,
      skillCode: w.skill!.skillCode,
      name: w.skill!.name,
      masteryProb: w.masteryProb,
    });
  }

  const approvedCourses = await orm.Courses.where({ status: "approved" }).all();
  if (approvedCourses.length === 0) return [];
  const courseById = new Map(approvedCourses.map((c) => [c.courseId, c]));
  const approvedCourseIds = approvedCourses.map((c) => c.courseId);

  const [lessons, enrollments, progresses] = await Promise.all([
    orm.Lessons.where((l) => l.courseId.in(approvedCourseIds)).all(),
    orm.Enrollments.where({ userId }).all(),
    orm.LessonProgress.where({ userId }).all(),
  ]);

  if (lessons.length === 0) return [];
  const lessonIds = lessons.map((l) => l.lessonId);
  const lessonSkills = await orm.LessonSkills.where((ls) => ls.lessonId.in(lessonIds)).all();

  const skillsByLesson = new Map<number, Array<{ skillId: number; weight: number }>>();
  for (const ls of lessonSkills) {
    const list = skillsByLesson.get(ls.lessonId) ?? [];
    list.push({ skillId: ls.skillId, weight: ls.weight });
    skillsByLesson.set(ls.lessonId, list);
  }

  const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));
  const completedLessonIds = new Set(
    progresses.filter((p) => p.status === "completed").map((p) => p.lessonId),
  );

  const preferredLevel = getPreferredLevel(user.targetBand);

  type Candidate = {
    lesson: (typeof lessons)[number];
    course: (typeof approvedCourses)[number];
    primarySkill: { skillId: number; skillCode: string; name: string; masteryProb: number };
    baseScore: number;
  };

  const candidates: Candidate[] = [];

  for (const lesson of lessons) {
    const course = courseById.get(lesson.courseId);
    if (!course) continue;

    const tags = skillsByLesson.get(lesson.lessonId) ?? [];
    const matchingWeak = tags
      .map((t) => ({ tag: t, weak: weakSkillById.get(t.skillId) }))
      .filter((x): x is { tag: typeof tags[number]; weak: NonNullable<typeof x.weak> } => !!x.weak);

    if (matchingWeak.length === 0) continue;

    matchingWeak.sort(
      (a, b) =>
        (MASTERY_THRESHOLD - b.weak.masteryProb) * b.tag.weight -
        (MASTERY_THRESHOLD - a.weak.masteryProb) * a.tag.weight,
    );
    const primary = matchingWeak[0]!.weak;

    const cosSim = cosineSimilarity(needMap, tags);
    const urgency = (MASTERY_THRESHOLD - primary.masteryProb) / MASTERY_THRESHOLD;
    const remedialBonus = lesson.kind === "remedial" ? 0.20 : 0.05;
    const levelBonus = course.targetLevel === preferredLevel ? 0.10 : 0.0;
    const enrolledBonus = enrolledCourseIds.has(course.courseId) ? 0.08 : 0.0;
    const postQuizBonus = emphasizedSkillIds.has(primary.skillId) ? 0.12 : 0.0;
    const repeatPenalty = completedLessonIds.has(lesson.lessonId) ? -0.35 : 0.0;

    const rawScore =
      0.50 * cosSim +
      0.25 * urgency +
      remedialBonus +
      levelBonus +
      enrolledBonus +
      postQuizBonus +
      repeatPenalty;

    candidates.push({
      lesson,
      course,
      primarySkill: primary,
      baseScore: Math.max(0.01, Math.min(0.99, Math.round(rawScore * 100) / 100)),
    });
  }

  const selected: Array<Candidate & { finalScore: number; rank: number; rationale: string }> = [];
  const usedSkills = new Set<number>();
  const pool = [...candidates];

  while (selected.length < 3 && pool.length > 0) {
    let bestIdx = 0;
    let bestAdjusted = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i]!;
      const diversityPenalty = usedSkills.has(cand.primarySkill.skillId) ? 0.15 : 0;
      const adjusted = cand.baseScore - diversityPenalty;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIdx = i;
      }
    }

    const picked = pool.splice(bestIdx, 1)[0]!;
    usedSkills.add(picked.primarySkill.skillId);

    const finalScore = Math.max(0.01, Math.round(bestAdjusted * 100) / 100);
    const probFormatted = picked.primarySkill.masteryProb.toFixed(2);
    const rationale = `Recommended because your mastery of '${picked.primarySkill.name}' is ${probFormatted}, below ${MASTERY_THRESHOLD}.`;

    selected.push({
      ...picked,
      finalScore,
      rank: selected.length + 1,
      rationale,
    });
  }

  if (selected.length === 0) return [];

  const createdRows = await db.transaction(async (tx) => {
    const rows = [];
    for (const item of selected) {
      const row = await tx.orm.public.Recommendations.create({
        userId,
        skillId: item.primarySkill.skillId,
        lessonId: item.lesson.lessonId,
        quizId: null,
        sourceAttemptId: sourceAttemptId ?? null,
        masteryProb: item.primarySkill.masteryProb,
        rank: item.rank,
        score: item.finalScore,
        rationale: item.rationale,
      });
      rows.push(row);
    }
    return rows;
  });

  return buildRecommendationViews(createdRows);
};

export const getLatestRecommendations = async (userId: number): Promise<RecommendationView[]> => {
  const anyMastery = await orm.UserSkillMastery.first({ userId });
  if (!anyMastery) return [];

  const recentRows = await orm.Recommendations.where({ userId })
    .orderBy([(r) => r.createdAt.desc(), (r) => r.rank.asc()])
    .all();

  if (recentRows.length > 0) {
    const latestBatch: typeof recentRows = [];
    const seenRanks = new Set<number>();
    for (const row of recentRows) {
      if (seenRanks.has(row.rank) || row.rank > 3) break;
      seenRanks.add(row.rank);
      latestBatch.push(row);
      if (latestBatch.length === 3) break;
    }
    latestBatch.sort((a, b) => a.rank - b.rank);
    return buildRecommendationViews(latestBatch);
  }

  return generateRecommendationsForLearner(userId);
};

export const markRecommendationClicked = async (recommendationId: number, userId: number) => {
  const rec = await orm.Recommendations.first({ recommendationId });
  if (!rec) {
    throw httpError(404, "Recommendation not found");
  }
  if (rec.userId !== userId) {
    throw httpError(403, "You don't have permission to do this");
  }
  if (rec.clickedAt === null) {
    await orm.Recommendations.where({ recommendationId }).update({
      clickedAt: Temporal.Now.instant(),
    });
  }
};

export const buildRecommendationViews = async (
  rows: Array<{
    recommendationId: number;
    lessonId: number | null;
    quizId: number | null;
    skillId: number;
    masteryProb: number;
    rank: number;
    score: number;
    rationale: string;
    createdAt: Temporal.Instant;
    clickedAt: Temporal.Instant | null;
  }>,
): Promise<RecommendationView[]> => {
  if (rows.length === 0) return [];

  const lessonIds = rows.map((r) => r.lessonId).filter((id): id is number => id !== null);
  const quizIds = rows.map((r) => r.quizId).filter((id): id is number => id !== null);
  const skillIds = rows.map((r) => r.skillId);

  const [lessons, quizzes, skills] = await Promise.all([
    lessonIds.length > 0 ? orm.Lessons.where((l) => l.lessonId.in(lessonIds)).all() : [],
    quizIds.length > 0 ? orm.Quizzes.where((q) => q.quizId.in(quizIds)).all() : [],
    skillIds.length > 0 ? orm.Skills.where((s) => s.skillId.in(skillIds)).all() : [],
  ]);

  const courseIds = lessons.map((l) => l.courseId);
  const courses =
    courseIds.length > 0 ? await orm.Courses.where((c) => c.courseId.in(courseIds)).all() : [];

  const courseById = new Map(courses.map((c) => [c.courseId, c]));
  const lessonById = new Map(lessons.map((l) => [l.lessonId, l]));
  const quizById = new Map(quizzes.map((q) => [q.quizId, q]));
  const skillById = new Map(skills.map((s) => [s.skillId, s]));

  return rows.map((row) => {
    const lesson = row.lessonId !== null ? lessonById.get(row.lessonId) : undefined;
    const course = lesson ? courseById.get(lesson.courseId) : undefined;
    const quiz = row.quizId !== null ? quizById.get(row.quizId) : undefined;
    const skill = skillById.get(row.skillId);

    return {
      recommendationId: row.recommendationId,
      type: row.lessonId !== null ? "lesson" : "quiz",
      lesson:
        lesson && course
          ? {
              lessonId: lesson.lessonId,
              title: lesson.title,
              courseId: course.courseId,
              courseTitle: course.title,
            }
          : null,
      quiz: quiz
        ? {
            quizId: quiz.quizId,
            title: quiz.title,
          }
          : null,
      skill: {
        skillId: row.skillId,
        skillCode: skill?.skillCode ?? "UNKNOWN",
        name: skill?.name ?? "Unknown skill",
      },
      masteryProb: row.masteryProb,
      rank: row.rank,
      score: row.score,
      rationale: row.rationale,
      createdAt: row.createdAt,
      clickedAt: row.clickedAt,
    };
  });
};
