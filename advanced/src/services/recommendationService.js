'use strict';
const { recommend } = require('../recommender/recommend');
const { notFound, forbidden } = require('../utils/errors');
const { createCatalogCache } = require('./catalogCache');

function createRecommendationService({ repository, config }) {
  const cache = createCatalogCache(repository, config.cache.catalogTtlMs);

  async function getFocusSkillIds({ attemptId, requester }, client) {
    const attempt = await repository.getAttempt(attemptId, client);
    if (!attempt) throw notFound('Attempt not found');
    const reqUserId = Number(requester.userId ?? requester.id);
    if (attempt.userId !== reqUserId && requester.role !== 'admin') {
      throw forbidden('This is another learner\'s attempt');
    }
    const responses = await repository.getAttemptResponses(attemptId, client);
    const qs = await repository.getQuestionSkills(
      [...new Set(responses.map((r) => Number(r.questionId)))],
      client
    );
    const ids = new Set();
    for (const links of qs.values()) links.forEach((l) => ids.add(Number(l.skillId)));
    return ids;
  }

  /**
   * Computes up to 3 recommendations for skills below 0.65, saves them to the
   * `recommendations` table, and returns `{ recommendations, message }` per openapi.yaml.
   */
  async function getRecommendations({ userId, attemptId = null, focusSkillIds = null, limit, requester }, client) {
    const uid = Number(userId);
    const [mastery, profile, completed, enrolled, { catalog, skills }] = await Promise.all([
      repository.getMastery(uid, client),
      repository.getUserProfile(uid, client),
      repository.getCompletedLessonIds(uid, client),
      repository.getEnrolledCourseIds(uid, client),
      cache.get()
    ]);
    if (!profile) throw notFound('User not found');

    const resolvedFocus =
      focusSkillIds ||
      (attemptId != null
        ? await getFocusSkillIds({ attemptId, requester: requester || { userId: uid } }, client)
        : null);

    if (!mastery.size) {
      return {
        recommendations: [],
        message: 'Complete the diagnostic test to get personalized recommendations'
      };
    }

    const skillsById = new Map(skills.map((s) => [Number(s.skillId ?? s.id), s]));
    const result = recommend({
      masteryBySkill: mastery,
      skillsById,
      catalog,
      config,
      completedLessonIds: completed,
      enrolledCourseIds: enrolled,
      profile,
      focusSkillIds: resolvedFocus,
      limit: limit ? Number(limit) : config.recommender.defaultLimit
    });

    if (!result.items.length) {
      return {
        recommendations: [],
        message: 'No skills are currently below the 0.65 mastery threshold'
      };
    }

    const saved = await repository.saveRecommendations(
      {
        userId: uid,
        sourceAttemptId: attemptId != null ? Number(attemptId) : null,
        items: result.items
      },
      client
    );

    return {
      recommendations: saved,
      message: 'Recommendations retrieved'
    };
  }

  /** POST /recommendations/{recommendationId}/click */
  async function clickRecommendation({ recommendationId, requester }) {
    const recId = Number(recommendationId);
    const reqUserId = Number(requester.userId ?? requester.id);
    const row = await repository.getRecommendationById(recId);
    if (!row) throw notFound('Recommendation not found');
    if (row.userId !== reqUserId) {
      throw forbidden('This recommendation belongs to another learner');
    }
    await repository.clickRecommendation(recId);
    return { message: 'Recommendation click recorded' };
  }

  return {
    getRecommendations,
    clickRecommendation,
    invalidateCache: cache.invalidate,
    getCatalog: cache.get
  };
}

module.exports = { createRecommendationService };