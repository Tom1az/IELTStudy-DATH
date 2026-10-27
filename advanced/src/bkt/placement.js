'use strict';
const { applyResponses } = require('./bktModel');
const { mean, clamp } = require('../utils/math');

/**
 * Khởi tạo skill vector ban đầu từ bài placement 30 câu (giải quyết cold-start).
 *  - Skill có bằng chứng: BKT chạy từ pInit.
 *  - Skill KHÔNG có câu nào trong bài placement: lấy trung bình của các skill
 *    cùng category đã có bằng chứng; nếu cả category không có thì dùng pInit.
 */
function buildBaseline({ skills, responses, questionSkills, paramStore, bktConfig }) {
  const skillsById = new Map(skills.map((s) => [s.id, s]));
  // Bài chẩn đoán không có "cơ hội học" -> tắt learn/forget (xem config.bkt.placementDisablesLearning)
  const effectiveParams = bktConfig.placementDisablesLearning
    ? { getParams: (code) => ({ ...paramStore.getParams(code), pLearn: 0, pForget: 0 }) }
    : paramStore;
  const prior = new Map(skills.map((s) => [s.id, paramStore.getParams(s.skillCode).pInit]));

  const { state, evidence } = applyResponses({
    prior, responses, questionSkills, skillsById, paramStore: effectiveParams, bktConfig
  });

  const byCategory = new Map();
  for (const s of skills) {
    if (!evidence.has(s.id)) continue;
    if (!byCategory.has(s.skillCategory)) byCategory.set(s.skillCategory, []);
    byCategory.get(s.skillCategory).push(state.get(s.id));
  }

  for (const s of skills) {
    if (evidence.has(s.id)) continue;
    const peers = byCategory.get(s.skillCategory);
    if (peers && peers.length) {
      state.set(s.id, clamp(mean(peers), bktConfig.minProb, bktConfig.maxProb));
    }
  }
  return { state, evidence };
}

module.exports = { buildBaseline };
