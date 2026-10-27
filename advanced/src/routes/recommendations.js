'use strict';
const express = require('express');
const { recommend, evaluateGate } = require('../services/recommender');
const { buildProgress } = require('../services/progressService');
const { processAttempt } = require('../services/masteryService');

const LEVEL = { beginner: 1, intermediate: 2, advanced: 3 };

/**
 * Mount: app.use('/api/v1', createAdaptiveRouter({ pool, authenticate }))
 * `authenticate` là middleware JWT sẵn có, phải gán req.user = { id, role, target_band }.
 */
function createAdaptiveRouter({ pool, authenticate }) {
  const r = express.Router();
  r.use(authenticate);
  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

  async function loadMastery(userId) {
    const { rows } = await pool.query(
      `SELECT m.skill_id, m.mastery_prob, s.skill_code, s.skill_category, s.description
         FROM user_skill_mastery m JOIN skills s ON s.id = m.skill_id WHERE m.user_id=$1`, [userId]);
    return rows;
  }

  // GET /api/v1/recommendations?limit=3&locale=en   (Dashboard "next best step" + Post-Quiz screen)
  r.get('/recommendations', wrap(async (req, res) => {
    const k = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || 3));
    const locale = req.query.locale === 'vi' ? 'vi' : 'en';
    const mrows = await loadMastery(req.user.id);
    if (!mrows.length) return res.status(409).json({ error: 'PLACEMENT_REQUIRED', message: 'Hoàn thành placement test trước.' });

    const mastery = Object.fromEntries(mrows.map((m) => [String(m.skill_id), m.mastery_prob]));
    const skillNames = Object.fromEntries(mrows.map((m) => [String(m.skill_id), m.description || m.skill_code]));

    const { rows } = await pool.query(
      `SELECT l.id, l.title, l.order_index, c.target_level,
              (lp.status = 'completed') AS completed,
              COALESCE(json_agg(json_build_object('skillId', ls.skill_id::text, 'code', s.skill_code, 'weight', ls.weight))
                       FILTER (WHERE ls.skill_id IS NOT NULL), '[]') AS skills
         FROM lessons l
         JOIN courses c ON c.id = l.course_id AND c.status = 'published'
         LEFT JOIN lesson_skills ls ON ls.lesson_id = l.id
         LEFT JOIN skills s ON s.id = ls.skill_id
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
        GROUP BY l.id, c.target_level, lp.status`, [req.user.id]);
    const lessons = rows.map((x) => ({ id: x.id, title: x.title, orderIndex: x.order_index, level: LEVEL[x.target_level] || 2, completed: !!x.completed, skills: x.skills }));

    const result = recommend({ mastery, lessons, targetBand: req.user.target_band, k, locale, skillNames });

    // log để đo Precision@3 / MRR / CTR (không chặn response nếu lỗi)
    result.items.forEach((it, i) =>
      pool.query('INSERT INTO recommendation_log (user_id, lesson_id, rank, score, type, rationale) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.user.id, it.lessonId, i + 1, it.score, it.type, it.rationale]).catch(() => {}));
    res.json(result);
  }));

  // POST /api/v1/recommendations/:lessonId/click
  r.post('/recommendations/:lessonId/click', wrap(async (req, res) => {
    await pool.query(
      `UPDATE recommendation_log SET clicked_at = now()
        WHERE id = (SELECT id FROM recommendation_log WHERE user_id=$1 AND lesson_id=$2 AND clicked_at IS NULL ORDER BY generated_at DESC LIMIT 1)`,
      [req.user.id, req.params.lessonId]);
    res.status(204).end();
  }));

  // POST /api/v1/attempts/:attemptId/mastery  body: { placement?: boolean }
  // Gọi ngay sau khi submit quiz; trả mastery mới + gợi ý remedial cho Post-Quiz Screen.
  r.post('/attempts/:attemptId/mastery', wrap(async (req, res) => {
    const out = await processAttempt(pool, req.params.attemptId, { placement: !!req.body?.placement });
    if (out.userId && out.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
    res.json(out);
  }));

  // GET /api/v1/lessons/:lessonId/gate  -> module có bị khoá do skill < 0.65 không
  r.get('/lessons/:lessonId/gate', wrap(async (req, res) => {
    const [m, ls] = await Promise.all([
      loadMastery(req.user.id),
      pool.query('SELECT skill_id FROM lesson_skills WHERE lesson_id=$1', [req.params.lessonId]),
    ]);
    const mastery = Object.fromEntries(m.map((x) => [String(x.skill_id), x.mastery_prob]));
    res.json(evaluateGate(mastery, ls.rows.map((x) => String(x.skill_id))));
  }));

  // GET /api/v1/progress/me  -> dữ liệu cho radar chart + dashboard
  r.get('/progress/me', wrap(async (req, res) => {
    const [m, h, lp] = await Promise.all([
      loadMastery(req.user.id),
      pool.query(`SELECT skill_id, mastery_prob, created_at FROM user_skill_mastery_history WHERE user_id=$1 AND created_at > now() - interval '30 days'`, [req.user.id]),
      pool.query(
        `SELECT (SELECT count(*) FROM lessons l JOIN courses c ON c.id=l.course_id AND c.status='published') AS total,
                (SELECT count(*) FROM lesson_progress WHERE user_id=$1 AND status='completed') AS completed`, [req.user.id]),
    ]);
    res.json(buildProgress({
      skills: m.map((x) => ({ skillId: String(x.skill_id), code: x.skill_code, category: x.skill_category, mastery: x.mastery_prob })),
      history: h.rows.map((x) => ({ skillId: String(x.skill_id), mastery: x.mastery_prob, at: x.created_at })),
      lessons: { total: +lp.rows[0].total, completed: +lp.rows[0].completed },
      targetBand: req.user.target_band,
    }));
  }));

  return r;
}

module.exports = { createAdaptiveRouter };
