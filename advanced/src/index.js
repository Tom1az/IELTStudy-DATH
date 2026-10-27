'use strict';
module.exports = {
  bkt: require('./services/bkt'),
  recommender: require('./services/recommender'),
  progress: require('./services/progressService'),
  masteryService: require('./services/masteryService'),
  createAdaptiveRouter: require('./routes/recommendations').createAdaptiveRouter,
};
