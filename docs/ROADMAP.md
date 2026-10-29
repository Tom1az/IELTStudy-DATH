# IELTStudy — Project Roadmap

Source of truth for project progress. Tick each task as it lands. A phase ends at its **Gate**, which needs approval before the next phase starts.
Shared mirror for the team: https://claude.ai/artifact/3b61Q33D5viLAdrYKdKATs

## Context

IELTStudy is an adaptive IELTS platform (see `specs.md`). A 30-question diagnostic seeds per-skill BKT mastery. Any skill below 0.65 triggers remedial lessons in under 300 ms (`GET /api/v1/recommendations`). Roles: Learner, Instructor, Admin.

**Stack:** Next.js + Tailwind (Vercel) · Express + TypeScript REST API with JWT/RBAC (Docker) · PostgreSQL + Storage on Supabase · offline pyBKT pipeline exporting JSON parameters to Node. Team of 6, weeks 39–50, interim milestone week 44.

## Decisions

| Topic | Choice | Status | Needed by |
| --- | --- | --- | --- |
| Repo layout | Monorepo: `backend/`, `frontend/`, `ml/`, `docs/` | Decided | Phase 0 |
| Backend language | TypeScript (strict, run natively by Node ≥ 26.8.2, which also ships the `Temporal` API Prisma 8 timestamps need; `tsc --noEmit` to check) | Decided | Phase 0 |
| API docs | Swagger: contract-first `openapi.yaml`, served at `/api-docs`; frontend mocks with Prism | Decided | Phase 0 |
| ORM | Keep Prisma 8 contract API (pinned: orm-postgres rc.17, CLI rc.22) | Decided | Phase 0 |
| Module unit | A lesson is a module: courses are ordered `core` lessons, gated one by one | Decided | Phase 1 |
| Remedial content | `lessons.kind = remedial`: outside the gated sequence, reached only through recommendations | Decided | Phase 1 |
| Course editing after approval | Approved courses are locked; the instructor withdraws to draft, edits and resubmits | Decided | Phase 2 |
| Auth tokens | JWT in the response body, 1 day, no refresh token; the user is reloaded from the database on every request | Decided | Phase 2 |
| Practice quizzes | Need a lesson (API rule), so they follow the lesson's access and lock rules | Decided | Phase 2 |
| Recommender ranking | Ranking formula, the rule that unlocks the next module, and whether learners can open remedial lessons outside their enrolled courses | Open | Phase 3 |
| UI design | Figma file "DATH": sidebar learner layout, Plus Jakarta Sans, palette Celtic Blue / Ivory / Drab Dark Brown / Vanilla, Tea Green used sparingly (`docs/plans/phase-4-frontend.md`) | Decided | Phase 4 |

## Phase 0 — Harness and repo foundation (~1 day)

- [x] Export the plan: `docs/ROADMAP.md` plus the shared doc
- [x] Root `CLAUDE.md`: product summary, roles, folder map, conventions, commands, hard rules
- [x] `.claude/settings.json`: allow `npm run *` and git read commands; ask for commit and migrations; deny push, `.env*` and `rm -rf`; Prettier hook
- [x] Fix `.gitignore` (stop excluding `package.json` and lockfiles)
- [x] Move to monorepo with `git mv`: `backend/`, `frontend/`, `ml/`, `docs/`
- [x] `backend/package.json` + `tsconfig.json` (strict, NodeNext); scripts `dev`, `start`, `typecheck`, `test`, `lint`
- [x] Port backend to TypeScript (Node native type stripping): `req.value`/`req.user` typings, `validator.ts`
- [x] Fix existing bugs (`idSchema`, user controller leaking password and accepting `hashedPass`, `db.sql` comma)
- [x] Remove cart, product and order code (moved here from Phase 2)
- [x] Swagger UI at `/api-docs` from `backend/src/docs/openapi.yaml`
- [x] **Gate:** server starts, typecheck passes, Swagger renders, `GET /api/v1/users` returns 200 against a real DB (all verified)

## Phase 1 — Data model (spec week 40)

- [x] Users (role, target_band), Courses (status, review_feedback), Lessons, PassagesMedia
- [x] Skills, Questions (JSONB options), QuestionSkills (Q-matrix with weight)
- [x] Quizzes, QuizQuestions, QuizAttempts, QuestionResponses
- [x] UserSkillMastery, Enrollments, LessonProgress, Recommendations log
- [x] Indexes: `(user_id, skill_id)`, `(attempt_id)`, JSONB GIN
- [x] Seed: skill taxonomy, 30-question diagnostic, 3 courses
- [x] LessonSkills (skill tags on lessons, for remediation); design notes in `docs/ERD.md`
- [x] **Gate:** ERD reviewed, schema frozen (`docs/ERD.md`, baseline migration `backend/migrations/app/20261023T1815_init/`)

## Phase 2 — Core backend APIs (spec weeks 41–43)

- [x] OpenAPI contract written first for each module (`backend/src/docs/openapi.yaml` v0.2.0; plan and outcome in `docs/plans/phase-2-core-apis.md`)
- [x] **Gate:** API contract approved (v0.2.0, 2026-10-24)
- [x] Auth: register, login, JWT, `authenticate`, `authorize(...roles)`, `GET`/`PATCH /me`; tests run against `TEST_DATABASE_URL` (plan and outcome in `docs/plans/phase-2-core-apis.md`)
- [x] Courses, lessons and media: instructor CRUD, submit for review, admin approve/reject with feedback, learner enroll, lesson progress, passages (plan and outcome in `docs/plans/phase-2-core-apis.md`)
- [x] Uploads via Supabase Storage signed URLs (plan and outcome in `docs/plans/phase-2-core-apis.md`)
- [x] Questions and quizzes with skill tagging (plan and outcome in `docs/plans/phase-2-core-apis.md`)
- [x] Attempts: start, submit, score, log responses (plan and outcome in `docs/plans/phase-2-core-apis.md`)
- [x] Admin: roles and usage stats (plan and outcome in `docs/plans/phase-2-core-apis.md`)

## Phase 3 — BKT and recommender

Owned by another team member, so Phase 4 work goes ahead without it. Until it lands, the frontend shows "not available yet" for mastery, recommendations and locked lessons.

- [ ] `ml/`: fit pyBKT parameters → `ml/output/bkt_params.json`
- [ ] `services/bkt.ts`: per-response update, Q-matrix weighted split, upsert mastery inside the submit transaction
- [ ] Diagnostic sets the starting mastery (cold start)
- [ ] `services/recommender.ts`: mastery below 0.65 → tagged lessons, ranked, with a rationale
- [ ] `GET /api/v1/recommendations` + module gating
- [ ] Latency test: p95 under 300 ms
- [ ] **Gate:** ranking formula, unlock rule and remedial-lesson access approved

## Phase 4 — Frontend (parallel, against Prism mocks)

- [ ] **Gate:** Figma or wireframes approved
- [x] Auth pages (plan and outcome in `docs/plans/phase-4-frontend.md`)
- [ ] Learner: onboarding, diagnostic, dashboard (radar chart, next best step), lesson viewer, quiz player, post-quiz review
- [x] Instructor Studio: course/lesson/media editor, question authoring with skill tags (plan and outcome in `docs/plans/phase-4-frontend.md`)
- [x] Admin panel: review queue, user roles, stats (plan and outcome in `docs/plans/phase-4-frontend.md`)

## Phase 5 — Interim milestone (week 44)

- [ ] End-to-end demo: register → diagnostic → dashboard → quiz → recommendation
- [ ] Interim report

## Phase 6 — Evaluation (spec weeks 45–48)

- [ ] `ml/simulate.py`: BKT recommender vs. sequential curriculum vs. popularity baseline
- [ ] Report learning gain (target ≥ 15%), Precision@3, MRR, time-to-mastery (target 20–30% less)

## Phase 7 — Hardening and deployment (spec weeks 49–50)

- [ ] Dockerfile, GitHub Actions CI, Vercel deploy
- [ ] helmet, CORS, rate limiting, `/security-review`
- [ ] Demo seed data, final report

## Verification

| Phase | Done when |
| --- | --- |
| 0 | In `backend/`, `npm install && npm run typecheck && npm run dev` runs clean; `GET /` returns 200; `/api-docs` renders; user routes still work |
| 1 | `prisma contract emit` succeeds; migration applies to a fresh Postgres; seed runs |
| 2 | supertest suites pass: auth/RBAC (403 on wrong role), course review flow, attempt submission; manual run against Swagger |
| 3 | BKT unit tests match hand-computed values; a failed quiz drops a skill below 0.65 and a recommendation appears; p95 latency under 300 ms |
| 4–7 | Each role's flow works in the browser; CI green; staging URL live |
