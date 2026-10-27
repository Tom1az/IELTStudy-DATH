'use strict';
/**
 * Theo dõi tiến độ: tổng hợp dữ liệu cho Learner Dashboard (radar chart, trend, completion).
 * Hàm thuần – nhận dữ liệu đã query từ DB.
 */
const { THRESHOLD, MASTERED_AT } = require('./bkt');

const CATEGORIES = ['Listening', 'Reading', 'Writing', 'Speaking'];
const status = (m) => (m >= MASTERED_AT ? 'mastered' : m >= THRESHOLD ? 'proficient' : 'weak');

/**
 * @param {object} p
 * @param {Array<{skillId,code,category,description,mastery}>} p.skills
 * @param {Array<{skillId,mastery,at:Date}>} p.history  lịch sử mastery (để tính trend)
 * @param {{total:number, completed:number}} p.lessons
 * @param {number} [p.targetBand]
 * @param {Date} [p.now]
 */
function buildProgress({ skills, history = [], lessons, targetBand = null, now = new Date(), trendDays = 7 }) {
  const cutoff = now.getTime() - trendDays * 864e5;
  const oldest = {}; // mastery cũ nhất trong cửa sổ trend
  for (const h of [...history].sort((a, b) => new Date(a.at) - new Date(b.at))) {
    if (new Date(h.at).getTime() >= cutoff && !(h.skillId in oldest)) oldest[h.skillId] = h.mastery;
  }

  const detail = skills.map((s) => ({
    skillId: s.skillId, code: s.code, category: s.category,
    mastery: +s.mastery.toFixed(3), status: status(s.mastery),
    gapToThreshold: +Math.max(0, THRESHOLD - s.mastery).toFixed(3),
    trend: s.skillId in oldest ? +(s.mastery - oldest[s.skillId]).toFixed(3) : null,
  }));

  // Radar 4 trục = trung bình mastery theo kỹ năng IELTS
  const radar = CATEGORIES.map((c) => {
    const xs = detail.filter((d) => d.category === c);
    return { category: c, value: xs.length ? +(xs.reduce((a, d) => a + d.mastery, 0) / xs.length).toFixed(3) : null, skillCount: xs.length };
  });

  const weak = detail.filter((d) => d.status === 'weak').sort((a, b) => a.mastery - b.mastery);
  const overall = detail.length ? detail.reduce((a, d) => a + d.mastery, 0) / detail.length : 0;
  return {
    overallMastery: +overall.toFixed(3),
    skillsAboveThresholdPct: detail.length ? +(100 * detail.filter((d) => d.mastery >= THRESHOLD).length / detail.length).toFixed(1) : 0,
    completion: { ...lessons, pct: lessons.total ? +(100 * lessons.completed / lessons.total).toFixed(1) : 0 },
    targetBand, threshold: THRESHOLD, radar, skills: detail, weakSkills: weak.slice(0, 5),
  };
}

module.exports = { buildProgress, CATEGORIES };
