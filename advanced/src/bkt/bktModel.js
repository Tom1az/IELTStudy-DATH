'use strict';
const { clamp } = require('../utils/math');

/**
 * Bayesian Knowledge Tracing (BKT) – theo dõi latent mastery theo micro-skill.
 *
 * Với mỗi lần trả lời:
 *   P(L|đúng) = P(L)(1-slip) / [P(L)(1-slip) + (1-P(L))·guess]
 *   P(L|sai)  = P(L)·slip     / [P(L)·slip     + (1-P(L))(1-guess)]
 *   P(L_next) = P(L|obs)(1-forget) + (1-P(L|obs))·learn
 *
 * Multi-skill (PDF mục 4: "Decoupling questions mapping to multiple skills"):
 * một câu hỏi gắn nhiều skill qua Q-matrix (weight). Ta cập nhật TÁCH RỜI từng
 * skill, và dùng weight làm "độ mạnh bằng chứng":
 *   P_blend = P_prior + w·(P_post − P_prior)
 */

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

/** Chuẩn hoá weight của các skill trong 1 câu hỏi (tổng > 1 thì chia lại). */
function normalizeLinks(links, enabled) {
  if (!enabled) return links;
  const sum = links.reduce((s, l) => s + l.weight, 0);
  return sum > 1 ? links.map((l) => ({ ...l, weight: l.weight / sum })) : links;
}

/**
 * Áp dụng một chuỗi câu trả lời lên vector mastery.
 *
 * @param {object} a
 * @param {Map<string,number>} a.prior        skillId -> mastery hiện tại (có thể rỗng)
 * @param {Array<{questionId:string,isCorrect:boolean,attemptOrder:number}>} a.responses
 * @param {Map<string,Array<{skillId:string,weight:number}>>} a.questionSkills  Q-matrix
 * @param {Map<string,{id:string,skillCode:string}>} a.skillsById
 * @param {{getParams:Function}} a.paramStore
 * @param {object} a.bktConfig  config.bkt
 * @returns {{state:Map<string,number>, evidence:Map<string,number>}}
 */
function applyResponses({ prior, responses, questionSkills, skillsById, paramStore, bktConfig }) {
  const state = new Map(prior);
  const evidence = new Map();
  const ordered = [...responses].sort((a, b) => a.attemptOrder - b.attemptOrder);

  for (const r of ordered) {
    const links = normalizeLinks(
      questionSkills.get(r.questionId) || [],
      bktConfig.normalizeMultiSkillWeights
    );
    for (const { skillId, weight } of links) {
      const skill = skillsById.get(skillId);
      if (!skill) continue;
      const params = paramStore.getParams(skill.skillCode);
      const p0 = state.has(skillId) ? state.get(skillId) : params.pInit;
      const p1 = updateSkillMastery(p0, r.isCorrect, params, weight);
      state.set(skillId, clamp(p1, bktConfig.minProb, bktConfig.maxProb));
      evidence.set(skillId, (evidence.get(skillId) || 0) + 1);
    }
  }
  return { state, evidence };
}

module.exports = { updateSkillMastery, applyResponses, normalizeLinks };
