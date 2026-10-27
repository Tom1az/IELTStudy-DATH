'use strict';
const { AppError, badRequest } = require('../utils/errors');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function intParam(value, { min, max, name }) {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < min || n > max) throw badRequest(`${name} must be an integer in [${min}, ${max}]`);
  return n;
}

/**
 * Router của Advanced component. Mount vào backend:
 *
 *   app.use('/api/v1', createAdvancedRouter({ services, authenticate: jwtAuth }));
 *
 * `authenticate` là middleware JWT/RBAC của backend, phải gắn req.user = { id, role }.
 *
 * Endpoints:
 *   GET  /recommendations?context=dashboard|post_quiz&attemptId=&limit=
 *   GET  /mastery/me
 *   POST /mastery/placement                  { attemptId }
 *   POST /mastery/attempts/:attemptId/process
 *   GET  /progress/me?historyLimit=
 *   POST /progress/lessons/:lessonId/complete
 */
function createAdvancedRouter({ services, authenticate, logger = console }) {
  const express = require('express'); // require tại đây để phần logic test được khi chưa cài express
  const router = express.Router();
  router.use(express.json());
  router.use(authenticate);

  router.get('/recommendations', wrap(async (req, res) => {
    const limit = intParam(req.query.limit, { min: 1, max: services.config.recommender.maxLimit, name: 'limit' });
    const data = await services.recommendations.getRecommendations({
      userId: req.user.id, requester: req.user,
      context: req.query.context || 'dashboard', attemptId: req.query.attemptId, limit
    });
    res.json(data);
  }));

  router.get('/mastery/me', wrap(async (req, res) => {
    res.json({ threshold: services.config.masteryThreshold, skills: await services.mastery.getMastery(req.user.id) });
  }));

  router.post('/mastery/placement', wrap(async (req, res) => {
    if (!req.body || !req.body.attemptId) throw badRequest('attemptId is required');
    const out = await services.mastery.initPlacement({ attemptId: req.body.attemptId, requester: req.user });
    services.recommendations.invalidateCache(); // an toàn khi catalog/skill vừa thay đổi
    res.status(201).json(out);
  }));

  router.post('/mastery/attempts/:attemptId/process', wrap(async (req, res) => {
    const out = await services.mastery.processAttempt({ attemptId: req.params.attemptId, requester: req.user });
    res.status(out.alreadyProcessed ? 200 : 201).json(out);
  }));

  router.get('/progress/me', wrap(async (req, res) => {
    const historyLimit = intParam(req.query.historyLimit, { min: 1, max: 1000, name: 'historyLimit' });
    res.json(await services.progress.getProgress({ userId: req.user.id, historyLimit }));
  }));

  router.post('/progress/lessons/:lessonId/complete', wrap(async (req, res) => {
    res.json(await services.progress.completeLesson({ userId: req.user.id, lessonId: req.params.lessonId }));
  }));

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    logger.error('[advanced] unexpected error', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  return router;
}

module.exports = { createAdvancedRouter };
