'use strict';
/**
 * Nối BKT với PostgreSQL: xử lý một quiz attempt -> cập nhật user_skill_mastery (+ history).
 * placement=true: dùng initFromPlacement để khởi tạo vector kỹ năng (cold-start).
 */
const bkt = require('./bkt');

async function processAttempt(pool, attemptId, { placement = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const att = (await client.query('SELECT user_id, mastery_processed_at FROM quiz_attempts WHERE id=$1 FOR UPDATE', [attemptId])).rows[0];
    if (!att) { const e = new Error('Attempt not found'); e.status = 404; throw e; }
    if (att.mastery_processed_at) { await client.query('ROLLBACK'); return { alreadyProcessed: true }; }
    const userId = att.user_id;

    const { rows } = await client.query(
      `SELECT qr.question_id, qr.is_correct, qs.skill_id, qs.weight, s.skill_code
         FROM question_responses qr
         JOIN question_skills qs ON qs.question_id = qr.question_id
         JOIN skills s ON s.id = qs.skill_id
        WHERE qr.attempt_id = $1
        ORDER BY qr.attempt_order, qs.skill_id`, [attemptId]);

    const skillIds = [...new Set(rows.map((r) => String(r.skill_id)))];
    const pr = await client.query('SELECT skill_id, p_l0, p_t, p_s, p_g FROM skill_bkt_params WHERE skill_id = ANY($1)', [skillIds]);
    const dbParams = Object.fromEntries(pr.rows.map((r) => [String(r.skill_id), { pL0: r.p_l0, pT: r.p_t, pS: r.p_s, pG: r.p_g }]));
    const paramsOf = (skillId, code) => ({ ...bkt.getParams(code), ...dbParams[String(skillId)] });

    // gom theo câu hỏi
    const byQ = new Map();
    for (const r of rows) {
      if (!byQ.has(r.question_id)) byQ.set(r.question_id, { correct: r.is_correct, skills: [] });
      byQ.get(r.question_id).skills.push({ skillId: String(r.skill_id), weight: r.weight, params: paramsOf(r.skill_id, r.skill_code) });
    }
    const responses = [...byQ.values()];

    let mastery;
    if (placement) {
      mastery = bkt.initFromPlacement(responses);
    } else {
      const cur = await client.query('SELECT skill_id, mastery_prob FROM user_skill_mastery WHERE user_id=$1 AND skill_id = ANY($2) FOR UPDATE', [userId, skillIds]);
      mastery = Object.fromEntries(cur.rows.map((r) => [String(r.skill_id), r.mastery_prob]));
      for (const r of responses) bkt.applyResponse(mastery, r.correct, r.skills);
    }

    for (const [skillId, m] of Object.entries(mastery)) {
      await client.query(
        `INSERT INTO user_skill_mastery (user_id, skill_id, mastery_prob, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (user_id, skill_id) DO UPDATE SET mastery_prob = EXCLUDED.mastery_prob, updated_at = now()`, [userId, skillId, m]);
      await client.query('INSERT INTO user_skill_mastery_history (user_id, skill_id, mastery_prob, source_attempt_id) VALUES ($1,$2,$3,$4)', [userId, skillId, m, attemptId]);
    }
    await client.query('UPDATE quiz_attempts SET mastery_processed_at = now() WHERE id=$1', [attemptId]);
    await client.query('COMMIT');
    return { userId, mastery, weakSkills: Object.keys(mastery).filter((s) => mastery[s] < bkt.THRESHOLD) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { processAttempt };
