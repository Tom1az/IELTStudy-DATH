'use strict';
const { applyResponses } = require('../bkt/bktModel');
const { buildBaseline } = require('../bkt/placement');
const { levelFromBand } = require('../recommender/level');
const { mean } = require('../utils/math');
const { makeRng, generateSkills, generateCatalog, generateLearners, LEVELS } = require('./syntheticData');
const { createStrategies } = require('./strategies');

/**
 * Mô phỏng A/B trên learner tổng hợp (PDF mục 4: Evaluation Plan).
 * Mỗi learner có "true mastery" ẩn; hệ thống chỉ thấy ước lượng BKT từ câu trả lời.
 *
 * Giả định mô hình học (chỉnh ở SIM): học 1 bài làm tăng mastery thật của skill
 *   m += gain · weight · (1 − m)   -> học lại skill đã giỏi mang lại rất ít.
 */
const SIM = {
  diagnosticQuestions: 30,
  practiceQuestions: 5,
  lessonGain: 0.22,
  remedialGain: 0.3,
  lessonMinutes: 20,
  remedialMinutes: 10,
  slip: 0.1,
  guess: 0.25
};

const answerProb = (m) => m * (1 - SIM.slip) + (1 - m) * SIM.guess;
/** Điểm kỳ vọng (0–100) của bài test phủ đều mọi skill. */
const expectedScore = (trueM) => 100 * mean([...trueM.values()].map(answerProb));

function answerQuestion(trueM, links, rng) {
  const mEff = links.reduce((s, l) => s + l.weight * trueM.get(l.skillId), 0) / links.reduce((s, l) => s + l.weight, 0);
  return rng() < answerProb(mEff);
}

function makeDiagnostic(skills, trueM, rng) {
  const questionSkills = new Map();
  const responses = [];
  for (let i = 0; i < SIM.diagnosticQuestions; i++) {
    const s1 = skills[Math.floor(rng() * skills.length)];
    const links = [{ skillId: s1.id, weight: 1 }];
    if (rng() < 0.3) {
      const s2 = skills[Math.floor(rng() * skills.length)];
      if (s2.id !== s1.id) { links[0].weight = 0.6; links.push({ skillId: s2.id, weight: 0.4 }); }
    }
    questionSkills.set(`d${i}`, links);
    responses.push({ questionId: `d${i}`, isCorrect: answerQuestion(trueM, links, rng), attemptOrder: i });
  }
  return { responses, questionSkills };
}

function simulateLearner({ name, learner, ctx, seed }) {
  const { skills, skillsById, catalog, strategies, paramStore, config } = ctx;
  const th = config.masteryThreshold;
  const rng = makeRng(seed);
  const trueM = new Map(learner.trueMastery);
  const lessonsById = new Map(catalog.map((l) => [l.id, l]));
  const level = levelFromBand(learner.targetBand, config.levels);
  const enrolled = new Set([`c${LEVELS.indexOf(level) + 1}`]);

  // Placement -> skill vector ban đầu (cold-start)
  const diag = makeDiagnostic(skills, trueM, rng);
  let { state: est } = buildBaseline({ skills, ...diag, paramStore, bktConfig: config.bkt });

  const initialWeak = new Set([...trueM].filter(([, m]) => m < th).map(([id]) => id));
  const pre = expectedScore(trueM);
  const completed = new Set();
  let minutes = 0;
  let mastered = initialWeak.size === 0;
  let minutesToMastery = mastered ? 0 : null;
  const p3 = [];
  const rr = [];

  for (let step = 0; step < ctx.steps; step++) {
    const top = strategies[name]({ est, completed, learner, enrolled });
    if (!top.length) break;

    // Precision@3 / MRR đo TẠI CÙNG MỘT TRẠNG THÁI (ngay sau placement, step 0) để so sánh công bằng.
    // Nếu đo trung bình qua mọi bước, strategy giúp người học tiến bộ nhanh hơn sẽ bị "phạt"
    // vì còn ít skill yếu thật để gợi ý. Ground truth: skill chính của bài đang yếu thật.
    if (step === 0) {
      const relevant = top.map((id) => {
        const l = lessonsById.get(id);
        const primary = l.skills.reduce((a, b) => (b.weight > a.weight ? b : a));
        return trueM.get(primary.skillId) < th;
      });
      p3.push(relevant.filter(Boolean).length / 3);
      const first = relevant.indexOf(true);
      rr.push(first < 0 ? 0 : 1 / (first + 1));
    }

    const lesson = lessonsById.get(top[0]);
    const gain = lesson.isRemedial ? SIM.remedialGain : SIM.lessonGain;
    for (const s of lesson.skills) {
      const m = trueM.get(s.skillId);
      trueM.set(s.skillId, m + gain * s.weight * (1 - m));
    }
    minutes += lesson.isRemedial ? SIM.remedialMinutes : SIM.lessonMinutes;
    completed.add(lesson.id);

    // Practice quiz sau bài học -> BKT cập nhật ước lượng (giống masteryService.processAttempt)
    const qs = new Map();
    const responses = [];
    for (let i = 0; i < SIM.practiceQuestions; i++) {
      const links = [lesson.skills[i % lesson.skills.length]];
      qs.set(`p${step}-${i}`, [{ skillId: links[0].skillId, weight: 1 }]);
      responses.push({ questionId: `p${step}-${i}`, isCorrect: answerQuestion(trueM, links, rng), attemptOrder: i });
    }
    est = applyResponses({
      prior: est, responses, questionSkills: qs, skillsById, paramStore, bktConfig: config.bkt
    }).state;

    if (!mastered && [...initialWeak].every((id) => trueM.get(id) >= th)) {
      mastered = true;
      minutesToMastery = minutes;
    }
  }

  const post = expectedScore(trueM);
  return {
    gain: (post - pre) / (100 - pre),
    precisionAt3: mean(p3),
    mrr: mean(rr),
    minutesToMastery: mastered ? minutesToMastery : minutes, // censored: chưa đạt -> tính toàn bộ thời gian
    reached: mastered
  };
}

/**
 * @param {{learners?:number, steps?:number, seed?:number, configOverrides?:object}} opts
 */
function runEvaluation({ learners = 200, steps = 40, seed = 42, config, paramStore }) {
  const rng = makeRng(seed);
  const skills = generateSkills();
  const catalog = generateCatalog(skills, rng);
  const skillsById = new Map(skills.map((s) => [s.id, s]));
  const popularity = new Map(catalog.map((l) => [l.id, rng() ** 3]));
  const strategies = createStrategies({ catalog, skillsById, config, popularity });
  const population = generateLearners(skills, rng, learners);
  const ctx = { skills, skillsById, catalog, strategies, paramStore, config, steps };

  const report = {};
  for (const name of Object.keys(strategies)) {
    const runs = population.map((learner, i) => simulateLearner({ name, learner, ctx, seed: seed * 1000 + i }));
    report[name] = {
      normalizedGain: mean(runs.map((r) => r.gain)),
      precisionAt3: mean(runs.map((r) => r.precisionAt3)),
      mrr: mean(runs.map((r) => r.mrr)),
      minutesToMastery: mean(runs.map((r) => r.minutesToMastery)),
      reachedMasteryRate: runs.filter((r) => r.reached).length / runs.length
    };
  }

  const h = report.hybrid;
  report.improvement = {};
  for (const base of ['sequential', 'popularity']) {
    const b = report[base];
    report.improvement[base] = {
      normalizedGainRelative: (h.normalizedGain - b.normalizedGain) / b.normalizedGain,
      timeToMasteryReduction: (b.minutesToMastery - h.minutesToMastery) / b.minutesToMastery
    };
  }
  return report;
}

module.exports = { runEvaluation, SIM };
