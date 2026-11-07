# IELTStudy - Standalone Advanced Folder (`advanced/`)

Thư mục `advanced/` này là một **Project Node.js/TypeScript độc lập** (có sẵn `package.json`, `tsconfig.json`, `src/prisma/schema.json`, `src/prisma/schema.d.ts`, `middlewares`, `services`, `controllers`, `routes`, `eval` riêng biệt).

Nó **không import bất kỳ file code nào từ thư mục `backend/`** nhưng sử dụng cùng **Prisma 8 Contract Schema** và cùng **`JWT_SECRET` + `DATABASE_URL`** nên dùng chung database và token đăng nhập với Backend.

## Cách chạy

1. Tạo file env trong thư mục `advanced/`:
   ```bash
   cd advanced
   cp .env.example .env
   ```
   *(Điền `DATABASE_URL` và `JWT_SECRET` giống với file `.env` của `backend`. Service sẽ dừng ngay với thông báo lỗi nếu thiếu một trong hai biến này.)*
2. Cài đặt và chạy:
   ```bash
   npm install
   npm run typecheck    # Kiểm tra TypeScript strict mode
   npm test             # Unit test BKT & Simulator, cộng integration test nếu có TEST_DATABASE_URL
   npm run eval         # Chạy kịch bản A/B Testing (Hybrid vs Sequential vs Popularity)
   npm run dev          # Chạy Advanced API Server tại cổng 4001 (hoặc PORT trong .env)
   ```

## Integration test

`src/test/adaptive.integration.test.ts` chạy trên PostgreSQL thật và **xóa sạch dữ liệu** của database test. Thêm `TEST_DATABASE_URL` vào `.env`, trỏ tới database riêng đã được migrate từ `backend/` (có thể dùng chung với `TEST_DATABASE_URL` của backend, vì hai bộ test không chạy song song). Không có biến này thì các test đó được bỏ qua.
