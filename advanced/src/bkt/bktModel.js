'use strict';
const { clamp } = require('../utils/math');

function updateSkillMastery(prior, isCorrect, params, weight = 1) {
  const { pSlip, pGuess, pLearn, pForget } = params;
  const w = clamp(weight, 0, 1);

  let posterior;
  if (isCorrect) {
    const num = prior * (1 - pSlip);
    const den = num + (1 - prior) * pGuess;
    posterior = den > 0 ? num / den : prior;
  } else {
    const num = prior * pSlip;
    const den = num + (1 - prior) * (1 - pGuess);
    posterior = den > 0 ? num / den : prior;
  }

  const blended = prior + w * (posterior - prior);
  return blended * (1 - pForget) + (1 - blended) * pLearn * w;
}

function normalizeLinks(links, enabled) {
  if (!enabled) return links;
  const sum = links.reduce((s, l) => s + l.weight, 0);
  return sum > 1 ? links.map((l) => ({ ...l, weight: l.weight / sum })) : links;
}

function applyResponses({ prior, responses, questionSkills, skillsById, paramStore, bktConfig }) {
  const state = new Map(prior);
  const evidence = new Map();
  const ordered = [...responses].sort((a, b) => a.attemptOrder - b.attemptOrder);

  for (const r of ordered) {
    const qKey = r.questionId;
    const links = normalizeLinks(
      questionSkills.get(qKey) || questionSkills.get(String(qKey)) || questionSkills.get(Number(qKey)) || [],
      bktConfig.normalizeMultiSkillWeights
    );
    for (const link of links) {
      const sKey = link.skillId;
      const weight = Number(link.weight);
      const skill = skillsById.get(sKey) || skillsById.get(String(sKey)) || skillsById.get(Number(sKey));
      if (!skill) continue;
      const params = paramStore.getParams(skill.skillCode);
      const p0 = state.has(sKey) ? state.get(sKey) : (state.has(String(sKey)) ? state.get(String(sKey)) : params.pInit);
      const p1 = updateSkillMastery(p0, r.isCorrect, params, weight);
      state.set(sKey, clamp(p1, bktConfig.minProb, bktConfig.maxProb));
      evidence.set(sKey, (evidence.get(sKey) || 0) + 1);
    }
  }
  return { state, evidence };
}

module.exports = { updateSkillMastery, applyResponses, normalizeLinks };