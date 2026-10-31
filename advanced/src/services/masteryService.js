'use strict';
const { applyResponses } = require('../bkt/bktModel');
const { buildBaseline } = require('../bkt/placement');
const { notFound, forbidden, badRequest, conflict } = require('../utils/errors');
const { round } = require('../utils/math');

function createMasteryService({ repository, paramStore, config }) {
  async function loadAttempt({ attemptId, requester }, client) {
    const attempt = await repository.getAttempt(attemptId, client);
    if (!attempt) throw notFound('Attempt not found');
    const reqUserId = String(requester.userId ?? requester.id);
    if (String(attempt.userId) !== reqUserId && requester.role !== 'admin') {
      throw forbidden("This is another learner's attempt");
    }
    if (!attempt.completedAt) throw badRequest('Attempt is not completed yet');

    const responses = await repository.getAttemptResponses(attemptId, client);
    const quizQuestionIds = repository.getQuizQuestionIds
      ? await repository.getQuizQuestionIds(attempt.quizId, client)
      : [];

    const answeredIds = new Set(responses.map((r) => String(r.questionId)));
    const allObservations = [...responses];
    let nextOrder = allObservations.length + 1;
    for (const qId of quizQuestionIds) {
      if (!answeredIds.has(String(qId))) {
        allObservations.push({ questionId: qId, isCorrect: false, attemptOrder: nextOrder++ });
      }
    }

    const uniqueQIds = [...new Set(allObservations.map((r) => r.questionId))];
    const questionSkills = await repository.getQuestionSkills(uniqueQIds, client);
    return { attempt, responses: allObservations, questionSkills };
  }

  function formatMasteryChanges(entries) {
    return entries.map((e) => ({
      skillId: e.skillId,
      skillCode: e.skillCode,
      name: e.name,
      before: e.before == null ? null : round(e.before),
      after: round(e.after)
    }));
  }

  async function processSubmittedAttempt({ attemptId, requester, client = null }) {
    const { attempt, responses, questionSkills } = await loadAttempt({ attemptId, requester }, client);
    if (attempt.masteryChanges !== null && attempt.masteryChanges !== undefined) {
      return {
        alreadyProcessed: true,
        masteryChanges: attempt.masteryChanges,
        touchedSkillIds: new Set(attempt.masteryChanges.map((m) => m.skillId))
      };
    }

    const [prior, skills] = await Promise.all([
      repository.getMastery(attempt.userId, client),
      repository.getSkills(client)
    ]);
    const skillsById = new Map(skills.map((s) => [s.skillId ?? s.id, s]));

    const isDiagnostic = attempt.quizKind === 'diagnostic';
    const { state, evidence } = isDiagnostic
      ? buildBaseline({ skills, responses, questionSkills, paramStore, bktConfig: config.bkt })
      : applyResponses({ prior, responses, questionSkills, skillsById, paramStore, bktConfig: config.bkt });

    const skillIdsToSave = isDiagnostic
      ? [...state.keys()].filter((skillId) => evidence.has(skillId))
      : [...evidence.keys()];

    const entries = skillIdsToSave.map((skillId) => {
      const sk = skillsById.get(skillId) || skillsById.get(String(skillId)) || skillsById.get(Number(skillId));
      return {
        skillId,
        skillCode: sk?.skillCode || '',
        name: sk?.name || sk?.description || sk?.skillCode || '',
        before: prior.has(skillId) ? round(prior.get(skillId)) : (prior.has(String(skillId)) ? round(prior.get(String(skillId))) : null),
        after: round(state.get(skillId) ?? state.get(String(skillId))),
        observations: evidence.get(skillId) ?? evidence.get(String(skillId)) ?? 0
      };
    });

    await repository.saveMasteryUpdate(
      { userId: attempt.userId, attemptId: attempt.attemptId, entries },
      client
    );

    return {
      alreadyProcessed: false,
      masteryChanges: formatMasteryChanges(entries),
      touchedSkillIds: new Set(evidence.keys())
    };
  }

  async function initPlacement({ attemptId, requester, client = null }) {
    const reqUserId = String(requester.userId ?? requester.id);
    const existing = await repository.getMastery(reqUserId, client);
    if (existing.size) throw conflict('Skill profile already initialized');

    const { attempt } = await loadAttempt({ attemptId, requester }, client);
    if (attempt.quizKind && attempt.quizKind !== 'diagnostic') {
      throw badRequest('Only a diagnostic quiz attempt can initialize placement mastery');
    }

    const result = await processSubmittedAttempt({ attemptId, requester, client });
    return { masteryChanges: result.masteryChanges, updates: result.masteryChanges.map(u => ({ ...u, belowThreshold: u.after < config.masteryThreshold })) };
  }

  async function processAttempt({ attemptId, requester, client = null }) {
    const result = await processSubmittedAttempt({ attemptId, requester, client });
    return {
      alreadyProcessed: result.alreadyProcessed,
      masteryChanges: result.masteryChanges,
      updates: result.masteryChanges.map(u => ({ ...u, belowThreshold: u.after < config.masteryThreshold }))
    };
  }

  async function getMastery(userId) {
    const rows = await repository.getMasteryRows(userId);
    return rows.map((r) => ({
      skillId: r.skillId,
      skillCode: r.skillCode,
      name: r.name,
      category: r.category,
      masteryProb: round(r.masteryProb),
      observations: Number(r.observations),
      updatedAt: r.updatedAt
    }));
  }

  return { initPlacement, processAttempt, processSubmittedAttempt, getMastery };
}

module.exports = { createMasteryService };