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
| Backend language | TypeScript (strict, run natively by Node ≥ 24, `tsc --noEmit` to check) | Decided | Phase 0 |
| API docs | Swagger: contract-first `openapi.yaml`, served at `/api-docs`; frontend mocks with Prism | Decided | Phase 0 |
| ORM | Keep Prisma 8 contract API (pinned: orm-postgres rc.17, CLI rc.22) | Decided | Phase 0 |
| Recommender ranking | Ranking formula and the rule that unlocks the next module | Open | Phase 3 |
| UI design | Figma or wireframe approval | Open | Phase 4 |

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

- [ ] Users (role, target_band), Courses (status, review_feedback), Lessons, PassagesMedia
- [ ] Skills, Questions (JSONB options), QuestionSkills (Q-matrix with weight)
- [ ] Quizzes, QuizQuestions, QuizAttempts, QuestionResponses
- [ ] UserSkillMastery, Enrollments, LessonProgress, Recommendations log
- [ ] Indexes: `(user_id, skill_id)`, `(attempt_id)`, JSONB GIN
- [ ] Seed: skill taxonomy, 30-question diagnostic, 3 courses
- [ ] **Gate:** ERD reviewed, schema frozen

## Phase 2 — Core backend APIs (spec weeks 41–43)

- [ ] OpenAPI contract written first for each module
- [ ] **Gate:** API contract approved
- [ ] Auth: register, login, JWT, `authenticate`, `authorize(...roles)` (port signup/signin from `MiniMemoryZone/backend/controllers/auth.js`)
- [ ] Courses, lessons and media: instructor CRUD, submit for review, admin approve/reject with feedback, learner enroll
- [ ] Uploads via Supabase Storage signed URLs
- [ ] Questions and quizzes with skill tagging
- [ ] Attempts: start, submit, score, log responses
- [ ] Admin: roles and usage stats

## Phase 3 — BKT and recommender

- [ ] `ml/`: fit pyBKT parameters → `ml/output/bkt_params.json`
- [ ] `services/bkt.ts`: per-response update, Q-matrix weighted split, upsert mastery inside the submit transaction
- [ ] Diagnostic sets the starting mastery (cold start)
- [ ] `services/recommender.ts`: mastery below 0.65 → tagged lessons, ranked, with a rationale
- [ ] `GET /api/v1/recommendations` + module gating
- [ ] Latency test: p95 under 300 ms
- [ ] **Gate:** ranking formula and unlock rule approved

## Phase 4 — Frontend (parallel, against Prism mocks)

- [ ] **Gate:** Figma or wireframes approved
- [ ] Auth pages
- [ ] Learner: onboarding, diagnostic, dashboard (radar chart, next best step), lesson viewer, quiz player, post-quiz review
- [ ] Instructor Studio: course/lesson/media editor, question authoring with skill tags
- [ ] Admin panel: review queue, user roles, stats

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
