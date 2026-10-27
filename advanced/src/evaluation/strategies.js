'use strict';
const { recommend } = require('../recommender/recommend');
const { levelFromBand } = require('../recommender/level');
const { LEVELS } = require('./syntheticData');

/**
 * Mỗi strategy trả về top-k lesson id cho trạng thái hiện tại của người học.
 *  - hybrid     : BKT + content-based (hệ thống của ta)
 *  - sequential : giáo trình cố định (baseline 1)
 *  - popularity : bài phổ biến nhất chưa học (baseline 2)
 */
function createStrategies({ catalog, skillsById, config, popularity }) {
  const regular = catalog.filter((l) => !l.isRemedial);

  return {
    hybrid({ est, completed, learner, enrolled }) {
      const r = recommend({
        masteryBySkill: est, skillsById, catalog, config,
        completedLessonIds: completed, enrolledCourseIds: enrolled,
        profile: { targetBand: learner.targetBand }, limit: 3
      });
      return r.items.map((i) => i.lessonId);
    },

    sequential({ completed, learner }) {
      const start = LEVELS.indexOf(levelFromBand(learner.targetBand, config.levels));
      const rank = (l) => ((LEVELS.indexOf(l.targetLevel) - start + 3) % 3) * 1000 + l.orderIndex;
      return regular.filter((l) => !completed.has(l.id)).sort((a, b) => rank(a) - rank(b)).slice(0, 3).map((l) => l.id);
    },

    popularity({ completed }) {
      return catalog.filter((l) => !completed.has(l.id))
        .sort((a, b) => popularity.get(b.id) - popularity.get(a.id)).slice(0, 3).map((l) => l.id);
    }
  };
}

module.exports = { createStrategies };
