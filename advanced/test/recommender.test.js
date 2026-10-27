'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { recommend } = require('../src/recommender/recommend');
const { config, skillsById, lesson } = require('./helpers');

const base = () => ({
  skillsById, config,
  enrolledCourseIds: new Set(['c1']),
  profile: { targetBand: 6.5 },
  catalog: [
    lesson('l1', 1, ['s3']),
    lesson('l2', 2, ['s1']),
    lesson('r1', 900, ['s1'], { isRemedial: true }),
    lesson('r2', 901, ['s2'], { isRemedial: true })
  ]
});

test('weak skill => lessons targeting it come first, with human-readable rationale', () => {
  const out = recommend({
    ...base(), masteryBySkill: new Map([['s1', 0.3], ['s2', 0.9], ['s3', 0.9]]), completedLessonIds: new Set()
  });
  const top = out.items[0];
  assert.ok(['r1', 'l2'].includes(top.lessonId));
  assert.equal(top.kind, 'remedial');
  assert.match(top.rationale, /Recommended because latent mastery on 'Conditionals Type 3' is below 0.65/);
  assert.ok(out.weakSkills.some((w) => w.skillId === 's1'));
});

test('remedial lesson for a non-weak skill is never recommended', () => {
  const out = recommend({
    ...base(), masteryBySkill: new Map([['s1', 0.3], ['s2', 0.9], ['s3', 0.9]]), completedLessonIds: new Set(), limit: 10
  });
  assert.ok(!out.items.some((i) => i.lessonId === 'r2'));
});

test('no weak skills => next lesson in the enrolled course', () => {
  const out = recommend({
    ...base(), masteryBySkill: new Map([['s1', 0.9], ['s2', 0.9], ['s3', 0.9]]), completedLessonIds: new Set(['l1'])
  });
  assert.equal(out.items[0].lessonId, 'l2');
  assert.equal(out.items[0].kind, 'next_step');
  assert.match(out.items[0].rationale, /Next step in your course/);
});

test('completed regular lessons are never recommended again', () => {
  const out = recommend({
    ...base(), masteryBySkill: new Map([['s1', 0.3], ['s2', 0.9], ['s3', 0.9]]),
    completedLessonIds: new Set(['l1', 'l2']), limit: 10
  });
  assert.ok(!out.items.some((i) => ['l1', 'l2'].includes(i.lessonId)));
});

test('gating: studied-but-weak skill locks the next module until mastery >= threshold', () => {
  const input = { ...base(), completedLessonIds: new Set(['l1']) };
  const locked = recommend({ ...input, masteryBySkill: new Map([['s1', 0.5], ['s2', 0.9], ['s3', 0.4]]) });
  assert.equal(locked.gates[0].locked, true);
  assert.deepEqual(locked.gates[0].blockingSkills.map((b) => b.skillId), ['s3']);
  assert.ok(!locked.items.some((i) => i.lessonId === 'l2' && i.kind === 'next_step'));

  const open = recommend({ ...input, masteryBySkill: new Map([['s1', 0.9], ['s2', 0.9], ['s3', 0.7]]) });
  assert.equal(open.gates[0].locked, false);
});

test('post-quiz focus: skills outside the quiz are down-weighted', () => {
  const m = new Map([['s1', 0.3], ['s3', 0.3], ['s2', 0.9]]);
  const out = recommend({
    ...base(), masteryBySkill: m, completedLessonIds: new Set(), focusSkillIds: new Set(['s3']), limit: 1
  });
  assert.equal(out.items[0].lessonId, 'l1'); // lesson cho s3 (skill của quiz vừa làm)
});

test('limit is capped by config.recommender.maxLimit', () => {
  const out = recommend({
    ...base(), masteryBySkill: new Map([['s1', 0.3]]), completedLessonIds: new Set(), limit: 999
  });
  assert.ok(out.items.length <= config.recommender.maxLimit);
});
