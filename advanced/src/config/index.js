'use strict';
const path = require('path');

/**
 * TẤT CẢ tham số có thể chỉnh nằm ở đây. Muốn đổi hành vi -> sửa file này,
 * không cần đụng vào logic.
 */
const defaults = {
  // Ngưỡng latent mastery: skill < ngưỡng => kích hoạt remediation (PDF mục 3 & 4)
  masteryThreshold: 0.65,

  // Ngân sách độ trễ cho /api/v1/recommendations (PDF: < 300 ms)
  latencyBudgetMs: 300,

  bkt: {
    // Tham số mặc định nếu skill chưa có trong bkt_params.json
    defaults: { pInit: 0.3, pLearn: 0.15, pSlip: 0.1, pGuess: 0.25, pForget: 0.0 },
    paramsFile: process.env.BKT_PARAMS_FILE || path.join(__dirname, 'bkt_params.json'),
    // Chặn xác suất để tránh kẹt ở 0/1 (BKT không phục hồi được từ 0 hoặc 1 tuyệt đối)
    minProb: 0.01,
    maxProb: 0.99,
    // Câu hỏi nhiều skill: nếu tổng weight > 1 thì chia lại để tổng = 1 (chia đều "trách nhiệm")
    normalizeMultiSkillWeights: true,
    // Placement chỉ ĐO, không dạy: bỏ bước learn/forget khi chạy bài chẩn đoán.
    // (Nếu bật learn, chỉ 1 câu đúng đã đẩy skill vượt ngưỡng 0.65 -> bỏ sót skill yếu.)
    placementDisablesLearning: true
  },

  // Quy đổi target_band -> level của khoá học (Beginner/Intermediate/Advanced)
  levels: [
    { name: 'beginner', maxBandExclusive: 5.5 },
    { name: 'intermediate', maxBandExclusive: 7.0 },
    { name: 'advanced', maxBandExclusive: Infinity }
  ],

  recommender: {
    defaultLimit: 3, // Precision@3
    maxLimit: 10,
    // Trọng số chấm điểm (content-based). Tổng không cần = 1.
    weights: {
      relevance: 0.45,      // cosine(need vector, lesson skill vector)
      urgency: 0.2,         // mức yếu nặng nhất mà bài học xử lý được
      level: 0.1,           // độ khớp level khoá học với target band
      remedial: 0.1,        // ưu tiên micro-lesson khi đang có skill yếu
      sequence: 0.15,       // bài kế tiếp trong khoá đã đăng ký (khi không bị khoá)
      enrolled: 0.05,       // bài thuộc khoá đã đăng ký
      repeatPenalty: 0.3    // trừ điểm bài remedial đã học xong nhưng skill vẫn yếu
    },
    diversityLambda: 0.3,    // MMR: càng cao càng tránh các gợi ý trùng skill
    nonFocusFactor: 0.5,     // post-quiz: skill không nằm trong quiz vừa làm giảm ảnh hưởng
    gating: { enabled: true } // khoá module kế tiếp nếu còn skill đã học nhưng chưa đạt ngưỡng
  },

  // Cache catalog (bài học/skill ít đổi) để giữ latency thấp
  cache: { catalogTtlMs: 60 * 1000 },

  // Trạng thái khoá học được coi là đã duyệt (Admin accept)
  publishedCourseStatus: 'approved',

  progress: { defaultHistoryLimit: 200 }
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/** Tạo config mới, cho phép override từng phần (dùng trong test / A-B simulation). */
function createConfig(overrides = {}) {
  return merge(defaults, overrides);
}

module.exports = { defaults, createConfig };
