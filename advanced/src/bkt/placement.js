'use strict';
const { applyResponses } = require('./bktModel');
const { mean, clamp } = require('../utils/math');

function buildBaseline({ skills, responses, questionSkills, paramStore, bktConfig }) {
  const normalizedSkills = skills.map((s) => ({
    ...s,
    skillId: s.skillId ?? s.id,
    category: s.category ?? s.skillCategory
  }));
  const skillsById = new Map(normalizedSkills.map((s) => [s.skillId, s]));

  const effectiveParams = bktConfig.placementDisablesLearning
    ? { getParams: (code) => ({ ...paramStore.getParams(code), pLearn: 0, pForget: 0 }) }
    : paramStore;
  const prior = new Map(
    normalizedSkills.map((s) => [s.skillId, paramStore.getParams(s.skillCode).pInit])
  );

  const { state, evidence } = applyResponses({
    prior,
    responses,
    questionSkills,
    skillsById,
    paramStore: effectiveParams,
    bktConfig
  });

  const byCategory = new Map();
  for (const s of normalizedSkills) {
    if (!evidence.has(s.skillId) && !evidence.has(String(s.skillId))) continue;
    const val = state.get(s.skillId) ?? state.get(String(s.skillId));
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category).push(val);
  }

  for (const s of normalizedSkills) {
    if (evidence.has(s.skillId) || evidence.has(String(s.skillId))) continue;
    const peers = byCategory.get(s.category);
    if (peers && peers.length) {
      state.set(s.skillId, clamp(mean(peers), bktConfig.minProb, bktConfig.maxProb));
    }
  }
  return { state, evidence };
}

module.exports = { buildBaseline };