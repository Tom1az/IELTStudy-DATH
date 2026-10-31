'use strict';
const { MemoryRepository } = require('../repositories/memoryRepository');
const { makeRng, generateSkills, generateCatalog, generateLearners } = require('../evaluation/syntheticData');

/**
 * In-memory demo data using integer IDs matching schema.prisma:
 * - user 1 (learner) enrolled in course 2, with completed diagnostic attempt 1 (30 questions).
 */
function buildDemoRepository() {
  const rng = makeRng(2026);
  const rawSkills = generateSkills();
  const skills = rawSkills.map((s, idx) => ({
    ...s,
    skillId: idx + 1,
    id: idx + 1,
    name: s.name || s.description || s.skillCode,
    category: (s.category || s.skillCategory || 'reading').toLowerCase()
  }));

  const rawCatalog = generateCatalog(skills, rng);
  const catalog = rawCatalog.map((l, idx) => ({
    ...l,
    lessonId: idx + 1,
    id: idx + 1,
    courseId: Number(String(l.courseId).replace(/\D/g, '')) || 1,
    kind: l.isRemedial ? 'remedial' : 'core'
  }));

  const [learner] = generateLearners(skills, rng, 1);

  const responses = [];
  const questionSkills = {};
  for (let i = 0; i < 30; i++) {
    const qId = i + 1;
    const s = skills[i % skills.length];
    const m = learner.trueMastery.get(s.id) ?? 0.4;
    questionSkills[qId] = [{ skillId: s.skillId, weight: 1 }];
    responses.push({
      questionId: qId,
      isCorrect: rng() < m * 0.9 + (1 - m) * 0.25,
      attemptOrder: i + 1
    });
  }

  return new MemoryRepository({
    users: [{ userId: 1, id: 1, role: 'learner', targetBand: 6.5 }],
    skills,
    catalog,
    attempts: [{ attemptId: 1, id: 1, userId: 1, quizId: 1, quizKind: 'diagnostic', completedAt: new Date() }],
    responses: { 1: responses },
    questionSkills,
    enrollments: { 1: [2] }
  });
}

module.exports = { buildDemoRepository };