'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { updateSkillMastery, applyResponses, normalizeLinks } = require('../src/bkt/bktModel');
const { ParamStore } = require('../src/bkt/paramStore');
const { buildBaseline } = require('../src/bkt/placement');
const { config, paramStore, skills, skillsById } = require('./helpers');

const P = { pInit: 0.3, pLearn: 0.15, pSlip: 0.1, pGuess: 0.25, pForget: 0 };

test('correct answer raises mastery, wrong answer lowers it', () => {
  assert.ok(updateSkillMastery(0.4, true, P) > 0.4);
  assert.ok(updateSkillMastery(0.4, false, { ...P, pLearn: 0 }) < 0.4);
});

test('weight 0 leaves mastery unchanged; lower weight => smaller change', () => {
  assert.equal(updateSkillMastery(0.4, true, P, 0), 0.4);
  const full = updateSkillMastery(0.4, true, P, 1) - 0.4;
  const half = updateSkillMastery(0.4, true, P, 0.5) - 0.4;
  assert.ok(half > 0 && half < full);
});

test('multi-skill weights are normalized when sum > 1', () => {
  const out = normalizeLinks([{ skillId: 'a', weight: 1 }, { skillId: 'b', weight: 1 }], true);
  assert.deepEqual(out.map((l) => l.weight), [0.5, 0.5]);
  const keep = normalizeLinks([{ skillId: 'a', weight: 0.6 }, { skillId: 'b', weight: 0.4 }], true);
  assert.deepEqual(keep.map((l) => l.weight), [0.6, 0.4]);
});

test('applyResponses updates every skill linked to a question, in attemptOrder', () => {
  const questionSkills = new Map([['q1', [{ skillId: 's1', weight: 0.6 }, { skillId: 's2', weight: 0.4 }]]]);
  const { state, evidence } = applyResponses({
    prior: new Map([['s1', 0.3], ['s2', 0.3]]),
    responses: [{ questionId: 'q1', isCorrect: true, attemptOrder: 1 }],
    questionSkills, skillsById, paramStore, bktConfig: config.bkt
  });
  assert.ok(state.get('s1') > state.get('s2'), 'bigger weight => bigger update');
  assert.equal(evidence.get('s3'), undefined);
});

test('placement: one lucky correct answer does NOT push a skill above 0.65 (no learning during diagnostic)', () => {
  const { state } = buildBaseline({
    skills,
    responses: [{ questionId: 'q1', isCorrect: true, attemptOrder: 1 }],
    questionSkills: new Map([['q1', [{ skillId: 's1', weight: 1 }]]]),
    paramStore, bktConfig: config.bkt
  });
  assert.ok(state.get('s1') < config.masteryThreshold);
});

test('placement: skills without evidence inherit their category average', () => {
  const { state } = buildBaseline({
    skills,
    responses: [1, 2, 3].map((i) => ({ questionId: 'q1', isCorrect: true, attemptOrder: i })),
    questionSkills: new Map([['q1', [{ skillId: 's1', weight: 1 }]]]),
    paramStore, bktConfig: config.bkt
  });
  assert.equal(state.get('s2'), state.get('s1')); // cùng category Writing
  assert.equal(state.get('s3'), paramStore.getParams('LIS_MAIN').pInit); // category khác, không evidence
});

test('ParamStore rejects invalid parameters (slip + guess >= 1)', () => {
  assert.throws(() => new ParamStore({ defaults: { ...P, pSlip: 0.6, pGuess: 0.5 } }), /pSlip \+ pGuess/);
  assert.throws(() => new ParamStore({ defaults: { ...P, pInit: 1.5 } }), /pInit/);
});

test('ParamStore: per-skill override falls back to default', () => {
  const ps = new ParamStore({ defaults: P, skills: { X: { pLearn: 0.4 } } });
  assert.equal(ps.getParams('X').pLearn, 0.4);
  assert.equal(ps.getParams('X').pSlip, P.pSlip);
  assert.equal(ps.getParams('UNKNOWN').pLearn, P.pLearn);
});
