'use strict';
/**
 * Chạy mô phỏng A/B:  node scripts/runEvaluation.js [--learners 200] [--steps 40] [--seed 42]
 * So sánh hybrid (BKT + content-based) với giáo trình tuần tự và popularity.
 */
const { createConfig } = require('../src/config');
const { ParamStore } = require('../src/bkt/paramStore');
const { runEvaluation } = require('../src/evaluation/simulator');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};

const config = createConfig();
const paramStore = ParamStore.fromFile(config.bkt.paramsFile, config.bkt.defaults);
const opts = { learners: arg('learners', 200), steps: arg('steps', 40), seed: arg('seed', 42) };
const report = runEvaluation({ ...opts, config, paramStore });

const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`\nSimulated A/B – ${opts.learners} learners, ${opts.steps} lessons each, seed ${opts.seed}\n`);
console.log('strategy     | norm. gain | P@3    | MRR    | min-to-mastery | reached');
for (const name of ['hybrid', 'sequential', 'popularity']) {
  const r = report[name];
  console.log(
    `${name.padEnd(12)} | ${r.normalizedGain.toFixed(3).padEnd(10)} | ${r.precisionAt3.toFixed(3)}  | ${r.mrr.toFixed(3)}  | ` +
    `${r.minutesToMastery.toFixed(0).padEnd(14)} | ${pct(r.reachedMasteryRate)}`
  );
}
for (const [base, v] of Object.entries(report.improvement)) {
  console.log(`\nhybrid vs ${base}: learning gain ${pct(v.normalizedGainRelative)}, study time ${pct(-v.timeToMasteryReduction)}`);
}
console.log('\nTargets (proposal): gain >= +15%, time-to-mastery -20..30%');
console.log('Notes: P@3/MRR measured right after placement; minutes-to-mastery is censored at the lesson budget (see reached%).');
console.log('Synthetic learners: results depend on SIM assumptions in src/evaluation/simulator.js.');
