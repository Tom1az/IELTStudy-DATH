'use strict';

/**
 * Gating: "weak scores on specific skills automatically trigger focused review
 * modules ... before moving forward" (PDF mục 2 & 3).
 *
 * Với mỗi khoá đã đăng ký: module kế tiếp bị KHOÁ nếu còn skill nào mà người học
 * ĐÃ học (xuất hiện trong bài đã hoàn thành của khoá) nhưng mastery < ngưỡng.
 * Mở khoá tự động khi mastery của các skill đó >= ngưỡng (sau quiz luyện tập).
 */
function computeGates({ catalog, completedLessonIds, enrolledCourseIds, masteryBySkill, threshold, enabled }) {
  const byCourse = new Map();
  for (const l of catalog) {
    if (!enrolledCourseIds.has(l.courseId)) continue;
    if (!byCourse.has(l.courseId)) byCourse.set(l.courseId, []);
    byCourse.get(l.courseId).push(l);
  }

  const gates = [];
  for (const [courseId, lessons] of byCourse) {
    const main = lessons.filter((l) => !l.isRemedial).sort((a, b) => a.orderIndex - b.orderIndex);
    const next = main.find((l) => !completedLessonIds.has(l.id));
    if (!next) continue; // đã học hết khoá

    const studied = new Set();
    for (const l of main) {
      if (completedLessonIds.has(l.id)) l.skills.forEach((s) => studied.add(s.skillId));
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
      .filter((l) => l.isRemedial && l.skills.some((s) => blockingSkills.some((b) => b.skillId === s.skillId)))
      .map((l) => l.id);

    gates.push({
      courseId,
      courseTitle: next.courseTitle,
      nextLessonId: next.id,
      locked: blockingSkills.length > 0,
      blockingSkills,
      remedialLessonIds
    });
  }
  return gates;
}

module.exports = { computeGates };
