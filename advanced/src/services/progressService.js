'use strict';
const { round, mean } = require('../utils/math');
const { notFound } = require('../utils/errors');

const CATEGORIES = ['Listening', 'Reading', 'Writing', 'Speaking'];

/**
 * Theo dõi tiến độ: dữ liệu cho Learner Dashboard (radar chart, completion, trend).
 */
function createProgressService({ repository, config, catalogProvider }) {
  const th = config.masteryThreshold;

  async function getProgress({ userId, historyLimit }) {
    const limit = historyLimit || config.progress.defaultHistoryLimit;
    const [mastery, completed, enrolled, { catalog, skills }, history] = await Promise.all([
      repository.getMastery(userId),
      repository.getCompletedLessonIds(userId),
      repository.getEnrolledCourseIds(userId),
      catalogProvider(),
      repository.getMasteryHistory(userId, limit)
    ]);

    const skillsById = new Map(skills.map((s) => [s.id, s]));

    // Radar: mastery từng skill + trung bình 4 kỹ năng IELTS
    const radar = skills.filter((s) => mastery.has(s.id)).map((s) => ({
      skillId: s.id, skillCode: s.skillCode, category: s.skillCategory,
      label: s.description || s.skillCode, mastery: round(mastery.get(s.id)), threshold: th
    }));
    const categories = CATEGORIES.map((c) => {
      const vals = radar.filter((r) => r.category === c).map((r) => r.mastery);
      return { category: c, mastery: round(mean(vals)), skillCount: vals.length };
    });

    const weak = radar.filter((r) => r.mastery < th).sort((a, b) => a.mastery - b.mastery);
    const strong = radar.filter((r) => r.mastery >= th).sort((a, b) => b.mastery - a.mastery);

    // Completion theo khoá đã đăng ký (không tính micro-lesson remedial)
    const courses = [];
    for (const courseId of enrolled) {
      const lessons = catalog.filter((l) => l.courseId === courseId && !l.isRemedial);
      if (!lessons.length) continue;
      const done = lessons.filter((l) => completed.has(l.id)).length;
      courses.push({
        courseId, title: lessons[0].courseTitle, totalLessons: lessons.length,
        completedLessons: done, percent: round((done / lessons.length) * 100, 1)
      });
    }

    return {
      userId,
      threshold: th,
      summary: {
        overallMastery: round(mean(radar.map((r) => r.mastery))),
        weakSkillCount: weak.length,
        masteredSkillCount: strong.length,
        lessonsCompleted: completed.size
      },
      radar, categories, weakSkills: weak, strongSkills: strong, courses,
      trend: buildTrend(history, skillsById)
    };
  }

  /** Replay history theo thứ tự thời gian -> trung bình mastery từng category sau mỗi attempt. */
  function buildTrend(history, skillsById) {
    const state = new Map();
    const points = [];
    let currentAttempt = null;
    let at = null;
    const flush = () => {
      if (currentAttempt === null) return;
      const point = { attemptId: currentAttempt, at };
      for (const c of CATEGORIES) {
        const vals = [...state].filter(([id]) => skillsById.get(id)?.skillCategory === c).map(([, v]) => v);
        point[c] = vals.length ? round(mean(vals)) : null;
      }
      points.push(point);
    };
    for (const h of history) {
      if (h.attemptId !== currentAttempt) { flush(); currentAttempt = h.attemptId; }
      state.set(h.skillId, h.masteryAfter);
      at = h.createdAt;
    }
    flush();
    return points;
  }

  async function completeLesson({ userId, lessonId }) {
    const { catalog } = await catalogProvider();
    if (!catalog.some((l) => l.id === String(lessonId))) throw notFound('Lesson not found');
    await repository.markLessonCompleted(userId, lessonId);
    return { lessonId: String(lessonId), status: 'completed' };
  }

  return { getProgress, completeLesson };
}

module.exports = { createProgressService };
