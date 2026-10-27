# advanced/ – Personalized Learning Paths & Recommendations

Thành phần nâng cao của IELTStudy (proposal mục 4–5): **Knowledge Tracing (BKT) + Content-Based Filtering**,
chạy như một module Node.js/Express trong backend, đọc/ghi PostgreSQL (Supabase).

## Luồng hoạt động

```
Placement 30 câu ──► buildBaseline() ──► user_skill_mastery (skill vector ban đầu)
Quiz nộp bài      ──► processAttempt() ──► BKT cập nhật mastery + mastery_history
Dashboard / Post-quiz ──► GET /recommendations ──► recommend() ──► items + rationale + gates
```

| Việc cần làm | Sửa ở đâu |
|---|---|
| Ngưỡng 0.65, trọng số chấm điểm, MMR, gating, ngân sách latency | `src/config/index.js` |
| Tham số BKT từng skill (từ pyBKT/EdNet) | `src/config/bkt_params.json` (do `ml/` export) |
| Công thức cập nhật mastery | `src/bkt/bktModel.js` |
| Cách khởi tạo từ placement | `src/bkt/placement.js` |
| Cách chấm điểm / xếp hạng bài học | `src/recommender/recommend.js` |
| Câu giải thích hiển thị cho học viên | `src/recommender/rationale.js` |
| Luật khoá module (gating) | `src/recommender/gating.js` |
| SQL | `src/repositories/pgRepository.js` (+ `sql/001_advanced_schema.sql`) |
| Dữ liệu cho dashboard (radar, completion, trend) | `src/services/progressService.js` |
| Mô phỏng A/B & metric | `src/evaluation/` , `scripts/runEvaluation.js` |

Nguyên tắc: `bkt/` và `recommender/` là **hàm thuần** (không DB) → test và mô phỏng dễ; mọi truy cập DB nằm trong `repositories/`.

## REST API (mount tại `/api/v1`)

| Method & path | Mô tả |
|---|---|
| `GET /recommendations?context=dashboard\|post_quiz&attemptId=&limit=` | Gợi ý (next best step + remedial), kèm `rationale`, `gates`, `meta.latencyMs` |
| `GET /mastery/me` | Mastery từng skill |
| `POST /mastery/placement` `{attemptId}` | Khởi tạo skill vector từ placement test (chỉ 1 lần, 409 nếu lặp) |
| `POST /mastery/attempts/:attemptId/process` | Cập nhật mastery sau quiz (idempotent) |
| `GET /progress/me?historyLimit=` | Radar chart, trung bình 4 kỹ năng, completion theo khoá, trend |
| `POST /progress/lessons/:lessonId/complete` | Đánh dấu hoàn thành bài học |

Mọi route yêu cầu `req.user = { id, role }` từ middleware JWT của backend.

## Tích hợp vào backend

```js
const { createServices, createAdvancedRouter, createPgRepository } = require('../advanced/src');
const services = createServices({ repository: createPgRepository(pool, { publishedCourseStatus: 'approved' }) });
app.use('/api/v1', createAdvancedRouter({ services, authenticate: jwtAuth }));

// Trong handler nộp quiz, sau khi chấm điểm và lưu question_responses:
await services.mastery.processAttempt({ attemptId, requester: req.user });
```

Việc cần phối hợp với nhóm Backend/DB (chạy `sql/001_advanced_schema.sql`, sửa kiểu id cho khớp):
- bảng mới: `lesson_skills`, `enrollments`, `lesson_progress`, `mastery_history`
- cột mới: `lessons.is_remedial`
- giá trị `courses.status` nghĩa là "đã duyệt" (mặc định `approved`)
- `quiz_attempts.completed_at` phải được set khi nộp bài

## Chạy thử

```bash
npm install
npm test                 # 23 unit/integration test (không cần DB)
npm run eval             # mô phỏng A/B: hybrid vs sequential vs popularity
npm run dev              # server demo in-memory trên :4100 (auth giả bằng header x-user-id)
```

## Thiết kế chính

- **BKT**: P(L|obs) theo slip/guess, rồi bước learn/forget. Giới hạn xác suất trong [0.01, 0.99].
- **Multi-skill (Q-matrix)**: cập nhật tách rời từng skill, `weight` là độ mạnh bằng chứng; tổng weight > 1 được chuẩn hoá.
- **Cold-start**: placement 30 câu khởi tạo vector. Placement **tắt bước learn/forget** (bài test không dạy) – nếu không, 1 câu đúng đã đẩy skill vượt 0.65. Skill không có câu nào được gán trung bình của category.
- **Recommender**: `need_s = (0.65 − mastery_s)/0.65`; điểm = cosine(need, vector skill của bài) + urgency + level + remedial + sequence + enrolled − repeat; xếp lại bằng MMR để đa dạng.
- **Gating**: module kế tiếp bị khoá nếu còn skill *đã học trong khoá* nhưng mastery < 0.65; tự mở khi quiz luyện tập kéo mastery lên.
- **Latency**: catalog cache (TTL 60 s); `recommend()` ≈ 1 ms/120 bài, ≈ 14 ms/12.000 bài (Node 22). Thời gian đầu-cuối phụ thuộc DB (xem `meta.latencyMs`).

## Giới hạn đã biết

- Lớp route Express **chưa được test tự động** (môi trường dựng module không cài được `express`/`pg`); logic service/BKT/recommender đã test qua repository in-memory. `pgRepository` chưa chạy với DB thật.
- Kết quả mô phỏng A/B phụ thuộc giả định trong `src/evaluation/simulator.js` (mô hình học của learner tổng hợp); cần hiệu chỉnh bằng tham số pyBKT/EdNet thật từ `ml/` trước khi dùng làm số liệu báo cáo.
- `question_skills` lọc bằng `question_id::text` nên không dùng được index; nếu chậm, đổi sang cast kiểu tham số theo kiểu id thật của schema.
