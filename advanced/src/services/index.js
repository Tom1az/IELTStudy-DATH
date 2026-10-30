'use strict';
const { createConfig } = require('../config');
const { ParamStore } = require('../bkt/paramStore');
const { createMasteryService } = require('./masteryService');
const { createRecommendationService } = require('./recommendationService');

function createServices({ repository, configOverrides, paramStore, logger = console }) {
  const config = createConfig(configOverrides);
  const params = paramStore || ParamStore.fromFile(config.bkt.paramsFile, config.bkt.defaults);

  const mastery = createMasteryService({ repository, paramStore: params, config });
  const recommendations = createRecommendationService({ repository, config, logger });

  /**
   * Hook for POST /attempts/{attemptId}/submit:
   * Updates BKT mastery (baseline if diagnostic, normal update otherwise) and logs
   * up to 3 post-quiz recommendations in the same database transaction.
   */
  async function onSubmitAttempt({ attemptId, user, client = null }) {
    const userId = Number(user.userId ?? user.id);
    const { masteryChanges, touchedSkillIds } = await mastery.processSubmittedAttempt({
      attemptId: Number(attemptId),
      requester: user,
      client
    });
    const { recommendations: recs } = await recommendations.getRecommendations(
      {
        userId,
        attemptId: Number(attemptId),
        focusSkillIds: touchedSkillIds,
        requester: user
      },
      client
    );
    return { masteryChanges, recommendations: recs };
  }

  return { config, paramStore: params, mastery, recommendations, onSubmitAttempt };
}

module.exports = { createServices };