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
| `client.ts` | `backendRequest()`: sends `Authorization: Bearer <JWT>`, turns `{ error: { message, details } }` into an `ApiError` with per-field messages, and sends the user to `/login` when the token expires (there is no refresh token). `optional()` / `isMissingEndpoint()` for calls whose route the backend hasn't written yet, and `notAvailable()` for features with no call at all. |
| `backend-types.ts` | Response shapes copied from `openapi.yaml`. Keep them in sync. A route that isn't in `openapi.yaml` yet keeps its shape in the module that calls it, with the proposed contract written above it. |
| `mappers.ts`, `quiz-mappers.ts` | Convert backend shapes into the types the pages use (`src/lib/types.ts`), and quiz answers in both directions. Unit-tested. |
| `auth.ts` | Register, login, `GET /me`, `PATCH /me`, and the two password-reset calls. |
| `learning.ts` | Catalog, course page, enrolment and leaving a course, lesson viewer and progress, learner dashboard. |
| `practice.ts` | Practice list, quiz player, post-quiz review, history, the diagnostic (placement quiz). Answers autosave to the backend while the quiz is open, with this browser as the fallback copy. |
| `instructor.ts` | Instructor Studio: courses and the review flow, lessons, passages and media uploads, questions (with Q-matrix weights) and quizzes. |
| `grading.ts` | The grading queue, one submission with its answers, the instructor's written feedback, and the learner list. |
| `admin.ts` | Users (role, suspend), the course review queue, usage statistics, the audit log. |

**Endpoints we are waiting for.** These pages are built and in the menus. Each one calls its endpoint, and while the backend answers 404 it shows a short "not available yet" card instead of an error, so nothing has to change in the frontend on the day the route ships:

| Page | Endpoint |
|---|---|
| `/forgot-password`, `/reset-password` | `POST /auth/forgot-password`, `POST /auth/reset-password` |
| `/admin/audit` | `GET /admin/audit` |
| `/instructor/grading` | `GET /instructor/submissions`, `GET /instructor/submissions/{attemptId}`, `PUT /instructor/submissions/{attemptId}/feedback` |
| `/instructor/learners` | `GET /instructor/learners` |
| Quiz player autosave | `PUT /attempts/{attemptId}/answers`, `GET /attempts/{attemptId}/answers` |
| Feedback on a result | `GET /attempts/{attemptId}/feedback` |

**Still a stub with no page behind it**, and left out of the menus: notifications, writing tasks, instructor analytics, admin skills, reports and evaluation.

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
  app/(site)/        public + learner pages (site header, or the learner sidebar)
  app/(focus)/       full-screen lesson viewer, quiz player, placement quiz
  app/instructor/    instructor studio (sidebar layout)
  app/admin/         admin panel (sidebar layout)
  components/        UI kit, layout, quiz player, studio editors, charts
  lib/api/           API client, backend types, mappers, one module per area
  lib/               UI types, auth context, hooks, formatting
e2e/                 Playwright end-to-end tests
```

## Design

The look follows the team's Figma file "DATH". Colours, font and radii are Tailwind tokens in `tailwind.config.ts`, so use the token names, not hex values:

| Token | Colour | Use |
|---|---|---|
| `brand` | Celtic Blue #3971B8 | buttons, active nav, progress, links, "correct" in review |
| `ivory` | Ivory #FBFCEE | page background |
| `ink` | Drab Dark Brown #343B1B | text, dark surfaces |
| `vanilla` | Vanilla #F6E6A5 | accent cards, selected answer |
| `tea` | Tea Green #C8D69B | used sparingly: the "below 65%" mastery badge (and, darker, the Writing skill colour) |
| `line`, `danger` | #E0E5D4, #B42318 | borders, errors |

Learners get the sidebar layout (`components/layout/LearnerShell.tsx`, a bottom bar on phones). Guests use `SiteHeader`, and instructors and admins use `AppShell`. The font is Plus Jakarta Sans (`@fontsource/plus-jakarta-sans`).

### Motion

Movement is there to show what changed, never to decorate. Everything uses the same easing token (`ease-swift`) and one of the animations in `tailwind.config.ts`:

| Class | Where it is used |
|---|---|
| `animate-rise` / `.reveal` | A card or panel that has just arrived (a result, an alert, a new section of a quiz) |
| `.stagger` | A list whose rows should arrive one after the other, not all at once |
| `animate-sheet`, `animate-fade` | Dialogs: the panel and the backdrop behind it |
| `animate-toast` | The toast strip at the bottom of the screen |
| `.shimmer` | Loading placeholders (`<Skeleton />`) |
| `.card-hover` | A card that is a link or a button: it lifts under the pointer |

Two rules go with them. Nothing moves more than about 10px or lasts longer than 700ms, and `prefers-reduced-motion` turns all of it off in `globals.css` — so test a change with that setting on as well.

## Notes

- Estimated bands are practice indicators, not official IELTS scores.
- AI use disclosure: parts of this frontend were produced with the help of an AI assistant (Claude) and reviewed by the team.
