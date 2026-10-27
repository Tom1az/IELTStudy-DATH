'use strict';
/**
 * Simulated A/B test trên learner tổng hợp (mục 4 – Evaluation Plan).
 * So sánh 3 chính sách: ADAPTIVE (BKT + CBF) vs SEQUENTIAL (giáo trình tĩnh) vs POPULARITY.
 * Metric: Normalized Learning Gain, Precision@3, MRR, Time-to-Mastery.
 *
 * Mô hình "thế giới thật" (ground truth) tách biệt với ước lượng của BKT:
 *   - learner có mastery thật p_s cho mỗi skill, học lesson => p_s tăng ∝ (1 - p_s) * weight * độ vừa sức
 *   - học viên làm 30 câu placement + 4 câu quiz sau mỗi lesson (có slip/guess) -> BKT chỉ thấy các câu này.
 * Đây là mô phỏng: kết quả phụ thuộc giả định, KHÔNG thay thế thử nghiệm với người học thật.
 */
const bkt = require('../src/services/bkt');
const { recommend } = require('../src/services/recommender');

const N_LEARNERS = +process.env.N || 500;
const BUDGET = +process.env.BUDGET || 45;       // ngân sách dài để đo Time-to-Mastery
const G_AT = +process.env.G_AT || 15;           // đo Normalized Learning Gain sau G_AT lesson
const N_SKILLS = 12, N_LESSONS = 60;
const CATS = ['Listening', 'Reading', 'Writing', 'Speaking'];
const TRUE = { pS: 0.1, pG: 0.2, learn: 0.35 }; // slip/guess của "thế giới thật"

function rngFactory(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function buildCatalog(rng) {
  const skills = Array.from({ length: N_SKILLS }, (_, i) => ({ id: 's' + i, code: `${CATS[i % 4]}:${i}` }));
  const lessons = Array.from({ length: N_LESSONS }, (_, i) => {
    const primary = skills[Math.floor(rng() * N_SKILLS)];
    const sk = [{ skillId: primary.id, code: primary.code, weight: 1 }];
    if (rng() < 0.4) { const sec = skills[Math.floor(rng() * N_SKILLS)]; if (sec.id !== primary.id) sk.push({ skillId: sec.id, code: sec.code, weight: 0.5 }); }
    return { id: i, title: 'L' + i, level: 1 + Math.floor(i / (N_LESSONS / 3)), orderIndex: i, completed: false, skills: sk, primary: primary.id };
  });
  const pop = lessons.map((l) => ({ id: l.id, w: Math.pow(rng(), 3) })); // phân phối lệch kiểu Zipf, độc lập với nhu cầu học viên
  const popularity = pop.sort((a, b) => b.w - a.w).map((x) => x.id);
  return { skills, lessons, popularity };
}

const pCorrect = (p) => p * (1 - TRUE.pS) + (1 - p) * TRUE.pG;
const ability = (truth) => 100 * Object.values(truth).reduce((a, b) => a + b, 0) / Object.keys(truth).length; // 0..100

function learn(truth, lesson) {
  for (const s of lesson.skills) {
    const desired = 1 + 2 * truth[s.skillId];
    const fit = 1 - 0.3 * Math.abs(lesson.level - desired) / 2;
    truth[s.skillId] += (1 - truth[s.skillId]) * TRUE.learn * s.weight * fit;
  }
}

function runLearner(policy, cat, seed) {
  const rng = rngFactory(seed);
  const truth = Object.fromEntries(cat.skills.map((s) => [s.id, 0.1 + 0.8 * rng()]));
  const targetBand = [5.5, 6.5, 7.5][Math.floor(rng() * 3)];
  const lessons = cat.lessons.map((l) => ({ ...l, completed: false }));
  const params = bkt.getParams('x');

  // placement 30 câu (đều cho policy nào cũng làm, nhưng chỉ ADAPTIVE dùng kết quả)
  const placement = [];
  for (let i = 0; i < 30; i++) {
    const s = cat.skills[i % N_SKILLS];
    placement.push({ correct: rng() < pCorrect(truth[s.id]), skills: [{ skillId: s.id, weight: 1, params }] });
  }
  let mastery = bkt.initFromPlacement(placement);

  const pre = ability(truth);
  let ttm = null; // số lesson tới khi mọi skill thật ≥ 0.65
  let prSum = 0, mrrSum = 0, steps = 0, postG = null;
  const allMastered = () => Object.values(truth).every((p) => p >= bkt.THRESHOLD);
  if (allMastered()) ttm = 0;

  for (let t = 0; t < BUDGET && ttm !== 0 && (ttm === null || t < G_AT); t++) {
    const todo = lessons.filter((l) => !l.completed);
    const relevant = new Set(todo.filter((l) => truth[l.primary] < bkt.THRESHOLD).map((l) => l.id)); // oracle
    let top3;
    if (policy === 'adaptive') top3 = recommend({ mastery, lessons, targetBand, k: 3 }).items.map((i) => i.lessonId);
    else if (policy === 'sequential') top3 = todo.slice(0, 3).map((l) => l.id);
    else top3 = cat.popularity.filter((id) => !lessons[id].completed).slice(0, 3);
    // Precision@3 và MRR so với oracle
    if (t < G_AT) {
      prSum += top3.filter((id) => relevant.has(id)).length / 3;
      const ri = top3.findIndex((id) => relevant.has(id));
      mrrSum += ri >= 0 ? 1 / (ri + 1) : 0; steps++;
    }

    const chosen = lessons[top3[0]];
    chosen.completed = true;
    learn(truth, chosen);
    // quiz sau lesson: 4 câu, BKT cập nhật (chỉ policy adaptive dùng, nhưng cập nhật luôn cho công bằng thống kê)
    for (let q = 0; q < 4; q++) {
      const s = chosen.skills[q % chosen.skills.length];
      const ok = rng() < pCorrect(truth[s.skillId]);
      bkt.applyResponse(mastery, ok, [{ skillId: s.skillId, weight: s.weight, params }]);
    }
    if (ttm === null && allMastered()) ttm = t + 1;
    if (t + 1 === G_AT) postG = ability(truth);
  }
  const post = postG ?? ability(truth);
  return { g: (post - pre) / (100 - pre), p3: prSum / steps, mrr: mrrSum / steps, ttm: ttm ?? BUDGET + 1, reached: ttm !== null, pre, post };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const ci95 = (a) => { const m = mean(a); const sd = Math.sqrt(mean(a.map((x) => (x - m) ** 2))); return 1.96 * sd / Math.sqrt(a.length); };

function main() {
  const cat = buildCatalog(rngFactory(42));
  const policies = ['adaptive', 'sequential', 'popularity'];
  const res = Object.fromEntries(policies.map((p) => [p, []]));
  for (let i = 0; i < N_LEARNERS; i++) for (const p of policies) res[p].push(runLearner(p, cat, 1000 + i)); // cùng seed => cùng learner (paired)

  const row = (p) => {
    const r = res[p];
    return { policy: p, 'g (mean±95%CI)': `${mean(r.map((x) => x.g)).toFixed(3)} ±${ci95(r.map((x) => x.g)).toFixed(3)}`,
      'Precision@3': mean(r.map((x) => x.p3)).toFixed(3), MRR: mean(r.map((x) => x.mrr)).toFixed(3),
      'Time-to-Mastery (lessons)': mean(r.map((x) => x.ttm)).toFixed(2), 'reached mastery %': (100 * mean(r.map((x) => +x.reached))).toFixed(1) };
  };
  console.log(`\nSimulated A/B – ${N_LEARNERS} learners, g@${G_AT} lessons, TTM budget ${BUDGET} lessons, ${N_LESSONS} lessons, ${N_SKILLS} skills\n`);
  console.table(policies.map(row));

  const gA = mean(res.adaptive.map((x) => x.g));
  for (const b of ['sequential', 'popularity']) {
    const gB = mean(res[b].map((x) => x.g));
    const tA = mean(res.adaptive.map((x) => x.ttm)), tB = mean(res[b].map((x) => x.ttm));
    console.log(`Adaptive vs ${b.padEnd(10)}: learning gain +${(100 * (gA - gB) / gB).toFixed(1)}% (relative) | time-to-mastery ${(100 * (tB - tA) / tB).toFixed(1)}% shorter (censored at ${BUDGET + 1})`);
  }
}
main();
