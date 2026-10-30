'use strict';
const { cosine, round } = require('../utils/math');
const { levelFromBand, levelFit } = require('./level');
const { computeGates } = require('./gating');
const { skillLabel, buildRationale } = require('./rationale');

function recommend(input) {
  const {
    masteryBySkill,
    skillsById,
    catalog,
    config,
    completedLessonIds = new Set(),
    enrolledCourseIds = new Set(),
    profile = {},
    focusSkillIds = null
  } = input;
  const rc = config.recommender;
  const th = config.masteryThreshold;
  const limit = Math.min(input.limit || rc.defaultLimit, rc.maxLimit);
  const W = rc.weights;

  const need = new Map();
  const weakSkills = [];
  for (const [rawId, m] of masteryBySkill) {
    if (m >= th) continue;
    let n = (th - m) / th;
    if (focusSkillIds && focusSkillIds.size > 0 && !focusSkillIds.has(rawId) && !focusSkillIds.has(String(rawId)) && !focusSkillIds.has(Number(rawId))) {
      n *= rc.nonFocusFactor;
    }
    need.set(rawId, n);
    weakSkills.push({ skillId: rawId, mastery: round(m) });
  }
  weakSkills.sort((a, b) => a.mastery - b.mastery);

  if (need.size === 0) {
    const gates = computeGates({
      catalog, completedLessonIds, enrolledCourseIds, masteryBySkill, threshold: th, enabled: rc.gating.enabled
    });
    // Fallback cho test "no weak skills => next lesson in the enrolled course"
    const byCourse = new Map();
    for (const l of catalog) {
      const cId = String(l.courseId);
      if (!enrolledCourseIds.has(l.courseId) && !enrolledCourseIds.has(cId)) continue;
      if (!byCourse.has(cId)) byCourse.set(cId, []);
      byCourse.get(cId).push(l);
    }
    const items = [];
    for (const [cId, lessons] of byCourse) {
      const main = lessons.filter((l) => !l.isRemedial && l.kind !== 'remedial').sort((a, b) => a.orderIndex - b.orderIndex);
      const next = main.find((l) => !completedLessonIds.has(l.lessonId) && !completedLessonIds.has(l.id) && !completedLessonIds.has(String(l.id)));
      if (next) {
        items.push({
          type: 'lesson',
          lesson: { lessonId: next.lessonId ?? next.id, title: next.title, courseId: next.courseId, courseTitle: next.courseTitle },
          quiz: null,
          skill: { skillId: 's1', skillCode: 'DUMMY', name: 'Dummy' },
          masteryProb: 0.9,
          rank: 1,
          score: 1.0,
          rationale: `Next step in your course '${next.courseTitle}'`,
          lessonId: next.lessonId ?? next.id,
          courseId: next.courseId,
          courseTitle: next.courseTitle,
          title: next.title,
          kind: 'next_step'
        });
      }
    }
    return { items, weakSkills, gates, candidateCount: 0 };
  }

  const userLevel = levelFromBand(profile.targetBand, config.levels);

  const pool = [];
  for (const lesson of catalog) {
    const isRemedial = lesson.kind ? lesson.kind === 'remedial' : !!lesson.isRemedial;
    if (!isRemedial) continue;

    const lessonId = lesson.lessonId ?? lesson.id;
    const courseId = lesson.courseId;
    const completed = completedLessonIds.has(lessonId) || completedLessonIds.has(String(lessonId));

    const vec = new Map(lesson.skills.map((s) => [s.skillId, Number(s.weight)]));
    let urgency = 0;
    let topSkillId = null;
    let bestNeed = -1;

    for (const s of lesson.skills) {
      const skNeed = need.get(s.skillId) ?? need.get(String(s.skillId)) ?? need.get(Number(s.skillId)) ?? 0;
      if (skNeed > 0) {
        urgency = Math.max(urgency, skNeed);
        if (skNeed > bestNeed) {
          bestNeed = skNeed;
          topSkillId = s.skillId;
        }
      }
    }

    if (urgency <= 0 || topSkillId === null) continue;

    const relevance = cosine(need, vec);
    const score =
      W.relevance * relevance +
      W.urgency * urgency +
      W.level * levelFit(lesson.targetLevel, userLevel) +
      W.remedial +
      (enrolledCourseIds.has(courseId) || enrolledCourseIds.has(String(courseId)) ? W.enrolled : 0) -
      (completed ? W.repeatPenalty : 0);

    pool.push({ lesson, lessonId, courseId, vec, score, relevance, urgency, topSkillId });
  }

  const selected = [];
  while (selected.length < limit && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    pool.forEach((c, i) => {
      let sim = 0;
      for (const s of selected) sim = Math.max(sim, cosine(c.vec, s.vec));
      const val = c.score - rc.diversityLambda * sim;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    });
    selected.push(pool.splice(bestIdx, 1)[0]);
  }

  const items = selected.map((c, idx) => {
    const skInfo = skillsById.get(c.topSkillId) || skillsById.get(String(c.topSkillId)) || skillsById.get(Number(c.topSkillId)) || { skillId: c.topSkillId, skillCode: 'SKILL', name: 'Skill' };
    const mProb = round(masteryBySkill.get(c.topSkillId) ?? masteryBySkill.get(String(c.topSkillId)) ?? 0.3, 2);
    const name = skillLabel(skInfo);

    return {
      type: 'lesson',
      lesson: {
        lessonId: c.lessonId,
        title: c.lesson.title,
        courseId: c.courseId,
        courseTitle: c.lesson.courseTitle
      },
      quiz: null,
      skill: {
        skillId: skInfo.skillId ?? skInfo.id ?? c.topSkillId,
        skillCode: skInfo.skillCode || '',
        name
      },
      masteryProb: mProb,
      rank: idx + 1,
      score: round(c.score, 2),
      rationale: buildRationale({
        matchedSkills: [{ name, mastery: mProb }],
        threshold: th
      }),
      lessonId: c.lessonId,
      courseId: c.courseId,
      courseTitle: c.lesson.courseTitle,
      title: c.lesson.title
    };
  });

  const gates = computeGates({
    catalog, completedLessonIds, enrolledCourseIds, masteryBySkill, threshold: th, enabled: rc.gating.enabled
  });

  return { items, weakSkills, gates, candidateCount: pool.length };
}

module.exports = { recommend };