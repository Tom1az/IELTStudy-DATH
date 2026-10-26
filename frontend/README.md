# IELTStudy — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS. Learner, instructor and admin UIs for the IELTStudy backend in `../backend`.

## Quick start

```bash
cd ../backend && npm run dev   # the API on http://localhost:3000 (needs its database and seed data)
cd ../frontend
npm install
npm run dev                    # http://localhost:3001
```

Calls go to `/api/v1`, which the Next.js proxy in `next.config.mjs` forwards to the backend (`BACKEND_URL`, default `http://localhost:3000`), so the backend needs no CORS. Copy `.env.example` to `.env.local` only to change those defaults. The seed accounts (`learner@`, `instructor@`, `admin@ieltstudy.dev`) use the backend's `SEED_PASSWORD`; new accounts sign up as learners, and an admin promotes instructors on `/admin/users`.

## API contract

The single source of truth is [`backend/src/docs/openapi.yaml`](../backend/src/docs/openapi.yaml) (Swagger UI at `http://localhost:3000/api-docs`). Decisions about how the frontend uses it are in [`docs/plans/phase-4-frontend.md`](../docs/plans/phase-4-frontend.md).

| File in `src/lib/api/` | What it does |
|---|---|
| `client.ts` | `backendRequest()`: sends `Authorization: Bearer <JWT>`, turns `{ error: { message, details } }` into an `ApiError` with per-field messages, and sends the user to `/login` when the token expires (there is no refresh token). `notAvailable()` for features the backend doesn't have yet. |
| `backend-types.ts` | Response shapes copied from `openapi.yaml`. Keep them in sync. |
| `mappers.ts`, `quiz-mappers.ts` | Convert backend shapes into the types the pages use (`src/lib/types.ts`), and quiz answers in both directions. Unit-tested. |
| `auth.ts` | Register, login, `GET /me`, `PATCH /me`. |
| `learning.ts` | Catalog, course page, enrolment, lesson viewer and progress, learner dashboard. |
| `practice.ts` | Practice list, quiz player, post-quiz review, history, the diagnostic (placement quiz). Answers in progress stay in localStorage until submit, because the backend has no autosave. |
| `instructor.ts` | Instructor Studio: courses and the review flow, lessons, passages and media uploads, questions (with Q-matrix weights) and quizzes. |
| `admin.ts` | Users (role, suspend), the course review queue, usage statistics. |

**Waiting for Phase 3 (BKT):** skill mastery, band estimates and recommendations show "not available yet" until `GET /me/mastery` and `GET /recommendations` exist and attempts return `masteryChanges`.

**No backend yet**, so the page is a "not available yet" stub and is left out of the menus: notifications, writing tasks and grading, password reset, instructor learners and analytics, admin skills, reports, audit log and evaluation.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build, serve (port 3001) |
| `npm run typecheck` · `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) against the running backend. First run `npx playwright install chromium`. The instructor and admin tests need the backend's `SEED_PASSWORD` in the environment and are skipped without it. |

On a Linux version Playwright doesn't support yet (e.g. Ubuntu 26.04), install the Ubuntu 24.04 build with `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium`, and run the tests with `PW_CHROMIUM_PATH=~/.cache/ms-playwright/chromium-<version>/chrome-linux/chrome` (read by `playwright.config.ts`).

## Project structure

```
src/
  app/(site)/        public + learner pages with the site header
  app/(focus)/       full-screen lesson viewer, quiz player, placement quiz
  app/instructor/    instructor studio (sidebar layout)
  app/admin/         admin panel (sidebar layout)
  components/        UI kit, layout, quiz player, studio editors, charts
  lib/api/           API client, backend types, mappers, one module per area
  lib/               UI types, auth context, hooks, formatting
e2e/                 Playwright end-to-end tests
```

## Notes

- Estimated bands are practice indicators, not official IELTS scores.
- AI use disclosure: parts of this frontend were produced with the help of an AI assistant (Claude) and reviewed by the team.
