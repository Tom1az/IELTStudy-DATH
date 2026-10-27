'use strict';
const { applyResponses } = require('../bkt/bktModel');
const { buildBaseline } = require('../bkt/placement');
const { notFound, forbidden, badRequest, conflict } = require('../utils/errors');
const { round } = require('../utils/math');

/**
 * Cập nhật latent mastery sau placement test / quiz.
 * Người gọi: route POST /mastery/... HOẶC trực tiếp từ handler nộp quiz của backend
 * (gọi masteryService.processAttempt(...) ngay sau khi chấm điểm).
 */
function createMasteryService({ repository, paramStore, config }) {
  const th = config.masteryThreshold;

  async function loadAttempt({ attemptId, requester }) {
    const attempt = await repository.getAttempt(attemptId);
    if (!attempt) throw notFound('Attempt not found');
    if (attempt.userId !== String(requester.id) && requester.role !== 'admin') {
      throw forbidden('Attempt does not belong to you');
    }
    if (!attempt.completedAt) throw badRequest('Attempt is not completed yet');
    const responses = await repository.getAttemptResponses(attemptId);
    if (!responses.length) throw badRequest('Attempt has no responses');
    const questionSkills = await repository.getQuestionSkills([...new Set(responses.map((r) => r.questionId))]);
    return { attempt, responses, questionSkills };
  }

  function summarize(entries, skillsById) {
    return entries.map((e) => ({
      skillId: e.skillId,
      skillCode: skillsById.get(e.skillId)?.skillCode,
      before: e.before == null ? null : round(e.before),
      after: round(e.after),
      belowThreshold: e.after < th,
      crossedBelowThreshold: e.before != null && e.before >= th && e.after < th,
      crossedAboveThreshold: e.before != null && e.before < th && e.after >= th
    }));
  }

  /** Placement 30 câu: khởi tạo toàn bộ skill vector (chỉ chạy 1 lần / người học). */
  async function initPlacement({ attemptId, requester }) {
    const existing = await repository.getMastery(requester.id);
    if (existing.size) throw conflict('Skill profile already initialized');

    const { attempt, responses, questionSkills } = await loadAttempt({ attemptId, requester });
    const skills = await repository.getSkills();
    const skillsById = new Map(skills.map((s) => [s.id, s]));

    const { state } = buildBaseline({ skills, responses, questionSkills, paramStore, bktConfig: config.bkt });
    const entries = [...state].map(([skillId, after]) => ({ skillId, before: null, after }));
    await repository.saveMasteryUpdate({ userId: attempt.userId, attemptId, source: 'placement', entries });
    return { source: 'placement', updates: summarize(entries, skillsById) };
  }

  /** Quiz thường: cập nhật mastery từ giá trị hiện tại. Idempotent theo attemptId. */
  async function processAttempt({ attemptId, requester }) {
    const { attempt, responses, questionSkills } = await loadAttempt({ attemptId, requester });
    const prior = await repository.getMastery(attempt.userId);
    if (!prior.size) throw badRequest('Complete the placement test first');

    if (await repository.hasProcessedAttempt(attemptId)) {
      return { source: 'quiz', alreadyProcessed: true, updates: [] };
    }

    const skills = await repository.getSkills();
    const skillsById = new Map(skills.map((s) => [s.id, s]));
    const { state, evidence } = applyResponses({
      prior, responses, questionSkills, skillsById, paramStore, bktConfig: config.bkt
    });

    const entries = [...evidence.keys()].map((skillId) => ({
      skillId, before: prior.get(skillId) ?? null, after: state.get(skillId)
    }));
    await repository.saveMasteryUpdate({ userId: attempt.userId, attemptId, source: 'quiz', entries });
    return { source: 'quiz', alreadyProcessed: false, updates: summarize(entries, skillsById) };
  }

  async function getMastery(userId) {
    const [mastery, skills] = await Promise.all([repository.getMastery(userId), repository.getSkills()]);
    return skills
      .filter((s) => mastery.has(s.id))
      .map((s) => ({
        skillId: s.id, skillCode: s.skillCode, category: s.skillCategory,
        label: s.description || s.skillCode,
        mastery: round(mastery.get(s.id)), belowThreshold: mastery.get(s.id) < th
      }));
  }

  return { initPlacement, processAttempt, getMastery };
}

module.exports = { createMasteryService };
