import "temporal-polyfill/global";
import { db } from "../prisma/db.ts";
import { DEFAULT_BKT_PARAMS, getBktParams, PROB_MAX, PROB_MIN } from "../config/bkt-params.ts";

const orm = db.orm.public;
type Orm = typeof db.orm.public;

export type MasteryChangeItem = {
  skillId: number;
  skillCode: string;
  name: string;
  before: number | null;
  after: number;
};

const clampProb = (p: number): number => {
  const clamped = Math.max(PROB_MIN, Math.min(PROB_MAX, p));
  return Math.round(clamped * 10000) / 10000;
};

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
  const nextMastery =
    blendedPosterior * (1 - effectiveForget) + (1 - blendedPosterior) * effectiveLearn;

  return clampProb(nextMastery);
};

export const processAttemptMastery = async (attemptId: number): Promise<MasteryChangeItem[]> => {
  const attempt = await orm.QuizAttempts.first({ attemptId });
  if (!attempt || attempt.completedAt === null) {
    return [];
  }

  const allSkills = await orm.Skills.orderBy((s) => s.skillId.asc()).all();
  const skillById = new Map(allSkills.map((s) => [s.skillId, s]));

  if (Array.isArray(attempt.masteryChanges) && attempt.masteryChanges.length > 0) {
    const saved = attempt.masteryChanges as Array<{
      skillId: number;
      before: number | null;
      after: number;
    }>;
    return saved
      .map((item) => {
        const sk = skillById.get(item.skillId);
        if (!sk) return null;
        return {
          skillId: item.skillId,
          skillCode: sk.skillCode,
          name: sk.name,
          before: item.before,
          after: item.after,
        };
      })
      .filter((x): x is MasteryChangeItem => x !== null);
  }

  const quiz = await orm.Quizzes.first({ quizId: attempt.quizId });
  if (!quiz) return [];
  const isDiagnostic = quiz.kind === "diagnostic";

  const quizLinks = await orm.QuizQuestions.where({ quizId: quiz.quizId })
    .orderBy((qq) => qq.orderIndex.asc())
    .all();
  const questionIds = quizLinks.map((l) => l.questionId);
  if (questionIds.length === 0) return [];

  const qSkills = await orm.QuestionSkills.where((qs) => qs.questionId.in(questionIds))
    .orderBy((qs) => qs.skillId.asc())
    .all();

  const weightsByQuestion = new Map<number, Array<{ skillId: number; weight: number }>>();
  for (const qs of qSkills) {
    const list = weightsByQuestion.get(qs.questionId) ?? [];
    list.push({ skillId: qs.skillId, weight: qs.weight });
    weightsByQuestion.set(qs.questionId, list);
  }

  for (const [qId, list] of weightsByQuestion.entries()) {
    const sum = list.reduce((acc, item) => acc + item.weight, 0);
    if (sum > 1) {
      weightsByQuestion.set(
        qId,
        list.map((item) => ({ skillId: item.skillId, weight: item.weight / sum })),
      );
    }
  }

  const responses = await orm.QuestionResponses.where({ attemptId })
    .orderBy((r) => r.attemptOrder.asc())
    .all();

  const orderedObservations: Array<{ questionId: number; isCorrect: boolean }> = [];
  const answeredSet = new Set<number>();

  for (const resp of responses) {
    orderedObservations.push({ questionId: resp.questionId, isCorrect: resp.isCorrect });
    answeredSet.add(resp.questionId);
  }
  for (const qId of questionIds) {
    if (!answeredSet.has(qId)) {
      orderedObservations.push({ questionId: qId, isCorrect: false });
    }
  }

  const existingRows = await orm.UserSkillMastery.where({ userId: attempt.userId }).all();
  const existingBySkill = new Map(existingRows.map((r) => [r.skillId, r]));

  const currentProb = new Map<number, number>();
  const obsCount = new Map<number, number>();
  const beforeProb = new Map<number, number | null>();
  const touchedSkills = new Set<number>();

  for (const obs of orderedObservations) {
    const tags = weightsByQuestion.get(obs.questionId) ?? [];
    for (const tag of tags) {
      const skill = skillById.get(tag.skillId);
      if (!skill) continue;

      const params = getBktParams(skill.skillCode);
      if (!touchedSkills.has(tag.skillId)) {
        touchedSkills.add(tag.skillId);
        const existing = existingBySkill.get(tag.skillId);
        beforeProb.set(tag.skillId, existing ? existing.masteryProb : null);
        currentProb.set(tag.skillId, existing ? existing.masteryProb : params.pInit);
        obsCount.set(tag.skillId, existing ? existing.observations : 0);
      }

      const prior = currentProb.get(tag.skillId)!;
      const next = computeBktStep(prior, obs.isCorrect, tag.weight, params, isDiagnostic);
      currentProb.set(tag.skillId, next);
      obsCount.set(tag.skillId, (obsCount.get(tag.skillId) ?? 0) + 1);
    }
  }

  if (isDiagnostic) {
    const categorySums = new Map<string, { sum: number; count: number }>();
    for (const skillId of touchedSkills) {
      const sk = skillById.get(skillId)!;
      const prob = currentProb.get(skillId)!;
      const entry = categorySums.get(sk.category) ?? { sum: 0, count: 0 };
      entry.sum += prob;
      entry.count += 1;
      categorySums.set(sk.category, entry);
    }

    for (const sk of allSkills) {
      if (!touchedSkills.has(sk.skillId) && !existingBySkill.has(sk.skillId)) {
        const catAvg = categorySums.get(sk.category);
        const fallback =
          catAvg && catAvg.count > 0
            ? clampProb(catAvg.sum / catAvg.count)
            : getBktParams(sk.skillCode).pInit;
        touchedSkills.add(sk.skillId);
        beforeProb.set(sk.skillId, null);
        currentProb.set(sk.skillId, fallback);
        obsCount.set(sk.skillId, 1);
      }
    }
  }

  const sortedTouchedIds = Array.from(touchedSkills).sort((a, b) => a - b);
  const dbChangesPayload = sortedTouchedIds.map((skillId) => ({
    skillId,
    before: beforeProb.get(skillId) ?? null,
    after: currentProb.get(skillId)!,
  }));

  await db.transaction(async (tx) => {
    await upsertMasteryRows(
      tx.orm.public,
      attempt.userId,
      sortedTouchedIds,
      existingBySkill,
      currentProb,
      obsCount,
    );

    await tx.orm.public.QuizAttempts.where({ attemptId }).update({
      masteryChanges: dbChangesPayload,
    });
  });

  return sortedTouchedIds.map((skillId) => {
    const sk = skillById.get(skillId)!;
    return {
      skillId,
      skillCode: sk.skillCode,
      name: sk.name,
      before: beforeProb.get(skillId) ?? null,
      after: currentProb.get(skillId)!,
    };
  });
};

const upsertMasteryRows = async (
  txOrm: Orm,
  userId: number,
  skillIds: number[],
  existingBySkill: Map<number, { masteryProb: number; observations: number }>,
  currentProb: Map<number, number>,
  obsCount: Map<number, number>,
) => {
  for (const skillId of skillIds) {
    const masteryProb = currentProb.get(skillId) ?? DEFAULT_BKT_PARAMS.pInit;
    const observations = obsCount.get(skillId) ?? 1;
    if (existingBySkill.has(skillId)) {
      await txOrm.UserSkillMastery.where({ userId, skillId }).update({
        masteryProb,
        observations,
      });
    } else {
      await txOrm.UserSkillMastery.create({
        userId,
        skillId,
        masteryProb,
        observations,
      });
    }
  }
};

export const getLearnerMastery = async (userId: number) => {
  const rows = await orm.UserSkillMastery.where({ userId })
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
