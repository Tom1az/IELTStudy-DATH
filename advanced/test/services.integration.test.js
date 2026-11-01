'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryRepository } = require('../src/repositories/memoryRepository');
const { createServices } = require('../src/services');
const { skills, lesson } = require('./helpers');

const learner = { id: 'u1', role: 'learner' };

function setup() {
  const repo = new MemoryRepository({
    users: [{ id: 'u1', role: 'learner', targetBand: 6.5 }, { id: 'u2', role: 'learner', targetBand: 6 }],
    skills,
    catalog: [lesson('l1', 1, ['s3']), lesson('l2', 2, ['s1']), lesson('r1', 900, ['s1'], { isRemedial: true })],
    attempts: [
      { id: 'a1', userId: 'u1', completedAt: new Date() },  // placement
      { id: 'a2', userId: 'u1', completedAt: new Date() },  // quiz
      { id: 'a3', userId: 'u1', completedAt: null }
    ],
    responses: {
      // s1 sai 2 lần, s2 đúng 3 lần, s3 đúng 3 lần
      a1: [
        ...[1, 2].map((i) => ({ questionId: 'q1', isCorrect: false, attemptOrder: i })),
        ...[3, 4, 5].map((i) => ({ questionId: 'q2', isCorrect: true, attemptOrder: i })),
        ...[6, 7, 8].map((i) => ({ questionId: 'q3', isCorrect: true, attemptOrder: i }))
      ],
      a2: [1, 2, 3, 4].map((i) => ({ questionId: 'q1', isCorrect: true, attemptOrder: i })),
      a3: [{ questionId: 'q1', isCorrect: true, attemptOrder: 1 }]
    },
    questionSkills: {
      q1: [{ skillId: 's1', weight: 1 }], q2: [{ skillId: 's2', weight: 1 }], q3: [{ skillId: 's3', weight: 1 }]
    },
    enrollments: { u1: ['c1'] }
  });
  return { repo, services: createServices({ repository: repo, logger: { warn() {}, error() {} } }) };
}

test('cold-start: recommendations ask for the placement test first', async () => {
  const { services } = setup();
  const out = await services.recommendations.getRecommendations({ userId: 'u1', requester: learner });
  assert.equal(out.needsPlacement, true);
  assert.equal(out.items.length, 0);
});

test('placement initializes the full skill vector and can only run once', async () => {
  const { services } = setup();
  const res = await services.mastery.initPlacement({ attemptId: 'a1', requester: learner });
  assert.equal(res.updates.length, skills.length);
  const s1 = res.updates.find((u) => u.skillId === 's1');
  assert.equal(s1.belowThreshold, true);
  await assert.rejects(services.mastery.initPlacement({ attemptId: 'a1', requester: learner }), { code: 'CONFLICT' });
});

test('after placement: weak skill drives recommendations, latency is reported and within budget', async () => {
  const { services } = setup();
  await services.mastery.initPlacement({ attemptId: 'a1', requester: learner });
  const out = await services.recommendations.getRecommendations({ userId: 'u1', requester: learner });
  assert.equal(out.needsPlacement, false);
  assert.ok(out.weakSkills.some((w) => w.skillCode === 'GRAM_COND3'));
  assert.match(out.nextBestStep.rationale, /below 0.65/);
  assert.ok(out.meta.latencyMs < 300 && out.meta.withinBudget);
});

test('quiz processing updates mastery, is idempotent, and can unlock a weak skill', async () => {
  const { services } = setup();
  await services.mastery.initPlacement({ attemptId: 'a1', requester: learner });
  const first = await services.mastery.processAttempt({ attemptId: 'a2', requester: learner });
  const u = first.updates.find((x) => x.skillId === 's1');
  assert.ok(u.after > u.before);
  assert.equal(first.alreadyProcessed, false);

  const again = await services.mastery.processAttempt({ attemptId: 'a2', requester: learner });
  assert.equal(again.alreadyProcessed, true);
  const m = await services.mastery.getMastery('u1');
  assert.equal(m.find((x) => x.skillId === 's1').mastery, u.after); // không bị cộng 2 lần
});

test('authorization & validation errors', async () => {
  const { services } = setup();
  await assert.rejects(services.mastery.initPlacement({ attemptId: 'a1', requester: { id: 'u2', role: 'learner' } }), { code: 'FORBIDDEN' });
  await assert.rejects(services.mastery.initPlacement({ attemptId: 'nope', requester: learner }), { code: 'NOT_FOUND' });
  await assert.rejects(services.mastery.initPlacement({ attemptId: 'a3', requester: learner }), { code: 'BAD_REQUEST' });
  await assert.rejects(services.mastery.processAttempt({ attemptId: 'a2', requester: learner }), { code: 'BAD_REQUEST' }); // chưa placement
  await assert.rejects(services.recommendations.getRecommendations({ userId: 'u1', context: 'post_quiz', requester: learner }), { code: 'BAD_REQUEST' });
});

test('post_quiz context works and enforces attempt ownership', async () => {
  const { services } = setup();
  await services.mastery.initPlacement({ attemptId: 'a1', requester: learner });
  const out = await services.recommendations.getRecommendations({ userId: 'u1', context: 'post_quiz', attemptId: 'a2', requester: learner });
  assert.equal(out.context, 'post_quiz');
  await assert.rejects(
    services.recommendations.getRecommendations({ userId: 'u2', context: 'post_quiz', attemptId: 'a2', requester: { id: 'u2', role: 'learner' } }),
    { code: 'FORBIDDEN' }
  );
});

test('progress: radar, category averages, course completion and trend', async () => {
  const { services } = setup();
  await services.mastery.initPlacement({ attemptId: 'a1', requester: learner });
  await services.mastery.processAttempt({ attemptId: 'a2', requester: learner });
  await services.progress.completeLesson({ userId: 'u1', lessonId: 'l1' });

  const p = await services.progress.getProgress({ userId: 'u1' });
  assert.equal(p.radar.length, skills.length);
  assert.equal(p.categories.length, 4);
  assert.equal(p.courses[0].completedLessons, 1);
  assert.equal(p.courses[0].totalLessons, 2); // remedial không tính
  assert.equal(p.trend.length, 2);            // placement + 1 quiz
  await assert.rejects(services.progress.completeLesson({ userId: 'u1', lessonId: 'zzz' }), { code: 'NOT_FOUND' });
});
