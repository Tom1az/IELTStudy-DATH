'use strict';

/**
 * Development-only auth middleware for standalone testing (`npm run dev`).
 * In production, use `authenticate` and `authorize("learner")` from backend/src/middlewares/auth.ts.
 */
function devAuth(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: { message: 'devAuth cannot run in production' } });
  }
  const rawId = req.header('x-user-id');
  if (!rawId) {
    return res.status(401).json({ error: { message: 'Please log in' } });
  }
  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: { message: 'Validation failed' } });
  }
  const role = req.header('x-user-role') || 'learner';
  req.user = { userId, id: userId, role };
  next();
}

module.exports = { devAuth };