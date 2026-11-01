'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runEvaluation } = require('../src/evaluation/simulator');
const { config, paramStore } = require('./helpers');

test('simulation is reproducible and hybrid ranks truly-weak skills better than baselines', () => {
  const a = runEvaluation({ learners: 60, steps: 20, seed: 11, config, paramStore });
  const b = runEvaluation({ learners: 60, steps: 20, seed: 11, config, paramStore });
  assert.deepEqual(a, b);
  assert.ok(a.hybrid.precisionAt3 > a.sequential.precisionAt3);
  assert.ok(a.hybrid.precisionAt3 > a.popularity.precisionAt3);
  assert.ok(a.hybrid.normalizedGain > a.sequential.normalizedGain);
});
