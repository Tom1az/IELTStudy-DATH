'use strict';
const { round, mean } = require('../utils/math');
const { notFound } = require('../utils/errors');

const CATEGORIES = ['listening', 'reading', 'writing', 'speaking'];

/**
 * Learner progress summary helper (radar chart and course completion).
 * Adapted to match schema.prisma (lowercase categories, integer IDs, skills.name, lessons.kind).
 */
function createProgressService({ repository, config, catalogProvider }) {
  const th = config.masteryThreshold;

  async function getProgress({ userId }) {
    const uid = Number(userId);
    const [mastery, completed, enrolled, { catalog, skills }] = await Promise.all([
      repository.getMastery(uid),
      repository.getCompletedLessonIds(uid),
      repository.getEnrolledCourseIds(uid),
      catalogProvider()
    ]);

    const radar = skills
      .map((s) => ({ ...s, skillId: Number(s.skillId ?? s.id), category: (s.category ?? s.skillCategory ?? '').toLowerCase() }))
      .filter((s) => mastery.has(s.skillId))
      .map((s) => ({
        skillId: s.skillId,
        skillCode: s.skillCode,
        name: s.name || s.description || s.skillCode,
        label: s.name || s.description || s.skillCode,
        category: s.category,
        mastery: round(mastery.get(s.skillId)),
        threshold: th
      }));

    const categories = CATEGORIES.map((c) => {
      const vals = radar.filter((r) => r.category === c).map((r) => r.mastery);
      return { category: c, mastery: round(mean(vals)), skillCount: vals.length };
    });

    const weak = radar.filter((r) => r.mastery < th).sort((a, b) => a.mastery - b.mastery);
    const strong = radar.filter((r) => r.mastery >= th).sort((a, b) => b.mastery - a.mastery);

    const courses = [];
    for (const rawCourseId of enrolled) {
      const courseId = Number(rawCourseId);
      const lessons = catalog.filter((l) => {
        const isRemedial = l.kind ? l.kind === 'remedial' : !!l.isRemedial;
        return Number(l.courseId) === courseId && !isRemedial;
      });
      if (!lessons.length) continue;
      const done = lessons.filter((l) => completed.has(Number(l.lessonId ?? l.id))).length;
      courses.push({
        courseId,
        title: lessons[0].courseTitle,
        totalCoreLessons: lessons.length,
        completedLessons: done,
        progressPercent: round((done / lessons.length) * 100, 1)
      });
    }

    return {
      userId: uid,
      threshold: th,
      summary: {
        overallMastery: round(mean(radar.map((r) => r.mastery))),
        weakSkillCount: weak.length,
        masteredSkillCount: strong.length,
        lessonsCompleted: completed.size
      },
      radar,
      categories,
      weakSkills: weak,
      strongSkills: strong,
      courses
    };
  }

  async function completeLesson({ userId, lessonId }) {
    const uid = Number(userId);
    const lid = Number(lessonId);
    const { catalog } = await catalogProvider();
    if (!catalog.some((l) => Number(l.lessonId ?? l.id) === lid)) {
      throw notFound('Lesson not found');
    }
    if (repository.markLessonCompleted) {
      await repository.markLessonCompleted(uid, lid);
    }
    return { lessonId: lid, status: 'completed' };
  }

  return { getProgress, completeLesson };
}

module.exports = { createProgressService };