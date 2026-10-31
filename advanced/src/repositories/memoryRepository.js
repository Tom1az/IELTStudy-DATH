'use strict';

/**
 * In-memory repository for unit tests and simulations.
 * Matches the interface and integer ID conventions of createPgRepository.
 */
class MemoryRepository {
  constructor(seed = {}) {
    const N = (v) => (typeof v === 'number' ? v : Number.isNaN(Number(v)) ? v : Number(v));
    this.N = N;

    this.users = new Map(
      (seed.users || []).map((u) => {
        const userId = N(u.userId ?? u.id);
        return [userId, { ...u, userId, id: userId }];
      })
    );

    this.skills = (seed.skills || []).map((s, idx) => {
      const skillId = N(s.skillId ?? s.id ?? idx + 1);
      const category = (s.category ?? s.skillCategory ?? 'reading').toLowerCase();
      return {
        ...s,
        skillId,
        id: skillId,
        name: s.name || s.description || s.skillCode,
        category,
        skillCategory: category
      };
    });

    this.catalog = (seed.catalog || []).map((l, idx) => {
      const lessonId = N(l.lessonId ?? l.id ?? idx + 1);
      const courseId = N(l.courseId);
      const kind = l.kind ?? (l.isRemedial ? 'remedial' : 'core');
      return {
        ...l,
        lessonId,
        id: lessonId,
        courseId,
        kind,
        isRemedial: kind === 'remedial',
        skills: (l.skills || []).map((sk) => ({
          skillId: N(sk.skillId),
          weight: Number(sk.weight)
        }))
      };
    });

    this.enrollments = new Map();
    for (const [u, courses] of Object.entries(seed.enrollments || {})) {
      this.enrollments.set(N(u), new Set(courses.map(N)));
    }

    this.completed = new Map();
    for (const [u, lessons] of Object.entries(seed.completed || {})) {
      this.completed.set(N(u), new Set(lessons.map(N)));
    }

    // userId -> Map(skillId -> { masteryProb, observations, updatedAt })
    this.mastery = new Map();

    this.attempts = new Map(
      (seed.attempts || []).map((a) => {
        const attemptId = N(a.attemptId ?? a.id);
        return [
          attemptId,
          {
            ...a,
            attemptId,
            id: attemptId,
            userId: N(a.userId),
            quizId: N(a.quizId ?? 1),
            quizKind: a.quizKind ?? 'diagnostic',
            masteryChanges: a.masteryChanges ?? null
          }
        ];
      })
    );

    this.responses = new Map();
    for (const [aId, list] of Object.entries(seed.responses || {})) {
      this.responses.set(
        N(aId),
        list.map((r) => ({
          questionId: N(r.questionId),
          isCorrect: !!r.isCorrect,
          attemptOrder: Number(r.attemptOrder)
        }))
      );
    }

    this.questionSkills = new Map();
    for (const [qId, links] of Object.entries(seed.questionSkills || {})) {
      this.questionSkills.set(
        N(qId),
        links.map((l) => ({ skillId: N(l.skillId), weight: Number(l.weight) }))
      );
    }

    this.recommendations = new Map();
    this.nextRecommendationId = 1;
  }

  async getUserProfile(userId) {
    const u = this.users.get(this.N(userId));
    return u ? { userId: u.userId, id: u.userId, targetBand: u.targetBand ?? null, role: u.role } : null;
  }

  async getSkills() {
    return this.skills;
  }

  async getCatalog() {
    return this.catalog;
  }

  async getMastery(userId) {
    const m = this.mastery.get(this.N(userId)) || new Map();
    return new Map([...m].map(([k, v]) => [k, v.masteryProb]));
  }

  async getMasteryRows(userId) {
    const m = this.mastery.get(this.N(userId)) || new Map();
    const skillsById = new Map(this.skills.map((s) => [s.skillId, s]));
    const rows = [];
    for (const [skillId, entry] of m.entries()) {
      const s = skillsById.get(skillId);
      if (!s) continue;
      rows.push({
        skillId,
        skillCode: s.skillCode,
        name: s.name,
        category: s.category,
        masteryProb: entry.masteryProb,
        observations: entry.observations,
        updatedAt: entry.updatedAt
      });
    }
    return rows.sort((a, b) => a.skillId - b.skillId);
  }

  async getAttempt(attemptId) {
    return this.attempts.get(this.N(attemptId)) || null;
  }

  async getQuizQuestionIds(quizId) {
    return [];
  }

  async getAttemptResponses(attemptId) {
    return this.responses.get(this.N(attemptId)) || [];
  }

  async getQuestionSkills(questionIds) {
    const out = new Map();
    for (const q of questionIds) {
      const key = this.N(q);
      out.set(key, this.questionSkills.get(key) || []);
    }
    return out;
  }

  async hasProcessedAttempt(attemptId) {
    const att = this.attempts.get(this.N(attemptId));
    return Boolean(att && att.masteryChanges !== null);
  }

  async saveMasteryUpdate({ userId, attemptId, entries }) {
    const uid = this.N(userId);
    const aid = this.N(attemptId);
    if (!this.mastery.has(uid)) this.mastery.set(uid, new Map());
    const userMap = this.mastery.get(uid);
    const now = new Date().toISOString();

    for (const e of entries) {
      const sid = this.N(e.skillId);
      const prev = userMap.get(sid);
      const obs = (prev ? prev.observations : 0) + Number(e.observations ?? 0);
      userMap.set(sid, { masteryProb: Number(e.after), observations: obs, updatedAt: now });
    }

    const att = this.attempts.get(aid);
    if (att) {
      att.masteryChanges = entries.map((e) => ({
        skillId: this.N(e.skillId),
        skillCode: e.skillCode,
        name: e.name,
        before: e.before,
        after: Number(e.after)
      }));
    }
  }

  async saveRecommendations({ userId, sourceAttemptId = null, items }) {
    const uid = this.N(userId);
    const now = new Date().toISOString();
    return items.map((item) => {
      const recommendationId = this.nextRecommendationId++;
      const row = {
        recommendationId,
        userId: uid,
        sourceAttemptId: sourceAttemptId != null ? this.N(sourceAttemptId) : null,
        type: item.type,
        lesson: item.lesson,
        quiz: item.quiz,
        skill: item.skill,
        masteryProb: item.masteryProb,
        rank: item.rank,
        score: item.score,
        rationale: item.rationale,
        createdAt: now,
        clickedAt: null
      };
      this.recommendations.set(recommendationId, row);
      const { userId: _u, sourceAttemptId: _s, ...publicRow } = row;
      return publicRow;
    });
  }

  async getRecommendationById(recommendationId) {
    return this.recommendations.get(this.N(recommendationId)) || null;
  }

  async clickRecommendation(recommendationId) {
    const row = this.recommendations.get(this.N(recommendationId));
    if (row && !row.clickedAt) {
      row.clickedAt = new Date().toISOString();
    }
  }

  async getCompletedLessonIds(userId) {
    return new Set(this.completed.get(this.N(userId)) || []);
  }

  async getEnrolledCourseIds(userId) {
    return new Set(this.enrollments.get(this.N(userId)) || []);
  }
}

module.exports = { MemoryRepository };