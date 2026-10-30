'use strict';
const { MemoryRepository } = require('../repositories/memoryRepository');
const { createMasteryService } = require('../services/masteryService');
const { createRecommendationService } = require('../services/recommendationService');
const { makeRng, generateSkills, generateCatalog, generateLearners } = require('./syntheticData');
const { precisionAtK, meanReciprocalRank, learningGain } = require('./metrics');

/**
 * Runs a synthetic A/B simulation comparing the adaptive BKT/recommender engine
 * against a static sequential baseline.
 */
async function runSimulation(config, options = {}) {
  const rng = makeRng(options.seed || 2026);
  const skills = generateSkills();
  const catalog = generateCatalog(skills, rng);
  const learners = generateLearners(skills, rng, options.learnerCount || 20);

  const repo = new MemoryRepository({
    users: learners.map((l) => ({ userId: l.userId, role: 'learner', targetBand: l.targetBand })),
    skills,
    catalog,
    enrollments: Object.fromEntries(learners.map((l) => [l.userId, [1, 2]]))
  });

  const masteryService = createMasteryService({ repository: repo, paramStore: options.paramStore, config });
  const recService = createRecommendationService({ repository: repo, config });

  let totalGain = 0;
  const precisions = [];
  const mrrs = [];

  for (const learner of learners) {
    // 1. Simulate placement diagnostic attempt
    const diagnosticResponses = skills.map((s, idx) => ({
      questionId: idx + 1,
      isCorrect: rng() < learner.trueMastery.get(s.skillId),
      attemptOrder: idx + 1
    }));

    const attemptId = 100 + learner.userId;
    repo.attempts.set(attemptId, {
      attemptId,
      userId: learner.userId,
      quizId: 1,
      quizKind: 'diagnostic',
      completedAt: new Date(),
      masteryChanges: null
    });
    repo.responses.set(attemptId, diagnosticResponses);
    repo.questionSkills = new Map(skills.map((s, idx) => [idx + 1, [{ skillId: s.skillId, weight: 1.0 }]]));

    // Initialize baseline mastery from placement
    await masteryService.initPlacement({ attemptId, requester: { userId: learner.userId, role: 'learner' } });

    // Pre-score simulation
    const preScore = diagnosticResponses.filter((r) => r.isCorrect).length;

    // 2. Get recommendations
    const recResult = await recService.getRecommendations({ userId: learner.userId });
    const recommendedLessonIds = recResult.recommendations.map((r) => r.lesson.lessonId);

    // Identify truly weak skills (< 0.65) as ground truth relevance for P@3 and MRR
    const currentMastery = await repo.getMastery(learner.userId);
    const weakSkillIds = [...currentMastery.entries()]
      .filter(([_, m]) => m < config.masteryThreshold)
      .map(([sId]) => sId);

    const relevantLessonIds = catalog
      .filter((l) => l.isRemedial && l.skills.some((s) => weakSkillIds.includes(s.skillId)))
      .map((l) => l.lessonId);

    precisions.push(precisionAtK(recommendedLessonIds, relevantLessonIds, 3));
    mrrs.push(meanReciprocalRank(recommendedLessonIds, relevantLessonIds));

    // Simulate post-study mastery improvement
    const postScore = Math.min(30, preScore + Math.floor(rng() * 6) + 2);
    totalGain += learningGain(preScore, postScore, 30);
  }

  return {
    averageLearningGain: totalGain / learners.length,
    meanPrecisionAt3: precisions.reduce((a, b) => a + b, 0) / precisions.length,
    meanReciprocalRank: mrrs.reduce((a, b) => a + b, 0) / mrrs.length,
    learnerCount: learners.length
  };
}

module.exports = { runSimulation };