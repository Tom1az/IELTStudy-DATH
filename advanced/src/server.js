'use strict';
/**
 * Server chạy ĐỘC LẬP để dev/demo module advanced (dữ liệu in-memory, auth giả).
 * Khi tích hợp thật: mount router vào backend/ (xem src/index.js) – không dùng file này.
 *
 *   npm run dev
 *   curl -H 'x-user-id: u1' -X POST localhost:4100/api/v1/mastery/placement \
 *        -H 'content-type: application/json' -d '{"attemptId":"a1"}'
 *   curl -H 'x-user-id: u1' localhost:4100/api/v1/recommendations
 */
const express = require('express');
const { createServices } = require('./services');
const { createAdvancedRouter } = require('./routes');
const { devAuth } = require('./middleware/devAuth');
const { buildDemoRepository } = require('./dev/demoRepository');

const services = createServices({ repository: buildDemoRepository() });
const app = express();
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/v1', createAdvancedRouter({ services, authenticate: devAuth }));

const port = process.env.PORT || 4100;
app.listen(port, () => console.log(`advanced service (demo) on http://localhost:${port}`));
