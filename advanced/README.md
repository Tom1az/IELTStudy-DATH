# IELTStudy – Advanced Component: Personalized Learning Paths & Progress Tracking

BKT (Knowledge Tracing) + Content-Based Filtering, tích hợp như một service module của backend Node.js/Express.

## Cấu trúc
| File | Vai trò |
|---|---|
| `src/services/bkt.js` | BKT: cập nhật mastery, multi-skill (Q-Matrix), khởi tạo từ placement test (cold-start) |
| `src/services/recommender.js` | Content-Based Filtering + MMR re-ranking + gate mở khoá module (ngưỡng 0.65) + rationale |
| `src/services/progressService.js` | Dữ liệu dashboard: radar 4 kỹ năng, trend 7 ngày, danh sách skill yếu, % hoàn thành |
| `src/services/masteryService.js` | Xử lý 1 quiz attempt -> UPSERT `user_skill_mastery` + history (transaction, idempotent) |
| `src/routes/recommendations.js` | REST API `/api/v1/...` |
| `db/migrations/001_adaptive_learning.sql` | Bảng mới: `lesson_skills`, `lesson_progress`, `skill_bkt_params`, `user_skill_mastery_history`, `recommendation_log` |
| `scripts/pybkt_export.py` | Offline: fit pyBKT trên EdNet -> ghi `src/config/bktParams.json` |
| `sim/simulate.js` | Simulated A/B: g, Precision@3, MRR, Time-to-Mastery |
| `test/adaptive.test.js` | 10 unit test |

## Tích hợp vào backend
```js
const { createAdaptiveRouter } = require('./adaptive/src');
app.use('/api/v1', createAdaptiveRouter({ pool, authenticate: jwtMiddleware })); // jwtMiddleware gán req.user = {id, role, target_band}
```
Chạy migration `001_adaptive_learning.sql` (chỉnh kiểu id cho khớp schema, thêm PK `(user_id, skill_id)` cho `user_skill_mastery`).

## API
| Method & Path | Mô tả |
|---|---|
| `POST /attempts/:id/mastery` `{placement?:bool}` | Gọi ngay sau khi nộp quiz/placement. Trả mastery mới + `weakSkills` |
| `GET /recommendations?limit=3&locale=en\|vi` | Top-k gợi ý + `rationale` + `latencyMs`. 409 `PLACEMENT_REQUIRED` nếu chưa làm placement |
| `POST /recommendations/:lessonId/click` | Ghi click (để tính CTR/Precision@3 thật) |
| `GET /lessons/:id/gate` | `{locked, blockingSkills}` – khoá module nếu có skill < 0.65 |
| `GET /progress/me` | Dữ liệu radar chart + skill detail + trend + completion |

## Luồng
Placement 30 câu -> `POST /attempts/:id/mastery {placement:true}` -> vector kỹ năng ban đầu ->
mỗi quiz: `POST /attempts/:id/mastery` -> `GET /recommendations` (Post-Quiz Screen + Dashboard).

## Chạy
```
npm install && npm test        # 10 test
npm run simulate               # N=500 BUDGET=45 G_AT=15 (đổi bằng env)
```
