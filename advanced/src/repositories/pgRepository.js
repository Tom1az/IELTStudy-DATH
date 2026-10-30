'use strict';

/**
 * PostgreSQL Repository matching backend/src/prisma/schema.prisma.
 * All IDs are integers; timestamps are explicitly provided on INSERT/UPDATE.
 */
function createPgRepository(pool, config) {
  const N = (v) => Number(v);

  return {
    async getUserProfile(userId, client = pool) {
      const { rows } = await client.query(
        'SELECT user_id, role, target_band FROM users WHERE user_id = $1',
        [N(userId)]
      );
      if (!rows[0]) return null;
      return {
        userId: N(rows[0].user_id),
        role: rows[0].role,
        targetBand: rows[0].target_band == null ? null : Number(rows[0].target_band)
      };
    },

    async getSkills(client = pool) {
      const { rows } = await client.query(
        'SELECT skill_id, skill_code, name, category, description FROM skills ORDER BY skill_id'
      );
      return rows.map((r) => ({
        skillId: N(r.skill_id),
        id: N(r.skill_id),
        skillCode: r.skill_code,
        name: r.name,
        category: r.category,
        skillCategory: r.category,
        description: r.description
      }));
    },

    async getCatalog(client = pool) {
      const { rows } = await client.query(
        `SELECT l.lesson_id, l.course_id, l.title, l.order_index, l.kind,
                c.title AS course_title, c.target_level,
                COALESCE(json_agg(json_build_object('skillId', ls.skill_id, 'weight', ls.weight))
                         FILTER (WHERE ls.skill_id IS NOT NULL), '[]') AS skills
           FROM lessons l
           JOIN courses c ON c.course_id = l.course_id
           LEFT JOIN lesson_skills ls ON ls.lesson_id = l.lesson_id
          WHERE c.status = $1
          GROUP BY l.lesson_id, c.course_id`,
        [config.publishedCourseStatus]
      );
      return rows.map((r) => ({
        lessonId: N(r.lesson_id),
        id: N(r.lesson_id),
        courseId: N(r.course_id),
        courseTitle: r.course_title,
        targetLevel: r.target_level,
        title: r.title,
        orderIndex: N(r.order_index),
        kind: r.kind,
        isRemedial: r.kind === 'remedial',
        skills: r.skills.map((s) => ({ skillId: N(s.skillId), weight: Number(s.weight) }))
      }));
    },

    async getMastery(userId, client = pool) {
      const { rows } = await client.query(
        'SELECT skill_id, mastery_prob FROM user_skill_mastery WHERE user_id = $1',
        [N(userId)]
      );
      return new Map(rows.map((r) => [N(r.skill_id), Number(r.mastery_prob)]));
    },

    async getMasteryRows(userId, client = pool) {
      const { rows } = await client.query(
        `SELECT usm.skill_id, usm.mastery_prob, usm.observations, usm.updated_at,
                s.skill_code, s.name, s.category
           FROM user_skill_mastery usm
           JOIN skills s ON s.skill_id = usm.skill_id
          WHERE usm.user_id = $1
          ORDER BY usm.skill_id`,
        [N(userId)]
      );
      return rows.map((r) => ({
        skillId: N(r.skill_id),
        skillCode: r.skill_code,
        name: r.name,
        category: r.category,
        masteryProb: Number(r.mastery_prob),
        observations: N(r.observations),
        updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at
      }));
    },

    async getAttempt(attemptId, client = pool) {
      const { rows } = await client.query(
        `SELECT qa.attempt_id, qa.user_id, qa.quiz_id, qa.completed_at, qa.mastery_changes,
                q.kind AS quiz_kind
           FROM quiz_attempts qa
           JOIN quizzes q ON q.quiz_id = qa.quiz_id
          WHERE qa.attempt_id = $1`,
        [N(attemptId)]
      );
      if (!rows[0]) return null;
      return {
        attemptId: N(rows[0].attempt_id),
        id: N(rows[0].attempt_id),
        userId: N(rows[0].user_id),
        quizId: N(rows[0].quiz_id),
        quizKind: rows[0].quiz_kind,
        completedAt: rows[0].completed_at,
        masteryChanges: rows[0].mastery_changes
      };
    },

    async getQuizQuestionIds(quizId, client = pool) {
      const { rows } = await client.query(
        'SELECT question_id FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_index',
        [N(quizId)]
      );
      return rows.map((r) => N(r.question_id));
    },

    async getAttemptResponses(attemptId, client = pool) {
      const { rows } = await client.query(
        `SELECT question_id, is_correct, attempt_order
           FROM question_responses
          WHERE attempt_id = $1
          ORDER BY attempt_order`,
        [N(attemptId)]
      );
      return rows.map((r) => ({
        questionId: N(r.question_id),
        isCorrect: !!r.is_correct,
        attemptOrder: N(r.attempt_order)
      }));
    },

    async getQuestionSkills(questionIds, client = pool) {
      const ids = questionIds.map(N);
      const out = new Map(ids.map((q) => [q, []]));
      if (!ids.length) return out;
      const { rows } = await client.query(
        'SELECT question_id, skill_id, weight FROM question_skills WHERE question_id = ANY($1::int[])',
        [ids]
      );
      for (const r of rows) {
        out.get(N(r.question_id)).push({
          skillId: N(r.skill_id),
          weight: Number(r.weight)
        });
      }
      return out;
    },

    async hasProcessedAttempt(attemptId, client = pool) {
      const { rows } = await client.query(
        'SELECT mastery_changes FROM quiz_attempts WHERE attempt_id = $1',
        [N(attemptId)]
      );
      return Boolean(rows[0] && rows[0].mastery_changes !== null);
    },

    /**
     * Upserts user_skill_mastery (incrementing observations) and records mastery_changes
     * on quiz_attempts. Runs in a transaction unless an active transaction client is passed.
     */
    async saveMasteryUpdate({ userId, attemptId, entries }, externalClient = null) {
      const run = async (client) => {
        for (const e of entries) {
          await client.query(
            `INSERT INTO user_skill_mastery (user_id, skill_id, mastery_prob, observations, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (user_id, skill_id)
             DO UPDATE SET
               mastery_prob = EXCLUDED.mastery_prob,
               observations = user_skill_mastery.observations + EXCLUDED.observations,
               updated_at = now()`,
            [N(userId), N(e.skillId), Number(e.after), N(e.observations ?? 0)]
          );
        }
        const masteryChangesJson = entries.map((e) => ({
          skillId: N(e.skillId),
          skillCode: e.skillCode,
          name: e.name,
          before: e.before,
          after: Number(e.after)
        }));
        await client.query(
          'UPDATE quiz_attempts SET mastery_changes = $1::jsonb WHERE attempt_id = $2',
          [JSON.stringify(masteryChangesJson), N(attemptId)]
        );
      };

      if (externalClient) {
        return run(externalClient);
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await run(client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async saveRecommendations({ userId, sourceAttemptId = null, items }, client = pool) {
      const saved = [];
      for (const item of items) {
        const { rows } = await client.query(
          `INSERT INTO recommendations
             (user_id, skill_id, lesson_id, quiz_id, source_attempt_id, mastery_prob, rank, score, rationale, created_at, clicked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), NULL)
           RETURNING recommendation_id, created_at, clicked_at`,
          [
            N(userId),
            N(item.skill.skillId),
            item.lesson ? N(item.lesson.lessonId) : null,
            item.quiz ? N(item.quiz.quizId) : null,
            sourceAttemptId != null ? N(sourceAttemptId) : null,
            Number(item.masteryProb),
            N(item.rank),
            Number(item.score),
            item.rationale
          ]
        );
        const row = rows[0];
        saved.push({
          recommendationId: N(row.recommendation_id),
          type: item.type,
          lesson: item.lesson,
          quiz: item.quiz,
          skill: item.skill,
          masteryProb: item.masteryProb,
          rank: item.rank,
          score: item.score,
          rationale: item.rationale,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          clickedAt: null
        });
      }
      return saved;
    },

    async getRecommendationById(recommendationId, client = pool) {
      const { rows } = await client.query(
        'SELECT recommendation_id, user_id, clicked_at FROM recommendations WHERE recommendation_id = $1',
        [N(recommendationId)]
      );
      if (!rows[0]) return null;
      return {
        recommendationId: N(rows[0].recommendation_id),
        userId: N(rows[0].user_id),
        clickedAt: rows[0].clicked_at
      };
    },

    async clickRecommendation(recommendationId, client = pool) {
      await client.query(
        'UPDATE recommendations SET clicked_at = COALESCE(clicked_at, now()) WHERE recommendation_id = $1',
        [N(recommendationId)]
      );
    },

    async getCompletedLessonIds(userId, client = pool) {
      const { rows } = await client.query(
        `SELECT lesson_id FROM lesson_progress WHERE user_id = $1 AND status = 'completed'`,
        [N(userId)]
      );
      return new Set(rows.map((r) => N(r.lesson_id)));
    },

    async getEnrolledCourseIds(userId, client = pool) {
      const { rows } = await client.query(
        'SELECT course_id FROM enrollments WHERE user_id = $1',
        [N(userId)]
      );
      return new Set(rows.map((r) => N(r.course_id)));
    }
  };
}

module.exports = { createPgRepository };