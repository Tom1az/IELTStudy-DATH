'use strict';

/**
 * Computes gating state per enrolled course.
 * Core lessons are unlocked sequentially: the next uncompleted core lesson is locked
 * while any skill taught in a previously completed core lesson of that course is below threshold.
 */
function computeGates({ catalog, completedLessonIds, enrolledCourseIds, masteryBySkill, threshold, enabled }) {
  const byCourse = new Map();
  for (const l of catalog) {
    const courseId = Number(l.courseId);
    if (!enrolledCourseIds.has(courseId)) continue;
    if (!byCourse.has(courseId)) byCourse.set(courseId, []);
    byCourse.get(courseId).push(l);
  }

  const gates = [];
  for (const [courseId, lessons] of byCourse) {
    const isRemedial = (l) => (l.kind ? l.kind === 'remedial' : !!l.isRemedial);
    const getLessonId = (l) => Number(l.lessonId ?? l.id);

    const main = lessons.filter((l) => !isRemedial(l)).sort((a, b) => a.orderIndex - b.orderIndex);
    const next = main.find((l) => !completedLessonIds.has(getLessonId(l)));
    if (!next) continue;

    const studied = new Set();
    for (const l of main) {
      if (completedLessonIds.has(getLessonId(l))) {
        l.skills.forEach((s) => studied.add(Number(s.skillId)));
      }
    }

    const blockingSkills = [];
    if (enabled) {
      for (const skillId of studied) {
        const m = masteryBySkill.get(skillId);
        if (m !== undefined && m < threshold) blockingSkills.push({ skillId, mastery: m });
      }
      blockingSkills.sort((a, b) => a.mastery - b.mastery);
    }

    const remedialLessonIds = lessons
      .filter((l) => isRemedial(l) && l.skills.some((s) => blockingSkills.some((b) => b.skillId === Number(s.skillId))))
      .map(getLessonId);

    gates.push({
      courseId,
      courseTitle: next.courseTitle,
      nextLessonId: getLessonId(next),
      locked: blockingSkills.length > 0,
      blockingSkills,
      remedialLessonIds
    });
  }
  return gates;
}

module.exports = { computeGates };