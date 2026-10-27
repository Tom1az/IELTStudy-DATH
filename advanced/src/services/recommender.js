'use strict';
/**
 * Content-Based Filtering cho remedial micro-lessons.
 *
 *  - User profile  = vector "nhu cầu" need_s theo mastery BKT (cao khi mastery < 0.65)
 *  - Item profile  = vector weight của lesson trên các micro-skill (Q-Matrix cấp lesson)
 *  - Score         = cosine + mức lesson phủ đúng chỗ yếu + độ vừa sức + khớp target band
 *  - Re-ranking    = MMR để top-3 không bị lặp cùng một skill
 *
 * Toàn bộ là hàm thuần, độ phức tạp O(#lessons * #skills_per_lesson) => << 300 ms.
 */
const { THRESHOLD, MASTERED_AT } = require('./bkt');

const W = { cosine: 0.4, relevance: 0.3, difficulty: 0.2, band: 0.1 };
const MMR_LAMBDA = 0.7;
const REVIEW_PENALTY = 0.6; // lesson đã học xong vẫn có thể được gợi ý "ôn lại", nhưng bị trừ điểm

/** need_s: yếu -> cần học gấp; trung bình -> củng cố nhẹ; đã vững -> 0 */
function needVector(mastery, threshold = THRESHOLD, mastered = MASTERED_AT) {
  const need = {};
  for (const [s, m] of Object.entries(mastery)) {
    need[s] = m < threshold ? (threshold - m) / threshold : 0.1 * Math.max(0, (mastered - m) / mastered);
  }
  return need;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k in a) { na += a[k] * a[k]; if (k in b) dot += a[k] * b[k]; }
  for (const k in b) nb += b[k] * b[k];
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const bandToLevel = (band) => (band == null ? 2 : band <= 5.5 ? 1 : band <= 6.5 ? 2 : 3);

/** Cổng mở khoá module: mọi skill của module phải ≥ threshold. */
function evaluateGate(mastery, moduleSkillIds, threshold = THRESHOLD) {
  const blocking = moduleSkillIds.filter((s) => (mastery[s] ?? 0) < threshold);
  return { locked: blocking.length > 0, blockingSkills: blocking, threshold };
}

function rationale(type, lesson, weakSkills, locale) {
  const names = weakSkills.map((s) => `'${s.name}'`).join(', ');
  const m = weakSkills[0] ? weakSkills[0].mastery.toFixed(2) : null;
  if (locale === 'vi') {
    if (type === 'remedial') return `Gợi ý vì mức thành thạo tiềm ẩn ở ${names} (${m}) đang dưới ${THRESHOLD}`;
    if (type === 'review') return `Ôn lại vì ${names} (${m}) vẫn dưới ${THRESHOLD} sau lần học trước`;
    return 'Bạn đã vượt ngưỡng ở mọi kỹ năng – tiếp tục module kế tiếp trong lộ trình';
  }
  if (type === 'remedial') return `Recommended because latent mastery on ${names} (${m}) is below ${THRESHOLD}`;
  if (type === 'review') return `Review recommended: ${names} (${m}) is still below ${THRESHOLD} after your last attempt`;
  return 'All skills are above the threshold – continue with the next module in your path';
}

/**
 * @param {object} p
 * @param {Object<string,number>} p.mastery  skillId -> P(L)
 * @param {Array} p.lessons  [{id,title,level(1-3),orderIndex,completed,skills:[{skillId,code,weight}]}]
 * @param {number} [p.targetBand]
 * @param {number} [p.k=3]
 * @param {'en'|'vi'} [p.locale='en']
 */
function recommend({ mastery, lessons, targetBand, k = 3, locale = 'en', skillNames = {} }) {
  const t0 = process.hrtime.bigint();
  const need = needVector(mastery);
  const weakIds = Object.keys(mastery).filter((s) => mastery[s] < THRESHOLD);
  const targetLevel = bandToLevel(targetBand);
  const name = (s) => skillNames[s.skillId] || s.code || s.skillId;

  let ranked = [];
  if (weakIds.length) {
    const scored = [];
    for (const l of lessons) {
      const vec = {};
      let wSum = 0, rel = 0, mSum = 0;
      for (const s of l.skills) {
        vec[s.skillId] = s.weight; wSum += s.weight;
        rel += s.weight * (need[s.skillId] || 0);
        mSum += mastery[s.skillId] ?? 0.3;
      }
      if (!wSum) continue;
      const covers = l.skills.some((s) => weakIds.includes(s.skillId));
      if (!covers) continue; // chế độ remedial: chỉ lấy lesson đụng tới skill yếu
      const desired = 1 + 2 * (mSum / l.skills.length); // mastery thấp -> lesson dễ
      const difficulty = Math.max(0, 1 - Math.abs(l.level - desired) / 2);
      const band = 1 - Math.abs(l.level - targetLevel) / 2;
      let score = W.cosine * cosine(need, vec) + W.relevance * (rel / wSum) + W.difficulty * difficulty + W.band * band;
      if (l.completed) score *= REVIEW_PENALTY;
      scored.push({ lesson: l, score, vec });
    }
    // MMR re-ranking
    const picked = [];
    while (picked.length < k && scored.length) {
      let bi = -1, bv = -Infinity;
      scored.forEach((c, i) => {
        const redundancy = picked.reduce((mx, p) => Math.max(mx, cosine(c.vec, p.vec)), 0);
        const v = MMR_LAMBDA * c.score - (1 - MMR_LAMBDA) * redundancy;
        if (v > bv) { bv = v; bi = i; }
      });
      picked.push(scored.splice(bi, 1)[0]);
    }
    ranked = picked.map((c) => {
      const weak = c.lesson.skills
        .filter((s) => mastery[s.skillId] < THRESHOLD)
        .sort((a, b) => mastery[a.skillId] - mastery[b.skillId])
        .map((s) => ({ skillId: s.skillId, name: name(s), mastery: mastery[s.skillId] }));
      const type = c.lesson.completed ? 'review' : 'remedial';
      return { lessonId: c.lesson.id, title: c.lesson.title, type, score: +c.score.toFixed(4), targetSkills: weak, rationale: rationale(type, c.lesson, weak, locale) };
    });
  }

  if (ranked.length < k) {
    // Không còn skill yếu (hoặc thiếu nội dung remedial): đi tiếp lộ trình tuần tự.
    const have = new Set(ranked.map((r) => r.lessonId));
    const next = lessons.filter((l) => !l.completed && !have.has(l.id)).sort((a, b) => a.orderIndex - b.orderIndex).slice(0, k - ranked.length);
    for (const l of next) ranked.push({ lessonId: l.id, title: l.title, type: 'next_module', score: 0, targetSkills: [], rationale: rationale('next_module', l, [], locale) });
  }
  const latencyMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { items: ranked, weakSkills: weakIds, latencyMs: +latencyMs.toFixed(3) };
}

module.exports = { recommend, needVector, cosine, evaluateGate, bandToLevel };
