'use strict';
const { recommend } = require('../recommender/recommend');
const { notFound, forbidden, badRequest } = require('../utils/errors');
const { createCatalogCache } = require('./catalogCache');

/**
 * Service cho GET /api/v1/recommendations.
 * context = 'dashboard' (next best step) | 'post_quiz' (kèm attemptId).
 */
function createRecommendationService({ repository, config, logger = console }) {
  const cache = createCatalogCache(repository, config.cache.catalogTtlMs);

  async function getFocusSkillIds({ attemptId, requester }) {
    const attempt = await repository.getAttempt(attemptId);
    if (!attempt) throw notFound('Attempt not found');
    if (attempt.userId !== String(requester.id) && requester.role !== 'admin') {
      throw forbidden('Attempt does not belong to you');
    }
    const responses = await repository.getAttemptResponses(attemptId);
    const qs = await repository.getQuestionSkills([...new Set(responses.map((r) => r.questionId))]);
    const ids = new Set();
    for (const links of qs.values()) links.forEach((l) => ids.add(l.skillId));
    return ids;
  }

  async function getRecommendations({ userId, context = 'dashboard', attemptId, limit, requester }) {
    const t0 = process.hrtime.bigint();
    if (!['dashboard', 'post_quiz'].includes(context)) throw badRequest('Invalid context');
    if (context === 'post_quiz' && !attemptId) throw badRequest('attemptId is required for post_quiz');

    const [mastery, profile, completed, enrolled, { catalog, skills }] = await Promise.all([
      repository.getMastery(userId),
      repository.getUserProfile(userId),
      repository.getCompletedLessonIds(userId),
      repository.getEnrolledCourseIds(userId),
      cache.get()
    ]);
    if (!profile) throw notFound('User not found');

    // Luôn kiểm tra quyền sở hữu attempt trước (kể cả khi cold-start)
    const focusSkillIds = context === 'post_quiz'
      ? await getFocusSkillIds({ attemptId, requester: requester || { id: userId } })
      : null;

    // Chưa làm placement test -> chưa có skill vector (cold-start)
    if (!mastery.size) {
      return {
        userId, context, needsPlacement: true, items: [], weakSkills: [], gates: [],
        message: 'Take the 30-question placement test to get personalized recommendations.',
        meta: { latencyMs: elapsedMs(t0), withinBudget: true }
      };
    }

    const skillsById = new Map(skills.map((s) => [s.id, s]));
    const result = recommend({
      masteryBySkill: mastery, skillsById, catalog, config,
      completedLessonIds: completed, enrolledCourseIds: enrolled,
      profile, focusSkillIds, limit: limit ? Number(limit) : undefined
    });

    const latencyMs = elapsedMs(t0);
    const withinBudget = latencyMs < config.latencyBudgetMs;
    if (!withinBudget) logger.warn(`[recommendations] ${latencyMs}ms exceeds budget ${config.latencyBudgetMs}ms`);

    return {
      userId, context, needsPlacement: false,
      threshold: config.masteryThreshold,
      nextBestStep: result.items[0] || null,
      items: result.items,
      weakSkills: result.weakSkills.map((w) => ({
        ...w,
        skillCode: skillsById.get(w.skillId)?.skillCode,
        label: skillsById.get(w.skillId)?.description || skillsById.get(w.skillId)?.skillCode
      })),
      gates: result.gates,
      meta: { latencyMs, withinBudget, candidateCount: result.candidateCount }
    };
  }

  const elapsedMs = (t0) => Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;

  return { getRecommendations, invalidateCache: cache.invalidate, getCatalog: cache.get };
}

module.exports = { createRecommendationService };
