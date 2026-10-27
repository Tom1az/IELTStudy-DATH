'use strict';
const { MemoryRepository } = require('../repositories/memoryRepository');
const { makeRng, generateSkills, generateCatalog, generateLearners } = require('../evaluation/syntheticData');

/**
 * Dữ liệu demo (in-memory) cho `npm run dev`:
 *  - user "u1" (learner) đã đăng ký khoá c2, đã có placement attempt "a1" (30 câu) nhưng CHƯA init mastery.
 *  Gọi: POST /api/v1/mastery/placement {"attemptId":"a1"} rồi GET /api/v1/recommendations
 */
function buildDemoRepository() {
  const rng = makeRng(2026);
  const skills = generateSkills();
  const catalog = generateCatalog(skills, rng);
  const [learner] = generateLearners(skills, rng, 1);

  const responses = [];
  const questionSkills = {};
  for (let i = 0; i < 30; i++) {
    const s = skills[i % skills.length];
    const m = learner.trueMastery.get(s.id);
    questionSkills[`q${i + 1}`] = [{ skillId: s.id, weight: 1 }];
    responses.push({ questionId: `q${i + 1}`, isCorrect: rng() < m * 0.9 + (1 - m) * 0.25, attemptOrder: i + 1 });
  }

  return new MemoryRepository({
    users: [{ id: 'u1', role: 'learner', targetBand: 6.5 }],
    skills, catalog,
    attempts: [{ id: 'a1', userId: 'u1', completedAt: new Date() }],
    responses: { a1: responses },
    questionSkills,
    enrollments: { u1: ['c2'] }
  });
}

module.exports = { buildDemoRepository };
