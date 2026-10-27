'use strict';
const { createConfig } = require('../config');
const { ParamStore } = require('../bkt/paramStore');
const { createMasteryService } = require('./masteryService');
const { createRecommendationService } = require('./recommendationService');
const { createProgressService } = require('./progressService');

/** Lắp ráp toàn bộ service. Backend chỉ cần truyền `repository` (pg hoặc memory). */
function createServices({ repository, configOverrides, paramStore, logger = console }) {
  const config = createConfig(configOverrides);
  const params = paramStore || ParamStore.fromFile(config.bkt.paramsFile, config.bkt.defaults);

  const mastery = createMasteryService({ repository, paramStore: params, config });
  const recommendations = createRecommendationService({ repository, config, logger });
  const progress = createProgressService({ repository, config, catalogProvider: recommendations.getCatalog });

  return { config, paramStore: params, mastery, recommendations, progress };
}

module.exports = { createServices };
