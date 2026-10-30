'use strict';
const path = require('path');

const defaults = {
  // Latent mastery threshold: skills below 0.65 trigger remediation
  masteryThreshold: 0.65,

  // Latency budget for /api/v1/recommendations (< 300 ms)
  latencyBudgetMs: 300,

  bkt: {
    defaults: { pInit: 0.3, pLearn: 0.15, pSlip: 0.1, pGuess: 0.25, pForget: 0.0 },
    paramsFile: process.env.BKT_PARAMS_FILE || path.join(__dirname, 'bkt_params.json'),
    minProb: 0.01,
    maxProb: 0.99,
    normalizeMultiSkillWeights: true,
    placementDisablesLearning: true
  },

  levels: [
    { name: 'beginner', maxBandExclusive: 5.5 },
    { name: 'intermediate', maxBandExclusive: 7.0 },
    { name: 'advanced', maxBandExclusive: Infinity }
  ],

  recommender: {
    defaultLimit: 3,
    maxLimit: 3,
    weights: {
      relevance: 0.45,
      urgency: 0.25,
      level: 0.15,
      remedial: 0.1,
      enrolled: 0.05,
      repeatPenalty: 0.3
    },
    diversityLambda: 0.3,
    nonFocusFactor: 0.5,
    gating: { enabled: true }
  },

  cache: { catalogTtlMs: 60 * 1000 },

  publishedCourseStatus: 'approved'
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

function createConfig(overrides = {}) {
  return merge(defaults, overrides);
}

module.exports = { defaults, createConfig };