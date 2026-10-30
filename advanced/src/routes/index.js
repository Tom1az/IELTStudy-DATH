'use strict';
const { AppError, badRequest, unauthorized, forbidden } = require('../utils/errors');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parsePositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest(`"${fieldName}" must be a positive integer`);
  }
  return n;
}

function requireLearner(req, res, next) {
  if (!req.user) return next(unauthorized('Please log in'));
  if (req.user.role !== 'learner') {
    return next(forbidden("You don't have permission to do this"));
  }
  next();
}

/**
 * Advanced component router matching backend/src/docs/openapi.yaml:
 *   GET  /me/mastery
 *   GET  /recommendations
 *   POST /recommendations/:recommendationId/click
 */
function createAdvancedRouter({ services, authenticate, logger = console }) {
  const express = require('express');
  const router = express.Router();
  router.use(express.json());
  router.use(authenticate);

  router.get('/me/mastery', requireLearner, wrap(async (req, res) => {
    const userId = Number(req.user.userId ?? req.user.id);
    const result = await services.mastery.getMastery(userId);
    res.status(200).json(result);
  }));

  router.get('/recommendations', requireLearner, wrap(async (req, res) => {
    const userId = Number(req.user.userId ?? req.user.id);
    const result = await services.recommendations.getRecommendations({
      userId,
      requester: req.user
    });
    res.status(200).json(result);
  }));

  router.post('/recommendations/:recommendationId/click', requireLearner, wrap(async (req, res) => {
    const recommendationId = parsePositiveInt(req.params.recommendationId, 'recommendationId');
    const result = await services.recommendations.clickRecommendation({
      recommendationId,
      requester: req.user
    });
    res.status(200).json(result);
  }));

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err instanceof AppError || typeof err.status === 'number') {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    logger.error('[advanced] unexpected error', err);
    res.status(500).json({ error: { message: 'Internal server error' } });
  });

  return router;
}

module.exports = { createAdvancedRouter };