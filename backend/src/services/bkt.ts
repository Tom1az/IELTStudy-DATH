// Bayesian Knowledge Tracing: updates a learner's per-skill mastery from a submitted attempt.
// Runs inside the submit transaction (services/attempts.ts, finishAttempt), under the learner's
// advisory lock, so the grade, the responses and the mastery change are saved together.
import { db } from "../prisma/db.ts";
import type { Json } from "./questions.ts";
import { DEFAULT_BKT_PARAMS, getBktParams, PROB_MAX, PROB_MIN } from "./bkt-params.ts";

type Orm = typeof db.orm.public;

export type MasteryChange = {
  skillId: number;
  skillCode: string;
  name: string;
  before: number | null;
  after: number;
};

// What quiz_attempts.mastery_changes stores (docs/ERD.md, "JSONB shapes")
type StoredChange = { skillId: number; before: number | null; after: number };

const clampProb = (p: number): number => {
  const clamped = Math.max(PROB_MIN, Math.min(PROB_MAX, p));
  return Math.round(clamped * 10000) / 10000;
};

// One BKT step for one answer. `weight` is the question's Q-matrix weight for this skill: the
// posterior moves only that share of the way from the prior, and the learning transition is
// scaled the same way. The diagnostic measures without teaching, so it has no transitions.
export const computeBktStep = (
  prior: number,
  isCorrect: boolean,
  weight: number,
  params: { pLearn: number; pSlip: number; pGuess: number; pForget: number },
  disableTransitions: boolean,
): number => {
  const { pLearn, pSlip, pGuess, pForget } = params;

  let posterior: number;
  if (isCorrect) {
    const num = prior * (1 - pSlip);
    const den = num + (1 - prior) * pGuess;
    posterior = den > 0 ? num / den : prior;
  } else {
    const num = prior * pSlip;
    const den = num + (1 - prior) * (1 - pGuess);
    posterior = den > 0 ? num / den : prior;
  }

  const blendedPosterior = prior + weight * (posterior - prior);
  if (disableTransitions) {
    return clampProb(blendedPosterior);
  }

  const effectiveLearn = pLearn * weight;
  const effectiveForget = pForget * weight;
  return clampProb(blendedPosterior * (1 - effectiveForget) + (1 - blendedPosterior) * effectiveLearn);
};

// The stored changes with each skill's code and name, for the AttemptResult
export const describeChanges = async (orm: Orm, stored: Json | null): Promise<MasteryChange[]> => {
  const changes = (Array.isArray(stored) ? stored : []) as unknown as StoredChange[];
  if (changes.length === 0) return [];
  const skills = await orm.Skills.where((s) => s.skillId.in(changes.map((c) => c.skillId))).all();
  const skillById = new Map(skills.map((s) => [s.skillId, s]));
  const result: MasteryChange[] = [];
  for (const change of changes) {
    const skill = skillById.get(change.skillId);
    if (!skill) continue;
    result.push({ ...change, skillCode: skill.skillCode, name: skill.name });
  }
  return result;
};

// Applies a submitted attempt to the learner's mastery, once (an attempt that already has
// mastery_changes is returned as stored). The caller holds the learner's lock (lockLearner).
// - Answers are replayed in the order given; skipped questions count as wrong, after them.
// - Each answer updates every skill tagged on the question, weighted by the Q-matrix.
// - Diagnostic (cold start): no learning transitions, and every skill the diagnostic didn't
//   measure starts at the average of its category's measured skills (or its pInit).
// - An attempt without any answer (closed by the time limit) is no evidence: nothing changes.
export const applyAttemptMastery = async (orm: Orm, attemptId: number): Promise<MasteryChange[]> => {
  const attempt = await orm.QuizAttempts.first({ attemptId });
  if (!attempt || attempt.completedAt === null) return [];
  if (Array.isArray(attempt.masteryChanges) && attempt.masteryChanges.length > 0) {
    return describeChanges(orm, attempt.masteryChanges);
  }

  const quiz = await orm.Quizzes.first({ quizId: attempt.quizId });
  if (!quiz) return [];
  const isDiagnostic = quiz.kind === "diagnostic";

  const responses = await orm.QuestionResponses.where({ attemptId })
    .orderBy((r) => r.attemptOrder.asc())
    .all();
  if (responses.length === 0) return [];

  const quizLinks = await orm.QuizQuestions.where({ quizId: quiz.quizId })
    .orderBy((qq) => qq.orderIndex.asc())
    .all();
  const questionIds = quizLinks.map((l) => l.questionId);
  if (questionIds.length === 0) return [];

  const [allSkills, qSkills, existingRows] = await Promise.all([
    orm.Skills.orderBy((s) => s.skillId.asc()).all(),
    orm.QuestionSkills.where((qs) => qs.questionId.in(questionIds))
      .orderBy((qs) => qs.skillId.asc())
      .all(),
    orm.UserSkillMastery.where({ userId: attempt.userId }).all(),
  ]);
  const skillById = new Map(allSkills.map((s) => [s.skillId, s]));
  const existingBySkill = new Map(existingRows.map((r) => [r.skillId, r]));

  // Q-matrix rows; weights normally add up to 1, and are rescaled if they add up to more
  const weightsByQuestion = new Map<number, Array<{ skillId: number; weight: number }>>();
  for (const qs of qSkills) {
    const list = weightsByQuestion.get(qs.questionId) ?? [];
    list.push({ skillId: qs.skillId, weight: qs.weight });
    weightsByQuestion.set(qs.questionId, list);
  }
  for (const [questionId, list] of weightsByQuestion) {
    const sum = list.reduce((acc, item) => acc + item.weight, 0);
    if (sum > 1) {
      weightsByQuestion.set(questionId, list.map((item) => ({ ...item, weight: item.weight / sum })));
    }
  }

  const observations: Array<{ questionId: number; isCorrect: boolean }> = responses.map((r) => ({
    questionId: r.questionId,
    isCorrect: r.isCorrect,
  }));
  const answered = new Set(responses.map((r) => r.questionId));
  for (const questionId of questionIds) {
    if (!answered.has(questionId)) observations.push({ questionId, isCorrect: false });
  }

  const current = new Map<number, number>();
  const count = new Map<number, number>();
  const before = new Map<number, number | null>();
  const touched = new Set<number>();

  for (const obs of observations) {
    for (const tag of weightsByQuestion.get(obs.questionId) ?? []) {
      const skill = skillById.get(tag.skillId);
      if (!skill) continue;
      const params = getBktParams(skill.skillCode);
      if (!touched.has(tag.skillId)) {
        touched.add(tag.skillId);
        const existing = existingBySkill.get(tag.skillId);
        before.set(tag.skillId, existing ? existing.masteryProb : null);
        current.set(tag.skillId, existing ? existing.masteryProb : params.pInit);
        count.set(tag.skillId, existing ? existing.observations : 0);
      }
      current.set(
        tag.skillId,
        computeBktStep(current.get(tag.skillId)!, obs.isCorrect, tag.weight, params, isDiagnostic),
      );
      count.set(tag.skillId, count.get(tag.skillId)! + 1);
    }
  }

  if (isDiagnostic) {
    const byCategory = new Map<string, { sum: number; n: number }>();
    for (const skillId of touched) {
      const skill = skillById.get(skillId)!;
      const entry = byCategory.get(skill.category) ?? { sum: 0, n: 0 };
      entry.sum += current.get(skillId)!;
      entry.n += 1;
      byCategory.set(skill.category, entry);
    }
    for (const skill of allSkills) {
      if (touched.has(skill.skillId) || existingBySkill.has(skill.skillId)) continue;
      const avg = byCategory.get(skill.category);
      touched.add(skill.skillId);
      before.set(skill.skillId, null);
      current.set(
        skill.skillId,
        avg && avg.n > 0 ? clampProb(avg.sum / avg.n) : getBktParams(skill.skillCode).pInit,
      );
      count.set(skill.skillId, 1);
    }
  }

  const skillIds = Array.from(touched).sort((a, b) => a - b);
  for (const skillId of skillIds) {
    const masteryProb = current.get(skillId) ?? DEFAULT_BKT_PARAMS.pInit;
    const observationsCount = count.get(skillId) ?? 1;
    if (existingBySkill.has(skillId)) {
      await orm.UserSkillMastery.where({ userId: attempt.userId, skillId }).update({
        masteryProb,
        observations: observationsCount,
      });
    } else {
      await orm.UserSkillMastery.create({
        userId: attempt.userId,
        skillId,
        masteryProb,
        observations: observationsCount,
      });
    }
  }

  const stored: StoredChange[] = skillIds.map((skillId) => ({
    skillId,
    before: before.get(skillId) ?? null,
    after: current.get(skillId)!,
  }));
  await orm.QuizAttempts.where({ attemptId }).update({ masteryChanges: stored as unknown as Json });

  return stored.map((change) => {
    const skill = skillById.get(change.skillId)!;
    return { ...change, skillCode: skill.skillCode, name: skill.name };
  });
};

// GET /me/mastery
export const getLearnerMastery = async (userId: number) => {
  const rows = await db.orm.public.UserSkillMastery.where({ userId })
    .include("skill", (s) => s.select("skillCode", "name", "category"))
    .orderBy((m) => m.skillId.asc())
    .all();

  return rows
    .filter((r) => r.skill !== null)
    .map((r) => ({
      skillId: r.skillId,
      skillCode: r.skill!.skillCode,
      name: r.skill!.name,
      category: r.skill!.category,
      masteryProb: r.masteryProb,
      observations: r.observations,
      updatedAt: r.updatedAt,
    }));
};
