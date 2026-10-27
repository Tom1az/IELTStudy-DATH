'use strict';

/**
 * Repository PostgreSQL (Supabase). Toàn bộ SQL của module nằm ở file này.
 * Tên bảng/cột bám theo Relational Data Model trong proposal (snake_case).
 * Bảng mới do module này thêm: xem sql/001_advanced_schema.sql.
 *
 * @param {import('pg').Pool} pool
 * @param {{publishedCourseStatus:string}} config
 */
function createPgRepository(pool, config) {
  const S = (v) => String(v);

  return {
    async getUserProfile(userId) {
      const { rows } = await pool.query('SELECT id, role, target_band FROM users WHERE id = $1', [userId]);
      if (!rows[0]) return null;
      return {
        id: S(rows[0].id),
        role: rows[0].role,
        targetBand: rows[0].target_band == null ? null : Number(rows[0].target_band)
      };
    },

    async getSkills() {
      const { rows } = await pool.query('SELECT id, skill_code, skill_category, description FROM skills ORDER BY id');
      return rows.map((r) => ({
        id: S(r.id), skillCode: r.skill_code, skillCategory: r.skill_category, description: r.description
      }));
    },

    /** Bài học (của khoá đã duyệt) kèm skill tag. */
    async getCatalog() {
      const { rows } = await pool.query(
        `SELECT l.id, l.course_id, l.title, l.order_index, l.is_remedial,
                c.title AS course_title, c.target_level,
                COALESCE(json_agg(json_build_object('skillId', ls.skill_id::text, 'weight', ls.weight))
                         FILTER (WHERE ls.skill_id IS NOT NULL), '[]') AS skills
           FROM lessons l
           JOIN courses c ON c.id = l.course_id
           LEFT JOIN lesson_skills ls ON ls.lesson_id = l.id
          WHERE c.status = $1
          GROUP BY l.id, c.id`,
        [config.publishedCourseStatus]
      );
      return rows.map((r) => ({
        id: S(r.id), courseId: S(r.course_id), courseTitle: r.course_title,
        targetLevel: r.target_level, title: r.title, orderIndex: r.order_index,
        isRemedial: !!r.is_remedial,
        skills: r.skills.map((s) => ({ skillId: S(s.skillId), weight: Number(s.weight) }))
      }));
    },

    async getMastery(userId) {
      const { rows } = await pool.query(
        'SELECT skill_id, mastery_prob FROM user_skill_mastery WHERE user_id = $1', [userId]
      );
      return new Map(rows.map((r) => [S(r.skill_id), Number(r.mastery_prob)]));
    },

    async getAttempt(attemptId) {
      const { rows } = await pool.query(
        'SELECT id, user_id, completed_at FROM quiz_attempts WHERE id = $1', [attemptId]
      );
      if (!rows[0]) return null;
      return { id: S(rows[0].id), userId: S(rows[0].user_id), completedAt: rows[0].completed_at };
    },

    async getAttemptResponses(attemptId) {
      const { rows } = await pool.query(
        `SELECT question_id, is_correct, attempt_order
           FROM question_responses WHERE attempt_id = $1 ORDER BY attempt_order`, [attemptId]
      );
      return rows.map((r) => ({
        questionId: S(r.question_id), isCorrect: !!r.is_correct, attemptOrder: r.attempt_order
      }));
    },

    /** Q-matrix cho một tập câu hỏi -> Map<questionId, [{skillId, weight}]> */
    async getQuestionSkills(questionIds) {
      const out = new Map(questionIds.map((q) => [q, []]));
      if (!questionIds.length) return out;
      // Ép về text để chạy được với cả id kiểu uuid lẫn bigint
      const { rows } = await pool.query(
        'SELECT question_id, skill_id, weight FROM question_skills WHERE question_id::text = ANY($1::text[])',
        [questionIds]
      );
      for (const r of rows) out.get(S(r.question_id)).push({ skillId: S(r.skill_id), weight: Number(r.weight) });
      return out;
    },

    async hasProcessedAttempt(attemptId) {
      const { rowCount } = await pool.query('SELECT 1 FROM mastery_history WHERE attempt_id = $1 LIMIT 1', [attemptId]);
      return rowCount > 0;
    },

    /** Ghi mastery + history trong 1 transaction (idempotent theo attempt_id+skill_id). */
    async saveMasteryUpdate({ userId, attemptId, source, entries }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const e of entries) {
          await client.query(
            `INSERT INTO user_skill_mastery (user_id, skill_id, mastery_prob, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, skill_id)
             DO UPDATE SET mastery_prob = EXCLUDED.mastery_prob, updated_at = now()`,
            [userId, e.skillId, e.after]
          );
          await client.query(
            `INSERT INTO mastery_history (user_id, skill_id, attempt_id, source, mastery_before, mastery_after)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (attempt_id, skill_id) DO NOTHING`,
            [userId, e.skillId, attemptId, source, e.before, e.after]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async getMasteryHistory(userId, limit) {
      const { rows } = await pool.query(
        `SELECT skill_id, attempt_id, mastery_after, created_at
           FROM (SELECT * FROM mastery_history WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) t
          ORDER BY created_at ASC, id ASC`,
        [userId, limit]
      );
      return rows.map((r) => ({
        skillId: S(r.skill_id), attemptId: S(r.attempt_id),
        masteryAfter: Number(r.mastery_after), createdAt: r.created_at
      }));
    },

    async getCompletedLessonIds(userId) {
      const { rows } = await pool.query(
        `SELECT lesson_id FROM lesson_progress WHERE user_id = $1 AND status = 'completed'`, [userId]
      );
      return new Set(rows.map((r) => S(r.lesson_id)));
    },

    async getEnrolledCourseIds(userId) {
      const { rows } = await pool.query('SELECT course_id FROM enrollments WHERE user_id = $1', [userId]);
      return new Set(rows.map((r) => S(r.course_id)));
    },

    async markLessonCompleted(userId, lessonId) {
      await pool.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, status, completed_at)
         VALUES ($1, $2, 'completed', now())
         ON CONFLICT (user_id, lesson_id)
         DO UPDATE SET status = 'completed', completed_at = COALESCE(lesson_progress.completed_at, now())`,
        [userId, lessonId]
      );
    }
  };
}

module.exports = { createPgRepository };
