'use strict';
/**
 * Bayesian Knowledge Tracing (BKT) – bản chạy trên Node.js runtime.
 * Tham số (pL0, pT, pS, pG) được fit offline bằng pyBKT rồi nạp từ JSON.
 *
 * Multi-skill (Q-Matrix): một câu hỏi gắn nhiều skill với weight w_s.
 * Ta "tách" (decouple) câu hỏi thành các cập nhật độc lập cho từng skill, trong đó
 * độ mạnh của bằng chứng (evidence) = w_s / max(w) -> skill chính nhận đủ bằng chứng,
 * skill phụ nhận ít hơn. Mỗi cập nhật là O(1) nên toàn bộ attempt rất nhanh.
 */
const config = require('../config/bktParams.json');

const EPS = 1e-3;
const clamp = (x, lo = EPS, hi = 1 - EPS) => Math.min(hi, Math.max(lo, x));

/** Lấy tham số cho 1 skill, ép pS,pG về vùng "identifiable" (pS + pG < 1). */
function getParams(skillCode, cfg = config) {
  const p = { ...cfg.default, ...(cfg.skills && cfg.skills[skillCode]) };
  p.pS = Math.min(p.pS, 0.3);
  p.pG = Math.min(p.pG, 0.3);
  return p;
}

/** P(L | quan sát) theo Bayes. */
function posterior(prior, correct, { pS, pG }) {
  if (correct) {
    const num = prior * (1 - pS);
    return num / (num + (1 - prior) * pG);
  }
  const num = prior * pS;
  return num / (num + (1 - prior) * (1 - pG));
}

/**
 * Cập nhật mastery sau một lần trả lời.
 * @param {number} prior    P(L_t)
 * @param {boolean} correct
 * @param {object} params   {pL0,pT,pS,pG}
 * @param {number} evidence 0..1 – độ mạnh bằng chứng (weight đã chuẩn hoá)
 */
function update(prior, correct, params, evidence = 1) {
  const post = posterior(prior, correct, params);
  const learned = post + (1 - post) * params.pT; // transition: học được sau khi làm bài
  return clamp(prior + evidence * (learned - prior));
}

/**
 * Áp dụng 1 response (có thể map nhiều skill) lên mastery map (mutate + trả về).
 * @param {Object<string,number>} mastery  skillId -> P(L)
 * @param {boolean} correct
 * @param {Array<{skillId:string, weight:number, params:object}>} qSkills
 */
function applyResponse(mastery, correct, qSkills) {
  const wMax = Math.max(...qSkills.map((s) => s.weight), EPS);
  for (const s of qSkills) {
    const prior = mastery[s.skillId] ?? s.params.pL0;
    mastery[s.skillId] = update(prior, correct, s.params, s.weight / wMax);
  }
  return mastery;
}

/**
 * Khởi tạo vector kỹ năng từ bài placement test 30 câu (giải quyết cold-start).
 * Dùng tỉ lệ đúng có trọng số, hiệu chỉnh nhiễu đoán mò/sơ suất, làm mượt về prior.
 * @param {Array<{correct:boolean, skills:Array<{skillId,weight,params}>}>} responses
 * @param {number} priorStrength số "câu giả định" kéo về prior (mặc định 1)
 */
function initFromPlacement(responses, priorStrength = 1) {
  const acc = {}; // skillId -> {w, c, params}
  for (const r of responses) {
    for (const s of r.skills) {
      const a = (acc[s.skillId] ||= { w: 0, c: 0, params: s.params });
      a.w += s.weight;
      a.c += s.weight * (r.correct ? 1 : 0);
    }
  }
  const out = {};
  for (const [skillId, a] of Object.entries(acc)) {
    const { pS, pG, pL0 } = a.params;
    const rate = a.c / a.w;
    const corrected = (rate - pG) / (1 - pS - pG); // P(correct) = L(1-pS) + (1-L)pG
    out[skillId] = clamp((a.w * clamp(corrected, 0, 1) + priorStrength * pL0) / (a.w + priorStrength));
  }
  return out;
}

module.exports = { getParams, posterior, update, applyResponse, initFromPlacement, clamp, THRESHOLD: config.threshold, MASTERED_AT: config.masteredAt };
