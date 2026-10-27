'use strict';
const { cosine, round } = require('../utils/math');
const { levelFromBand, levelFit } = require('./level');
const { computeGates } = require('./gating');
const { skillLabel, buildRationale } = require('./rationale');

/**
 * Hybrid recommender: BKT (mastery) + Content-Based Filtering.
 * HÀM THUẦN (không đụng DB) -> dễ test, dùng lại được cho mô phỏng A/B.
 *
 * Pipeline:
 *  1. need vector   : n_s = (θ − mastery_s)/θ với skill yếu (mastery < θ)
 *  2. candidates    : bài chưa học (remedial đã học vẫn được xét, bị phạt)
 *  3. scoring       : cosine(need, lessonVec) + urgency + level + remedial + sequence...
 *  4. re-rank (MMR) : chọn top-k, giảm trùng lặp skill
 *  5. rationale     : giải thích dạng human-readable
 *
 * @param {object} input
 * @param {Map<string,number>} input.masteryBySkill
 * @param {Map<string,object>} input.skillsById
 * @param {Array} input.catalog   [{id,courseId,courseTitle,targetLevel,title,orderIndex,isRemedial,skills:[{skillId,weight}]}]
 * @param {Set<string>} [input.completedLessonIds]
 * @param {Set<string>} [input.enrolledCourseIds]
 * @param {{targetBand?:number}} [input.profile]
 * @param {Set<string>|null} [input.focusSkillIds]  skill của quiz vừa làm (post-quiz)
 * @param {number} [input.limit]
 * @param {object} input.config
 */
function recommend(input) {
  const {
    masteryBySkill, skillsById, catalog, config,
    completedLessonIds = new Set(),
    enrolledCourseIds = new Set(),
    profile = {},
    focusSkillIds = null
  } = input;
  const rc = config.recommender;
  const th = config.masteryThreshold;
  const limit = Math.min(input.limit || rc.defaultLimit, rc.maxLimit);
  const W = rc.weights;

  // 1. need vector
  const need = new Map();
  const weakSkills = [];
  for (const [skillId, m] of masteryBySkill) {
    if (m >= th) continue;
    let n = (th - m) / th;
    if (focusSkillIds && !focusSkillIds.has(skillId)) n *= rc.nonFocusFactor;
    need.set(skillId, n);
    weakSkills.push({ skillId, mastery: round(m) });
  }
  weakSkills.sort((a, b) => a.mastery - b.mastery);

  // Gating + bài kế tiếp theo thứ tự khoá
  const gates = computeGates({
    catalog, completedLessonIds, enrolledCourseIds, masteryBySkill,
    threshold: th, enabled: rc.gating.enabled
  });
  const nextLessonIds = new Set(gates.filter((g) => !g.locked).map((g) => g.nextLessonId));
  const userLevel = levelFromBand(profile.targetBand, config.levels);

  // 2 + 3. candidates & scoring
  const scored = [];
  for (const lesson of catalog) {
    const completed = completedLessonIds.has(lesson.id);
    if (completed && !lesson.isRemedial) continue;

    const vec = new Map(lesson.skills.map((s) => [s.skillId, s.weight]));
    const relevance = cosine(need, vec);
    let urgency = 0;
    for (const s of lesson.skills) urgency = Math.max(urgency, need.get(s.skillId) || 0);

    const isNext = nextLessonIds.has(lesson.id);
    const score =
      W.relevance * relevance +
      W.urgency * urgency +
      W.level * levelFit(lesson.targetLevel, userLevel) +
      (urgency > 0 && lesson.isRemedial ? W.remedial : 0) +
      (isNext ? W.sequence : 0) +
      (enrolledCourseIds.has(lesson.courseId) ? W.enrolled : 0) -
      (completed ? W.repeatPenalty : 0);

    scored.push({ lesson, vec, score, relevance, urgency });
  }

  // Bỏ bài remedial không liên quan gì tới skill yếu khi người học đang có skill yếu
  const pool = scored.filter((c) => c.lesson.isRemedial ? c.urgency > 0 : true);

  // 4. MMR re-rank
  const selected = [];
  while (selected.length < limit && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    pool.forEach((c, i) => {
      let sim = 0;
      for (const s of selected) sim = Math.max(sim, cosine(c.vec, s.vec));
      const val = c.score - rc.diversityLambda * sim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    });
    selected.push(pool.splice(bestIdx, 1)[0]);
  }

  // 5. build output
  const items = selected.map((c) => {
    const matchedSkills = c.lesson.skills
      .filter((s) => need.has(s.skillId))
      .sort((a, b) => need.get(b.skillId) * b.weight - need.get(a.skillId) * a.weight)
      .map((s) => ({
        skillId: s.skillId,
        skillCode: skillsById.get(s.skillId)?.skillCode,
        label: skillLabel(skillsById.get(s.skillId) || { id: s.skillId }),
        mastery: round(masteryBySkill.get(s.skillId))
      }));
    const kind = c.urgency > 0 ? 'remedial' : 'next_step';
    return {
      lessonId: c.lesson.id,
      courseId: c.lesson.courseId,
      courseTitle: c.lesson.courseTitle,
      title: c.lesson.title,
      kind,
      isRemedialLesson: c.lesson.isRemedial,
      score: round(c.score),
      matchedSkills,
      rationale: buildRationale({ kind, matchedSkills, threshold: th, lesson: c.lesson })
    };
  });

  return { items, weakSkills, gates, candidateCount: scored.length };
}

module.exports = { recommend };
