'use strict';

/**
 * CHỈ DÙNG KHI CHẠY ĐỘC LẬP (npm run dev). Khi tích hợp vào backend, dùng
 * middleware JWT của backend (phải gắn req.user = { id, role }).
 */
function devAuth(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: { code: 'DEV_AUTH_DISABLED', message: 'devAuth cannot run in production' } });
  }
  const id = req.header('x-user-id');
  if (!id) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing x-user-id header (dev only)' } });
  req.user = { id, role: req.header('x-user-role') || 'learner' };
  next();
}

module.exports = { devAuth };
