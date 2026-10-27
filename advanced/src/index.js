'use strict';
/**
 * Điểm vào của module `advanced`. Backend dùng như sau:
 *
 *   const { createServices, createAdvancedRouter, createPgRepository } = require('../advanced/src');
 *   const services = createServices({ repository: createPgRepository(pool, config) });
 *   app.use('/api/v1', createAdvancedRouter({ services, authenticate: jwtAuth }));
 *
 * Và gọi trực tiếp ngay sau khi chấm quiz:
 *   await services.mastery.processAttempt({ attemptId, requester: req.user });
 */
const { createServices } = require('./services');
const { createAdvancedRouter } = require('./routes');
const { createPgRepository } = require('./repositories/pgRepository');
const { MemoryRepository } = require('./repositories/memoryRepository');
const { recommend } = require('./recommender/recommend');
const { createConfig } = require('./config');

module.exports = {
  createServices, createAdvancedRouter, createPgRepository, MemoryRepository, recommend, createConfig
};
