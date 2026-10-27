'use strict';

/**
 * Repository in-memory: dùng cho unit test, demo server và mô phỏng.
 * Cùng interface với pgRepository -> đổi qua lại không cần sửa service.
 *
 * Mọi id được xử lý như string.
 */
class MemoryRepository {
  constructor(seed = {}) {
    this.users = new Map((seed.users || []).map((u) => [String(u.id), u]));
    this.skills = seed.skills || [];
    this.catalog = seed.catalog || [];
    this.enrollments = new Map(); // userId -> Set(courseId)
    this.completed = new Map();   // userId -> Set(lessonId)
    this.mastery = new Map();     // userId -> Map(skillId -> {masteryProb, updatedAt})
    this.history = [];            // {userId, skillId, attemptId, source, before, after, createdAt}
    this.attempts = new Map(seed.attempts ? seed.attempts.map((a) => [String(a.id), a]) : []);
    this.responses = new Map(Object.entries(seed.responses || {}));
    this.questionSkills = new Map(Object.entries(seed.questionSkills || {}));
    for (const [u, courses] of Object.entries(seed.enrollments || {})) {
      this.enrollments.set(u, new Set(courses));
    }
  }

  async getUserProfile(userId) {
    const u = this.users.get(String(userId));
    return u ? { id: String(u.id), targetBand: u.targetBand ?? null, role: u.role } : null;
  }
  async getSkills() { return this.skills; }
  async getCatalog() { return this.catalog; }

  async getMastery(userId) {
    const m = this.mastery.get(String(userId)) || new Map();
    return new Map([...m].map(([k, v]) => [k, v.masteryProb]));
  }

  async getAttempt(attemptId) {
    return this.attempts.get(String(attemptId)) || null;
  }
  async getAttemptResponses(attemptId) {
    return this.responses.get(String(attemptId)) || [];
  }
  async getQuestionSkills(questionIds) {
    const out = new Map();
    for (const q of questionIds) out.set(q, this.questionSkills.get(String(q)) || []);
    return out;
  }
  async hasProcessedAttempt(attemptId) {
    return this.history.some((h) => h.attemptId === String(attemptId));
  }

  /** entries: [{skillId, before, after}] */
  async saveMasteryUpdate({ userId, attemptId, source, entries }) {
    const uid = String(userId);
    if (!this.mastery.has(uid)) this.mastery.set(uid, new Map());
    const now = new Date();
    for (const e of entries) {
      this.mastery.get(uid).set(e.skillId, { masteryProb: e.after, updatedAt: now });
      this.history.push({
        userId: uid, skillId: e.skillId, attemptId: String(attemptId),
        source, before: e.before, after: e.after, createdAt: now
      });
    }
  }

  async getMasteryHistory(userId, limit) {
    return this.history
      .filter((h) => h.userId === String(userId))
      .slice(-limit)
      .map((h) => ({ skillId: h.skillId, attemptId: h.attemptId, masteryAfter: h.after, createdAt: h.createdAt }));
  }

  async getCompletedLessonIds(userId) { return new Set(this.completed.get(String(userId)) || []); }
  async getEnrolledCourseIds(userId) { return new Set(this.enrollments.get(String(userId)) || []); }
  async markLessonCompleted(userId, lessonId) {
    const uid = String(userId);
    if (!this.completed.has(uid)) this.completed.set(uid, new Set());
    this.completed.get(uid).add(String(lessonId));
  }
}

module.exports = { MemoryRepository };
