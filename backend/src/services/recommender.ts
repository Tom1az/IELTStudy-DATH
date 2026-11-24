// Recommender (formula decided 2026-11-24; full text in openapi.yaml, GET /recommendations).
// For each weak skill (mastery < 0.65) it ranks the unlocked lessons tagged with it, keeps the
// top 3 with a diversity penalty, and logs them in `recommendations` (for Precision@3 / MRR).
// Core lessons come only from courses the learner is enrolled in; remedial lessons from any
// approved course, because any learner may open those.
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import { MASTERY_THRESHOLD } from "./bkt-params.ts";
import { gateCourseLessons } from "./gating.ts";
import { lockLearner } from "./learner-lock.ts";

type Orm = typeof db.orm.public;

type RecommendationRow = {
  recommendationId: number;
  userId: number;
  lessonId: number | null;
  quizId: number | null;
  skillId: number;
  masteryProb: number;
  rank: number;
  score: number;
  rationale: string;
  sourceAttemptId: number | null;
  createdAt: Temporal.Instant;
  clickedAt: Temporal.Instant | null;
};

export const TOP_K = 3;

const preferredLevel = (targetBand: number | null): "beginner" | "intermediate" | "advanced" => {
  if (targetBand === null || targetBand < 6.0) return "beginner";
  if (targetBand < 7.0) return "intermediate";
  return "advanced";
};

const cosineSimilarity = (
  need: Map<number, number>,
  tags: Array<{ skillId: number; weight: number }>,
): number => {
  if (need.size === 0 || tags.length === 0) return 0;
  let dot = 0;
  let tagNormSq = 0;
  for (const tag of tags) {
    dot += (need.get(tag.skillId) ?? 0) * tag.weight;
    tagNormSq += tag.weight * tag.weight;
  }
  let needNormSq = 0;
  for (const value of need.values()) needNormSq += value * value;
  const denom = Math.sqrt(needNormSq) * Math.sqrt(tagNormSq);
  return denom > 0 ? dot / denom : 0;
};

// Builds and saves one batch. Runs inside the caller's transaction, which holds the learner's
// lock. An attempt gets one batch only: a second call for the same attempt returns the first.
export const generateRecommendationRows = async (
  orm: Orm,
  userId: number,
  sourceAttemptId?: number,
): Promise<RecommendationRow[]> => {
  if (sourceAttemptId !== undefined) {
    const existing = await orm.Recommendations.where({ userId, sourceAttemptId })
      .orderBy((r) => r.rank.asc())
      .all();
    if (existing.length > 0) return existing;
  }

  const user = await orm.Users.first({ userId });
  if (!user) return [];

  const masteryRows = await orm.UserSkillMastery.where({ userId })
    .include("skill", (s) => s.select("skillId", "skillCode", "name", "category"))
    .all();
  const weakSkills = masteryRows
    .filter((m) => m.skill !== null && m.masteryProb < MASTERY_THRESHOLD)
    .sort((a, b) => a.masteryProb - b.masteryProb);
  if (weakSkills.length === 0) return [];

  // Skills in the quiz just taken get a boost: the learner is working on them right now
  const emphasized = new Set<number>();
  if (sourceAttemptId !== undefined) {
    const attempt = await orm.QuizAttempts.first({ attemptId: sourceAttemptId });
    if (attempt) {
      const links = await orm.QuizQuestions.where({ quizId: attempt.quizId }).all();
      if (links.length > 0) {
        const tags = await orm.QuestionSkills.where((qs) =>
          qs.questionId.in(links.map((l) => l.questionId)),
        ).all();
        for (const tag of tags) emphasized.add(tag.skillId);
      }
    }
  }

  const need = new Map<number, number>();
  const weakById = new Map<number, { skillId: number; name: string; masteryProb: number }>();
  for (const weak of weakSkills) {
    const gap = Math.max(0.01, MASTERY_THRESHOLD - weak.masteryProb);
    need.set(weak.skillId, gap * (emphasized.has(weak.skillId) ? 1.25 : 1));
    weakById.set(weak.skillId, { skillId: weak.skillId, name: weak.skill!.name, masteryProb: weak.masteryProb });
  }

  const courses = await orm.Courses.where({ status: "approved" }).all();
  if (courses.length === 0) return [];
  const courseById = new Map(courses.map((c) => [c.courseId, c]));
  const courseIds = courses.map((c) => c.courseId);

  const [lessons, enrollments, progress] = await Promise.all([
    orm.Lessons.where((l) => l.courseId.in(courseIds)).all(),
    orm.Enrollments.where({ userId }).all(),
    orm.LessonProgress.where({ userId }).all(),
  ]);
  if (lessons.length === 0) return [];
  const lessonSkills = await orm.LessonSkills.where((ls) =>
    ls.lessonId.in(lessons.map((l) => l.lessonId)),
  ).all();

  const tagsByLesson = new Map<number, Array<{ skillId: number; weight: number }>>();
  for (const ls of lessonSkills) {
    const list = tagsByLesson.get(ls.lessonId) ?? [];
    list.push({ skillId: ls.skillId, weight: ls.weight });
    tagsByLesson.set(ls.lessonId, list);
  }
  const enrolled = new Set(enrollments.map((e) => e.courseId));
  const completed = new Set(progress.filter((p) => p.status === "completed").map((p) => p.lessonId));

  // A locked lesson can't be opened, so recommending it would be a dead end
  const masteryBySkill = new Map(masteryRows.map((m) => [m.skillId, m.masteryProb]));
  const locked = new Set<number>();
  for (const courseId of courseIds) {
    const gates = gateCourseLessons(
      lessons.filter((l) => l.courseId === courseId),
      completed,
      masteryBySkill,
      tagsByLesson,
    );
    for (const gate of gates.values()) if (gate.locked) locked.add(gate.lessonId);
  }

  const level = preferredLevel(user.targetBand);
  type Candidate = {
    lessonId: number;
    primary: { skillId: number; name: string; masteryProb: number };
    baseScore: number;
  };
  const candidates: Candidate[] = [];

  for (const lesson of lessons) {
    const course = courseById.get(lesson.courseId)!;
    if (locked.has(lesson.lessonId)) continue;
    // A core lesson needs an enrolment, so only enrolled courses' core lessons can be opened
    if (lesson.kind === "core" && !enrolled.has(course.courseId)) continue;

    const tags = tagsByLesson.get(lesson.lessonId) ?? [];
    const matching = tags
      .map((tag) => ({ tag, weak: weakById.get(tag.skillId) }))
      .filter((x): x is { tag: (typeof tags)[number]; weak: NonNullable<typeof x.weak> } => !!x.weak);
    if (matching.length === 0) continue;

    matching.sort(
      (a, b) =>
        (MASTERY_THRESHOLD - b.weak.masteryProb) * b.tag.weight -
        (MASTERY_THRESHOLD - a.weak.masteryProb) * a.tag.weight,
    );
    const primary = matching[0]!.weak;

    const raw =
      0.5 * cosineSimilarity(need, tags) +
      0.25 * ((MASTERY_THRESHOLD - primary.masteryProb) / MASTERY_THRESHOLD) +
      (lesson.kind === "remedial" ? 0.2 : 0.05) +
      (course.targetLevel === level ? 0.1 : 0) +
      (enrolled.has(course.courseId) ? 0.08 : 0) +
      (emphasized.has(primary.skillId) ? 0.12 : 0) +
      (completed.has(lesson.lessonId) ? -0.35 : 0);

    candidates.push({
      lessonId: lesson.lessonId,
      primary,
      baseScore: Math.max(0.01, Math.min(0.99, Math.round(raw * 100) / 100)),
    });
  }

  // Greedy top 3, with a penalty for a skill already picked so the list covers several skills
  const picked: Array<Candidate & { finalScore: number }> = [];
  const usedSkills = new Set<number>();
  const pool = [...candidates];
  while (picked.length < TOP_K && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const adjusted = pool[i]!.baseScore - (usedSkills.has(pool[i]!.primary.skillId) ? 0.15 : 0);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIdx = i;
      }
    }
    const [choice] = pool.splice(bestIdx, 1);
    usedSkills.add(choice!.primary.skillId);
    picked.push({ ...choice!, finalScore: Math.max(0.01, Math.round(bestScore * 100) / 100) });
  }

  const rows: RecommendationRow[] = [];
  for (const [index, item] of picked.entries()) {
    rows.push(
      await orm.Recommendations.create({
        userId,
        skillId: item.primary.skillId,
        lessonId: item.lessonId,
        quizId: null,
        sourceAttemptId: sourceAttemptId ?? null,
        masteryProb: item.primary.masteryProb,
        rank: index + 1,
        score: item.finalScore,
        rationale: `Recommended because your mastery of '${item.primary.name}' is ${item.primary.masteryProb.toFixed(2)}, below ${MASTERY_THRESHOLD}.`,
      }),
    );
  }
  return rows;
};

// A new batch outside a submit (GET /recommendations with nothing current)
const generateInOwnTransaction = async (userId: number) => {
  const rows = await db.transaction(async (tx) => {
    await lockLearner(tx, userId);
    return generateRecommendationRows(tx.orm.public, userId);
  });
  return buildRecommendationViews(rows);
};

// GET /recommendations: the newest batch, without the items that no longer apply (the skill was
// mastered since, or the lesson was completed after it was recommended). If nothing is left, a
// new batch is made. A batch is the rows of one generation: newest first, until the source
// attempt changes or a rank repeats.
export const getLatestRecommendations = async (userId: number) => {
  const orm = db.orm.public;
  const masteryRows = await orm.UserSkillMastery.where({ userId }).all();
  if (masteryRows.length === 0) return [];

  const rows = await orm.Recommendations.where({ userId })
    .orderBy((r) => r.recommendationId.desc())
    .limit(TOP_K * 4)
    .all();
  if (rows.length === 0) return generateInOwnTransaction(userId);

  const batch: RecommendationRow[] = [];
  const ranks = new Set<number>();
  for (const row of rows) {
    if (row.sourceAttemptId !== rows[0]!.sourceAttemptId || ranks.has(row.rank)) break;
    ranks.add(row.rank);
    batch.push(row);
  }

  const masteryBySkill = new Map(masteryRows.map((m) => [m.skillId, m.masteryProb]));
  const lessonIds = batch.map((r) => r.lessonId).filter((id): id is number => id !== null);
  const progress =
    lessonIds.length > 0
      ? await orm.LessonProgress.where((p) =>
          and(p.userId.eq(userId), p.lessonId.in(lessonIds), p.completedAt.isNotNull()),
        ).all()
      : [];
  const completedAt = new Map(progress.map((p) => [p.lessonId, p.completedAt!]));

  const stillValid = batch.filter((row) => {
    if ((masteryBySkill.get(row.skillId) ?? 0) >= MASTERY_THRESHOLD) return false;
    const done = row.lessonId !== null ? completedAt.get(row.lessonId) : undefined;
    // A lesson finished before the recommendation was made stays: the recommender chose to repeat it
    return !done || Temporal.Instant.compare(done, row.createdAt) < 0;
  });
  if (stillValid.length === 0) return generateInOwnTransaction(userId);

  stillValid.sort((a, b) => a.rank - b.rank);
  return buildRecommendationViews(stillValid);
};

// The recommendations an attempt produced, for its result page
export const getAttemptRecommendations = async (userId: number, attemptId: number) => {
  const rows = await db.orm.public.Recommendations.where({ userId, sourceAttemptId: attemptId })
    .orderBy((r) => r.rank.asc())
    .all();
  return buildRecommendationViews(rows);
};

export const markRecommendationClicked = async (recommendationId: number, userId: number) => {
  const orm = db.orm.public;
  const rec = await orm.Recommendations.first({ recommendationId });
  if (!rec) {
    throw httpError(404, "Recommendation not found");
  }
  if (rec.userId !== userId) {
    throw httpError(403, "You don't have permission to do this");
  }
  if (rec.clickedAt === null) {
    await orm.Recommendations.where({ recommendationId }).update({ clickedAt: Temporal.Now.instant() });
  }
};

// The contract's Recommendation
export const buildRecommendationViews = async (rows: RecommendationRow[]) => {
  if (rows.length === 0) return [];
  const orm = db.orm.public;

  const lessonIds = rows.map((r) => r.lessonId).filter((id): id is number => id !== null);
  const quizIds = rows.map((r) => r.quizId).filter((id): id is number => id !== null);
  const [lessons, quizzes, skills, enrollments] = await Promise.all([
    lessonIds.length > 0 ? orm.Lessons.where((l) => l.lessonId.in(lessonIds)).all() : [],
    quizIds.length > 0 ? orm.Quizzes.where((q) => q.quizId.in(quizIds)).all() : [],
    orm.Skills.where((s) => s.skillId.in(rows.map((r) => r.skillId))).all(),
    orm.Enrollments.where({ userId: rows[0]!.userId }).all(),
  ]);
  const courseIds = lessons.map((l) => l.courseId);
  const courses = courseIds.length > 0 ? await orm.Courses.where((c) => c.courseId.in(courseIds)).all() : [];

  const courseById = new Map(courses.map((c) => [c.courseId, c]));
  const lessonById = new Map(lessons.map((l) => [l.lessonId, l]));
  const quizById = new Map(quizzes.map((q) => [q.quizId, q]));
  const skillById = new Map(skills.map((s) => [s.skillId, s]));
  const enrolled = new Set(enrollments.map((e) => e.courseId));

  return rows.map((row) => {
    const lesson = row.lessonId !== null ? lessonById.get(row.lessonId) : undefined;
    const course = lesson ? courseById.get(lesson.courseId) : undefined;
    const quiz = row.quizId !== null ? quizById.get(row.quizId) : undefined;
    const skill = skillById.get(row.skillId);
    return {
      recommendationId: row.recommendationId,
      type: row.lessonId !== null ? ("lesson" as const) : ("quiz" as const),
      lesson:
        lesson && course
          ? {
              lessonId: lesson.lessonId,
              title: lesson.title,
              courseId: course.courseId,
              courseTitle: course.title,
              isEnrolled: enrolled.has(course.courseId),
            }
          : null,
      quiz: quiz ? { quizId: quiz.quizId, title: quiz.title } : null,
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
