# IELTStudy - Standalone Advanced Folder (`advanced/`)

Thư mục `advanced/` này là một **Project Node.js/TypeScript độc lập 100%** (có sẵn `package.json`, `tsconfig.json`, `src/prisma/schema.json`, `src/prisma/schema.d.ts`, `middlewares`, `services`, `controllers`, `routes`, `eval` riêng biệt).

Nó **không import bất kỳ file code nào từ thư mục `backend/`** nhưng sử dụng cùng **Prisma 8 Contract Schema** và cùng **`JWT_SECRET` + `DATABASE_URL`** nên tương thích tuyệt đối 100% với database và token đăng nhập của Backend hiện tại!

## Cách chạy sau khi giải nén file ZIP

1. Giải nén file zip thành thư mục `advanced/` (nằm ở bất cứ đâu, ví dụ `IELTStudy-ĐATH/advanced`).
2. Mở terminal trong thư mục `advanced/`:
   ```bash
   cd advanced
   cp .env.example .env
   ```
   *(Điền `DATABASE_URL` và `JWT_SECRET` giống với file `.env` của `backend`)*.
3. Cài đặt và chạy:
   ```bash
   npm install
   npm run typecheck    # Kiểm tra TypeScript strict mode
   npm test             # Chạy unit test BKT & Simulator
   npm run eval         # Chạy kịch bản A/B Testing (Hybrid vs Sequential vs Popularity)
   npm run dev          # Chạy Advanced API Server tại cổng 4001 (hoặc PORT trong .env)
   ```
