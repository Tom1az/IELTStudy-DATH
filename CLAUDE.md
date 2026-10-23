# IELTStudy

Adaptive IELTS learning platform (full spec: `specs.md`). A 30-question diagnostic seeds per-skill mastery. A Bayesian Knowledge Tracing (BKT) engine updates mastery after every quiz. Any micro-skill below **0.65** mastery triggers remedial lessons in under **300 ms** (`GET /api/v1/recommendations`), and each recommendation comes with a human-readable rationale.

**Roles:**
- **Learner:** takes the diagnostic, studies, takes quizzes, gets recommendations.
- **Instructor:** builds courses, lessons and media, and tags questions with skills.
- **Admin:** approves or rejects courses and manages user roles.

## Project context

This is a 3rd-year CS integration school project, and the code is built mostly with Claude Code. The owner wants to learn from the code, keep maintaining it after the course ends, and show it on their CV.

- **Follow `specs.md` strictly.** Build what the spec asks for, and nothing more. If the spec is unclear or something seems missing, ask before adding it. Don't build features the spec doesn't mention.
- **Write code a 3rd-year CS student can read and maintain.** Prefer plain, common TypeScript and Express patterns: clear names, small functions, `async`/`await`, early returns, and simple loops when they read better than chained calls.
- **Avoid niche syntax and clever tricks.** Avoid advanced generic or conditional types, type-level programming, dense one-liners and obscure library features. Don't use metaprogramming. If a less common construct is genuinely needed, add a short comment explaining what it does and why.
- **Explain non-obvious logic.** BKT updates, ranking and scoring get a comment that says what the code does in plain words, with a reference to the spec where it helps.
- **Explain changes when reporting back:** what changed, why, and which files to read to understand it.

## Repo map

| Path | What |
| --- | --- |
| `backend/` | Express 5 + TypeScript REST API, Prisma 8, Joi validation. See `backend/CLAUDE.md`. |
| `frontend/` | Next.js + Tailwind (Phase 4, not scaffolded yet) |
| `ml/` | Offline pyBKT fitting and A/B simulation (Phase 3/6). Python venv lives at the repo root `.venv/`. |
| `docs/ROADMAP.md` | **Source of truth for progress.** Phases, tasks and approval gates. |
| `docs/ERD.md` | Data model: diagram, delete rules, JSONB shapes, invariants the app must enforce |
| `docs/CLAUDE_CODE_GUIDE.md` | How the team steers Claude Code |
| `specs.md` | Product and technical spec |

## Commands (run in `backend/`)

```bash
npm run dev            # node --watch src/server.ts (Node >= 26.8.2: runs .ts natively and ships Temporal)
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # vitest + supertest
npm run contract:emit  # regenerate Prisma contract after editing schema.prisma
```

Swagger UI is served at `http://localhost:3000/api-docs`.

## Workflow

- Work one `docs/ROADMAP.md` task at a time. Start in plan mode for anything beyond a small fix.
- Tick the task in `docs/ROADMAP.md` when it's done and verified.
- Before saying a task is done, run `npm run typecheck && npm run lint && npm test` in `backend/`.
- Work on a feature branch, never directly on `main`.

## Effort guide

Set effort with `/effort <level>` before starting a task. Match the level to how hard the task is to get *right*, not to how big it is. Large mechanical work is cheap; small subtle work is not.

| Effort | Use for | IELTStudy examples |
| --- | --- | --- |
| `low` | Mechanical edits with an obvious answer and an existing pattern to copy | Rename, fix a typo or lint error, add a field to an existing Joi schema, tick `ROADMAP.md`, update `.env.example`, write a README |
| `medium` (default) | Standard feature work that follows existing patterns | A new CRUD route/controller like `routes/user.ts`, OpenAPI entries for it, supertest tests, seed data, Next.js pages from an approved wireframe, Dockerfile, CI workflow |
| `high` | Work that crosses several files or has rules that are easy to get subtly wrong | JWT auth + `authorize(...roles)` RBAC, the course review flow (instructor submits → admin approves/rejects), attempt submission + scoring in a transaction, Supabase signed uploads, debugging a failure whose cause is unclear |
| `xhigh` | Design decisions that are expensive to undo | Phase 1 schema design (the frozen ERD), the Phase 2 API contract, `/security-review` before deployment |
| `max` | Correctness-critical algorithms where a wrong answer looks plausible | BKT update with the Q-matrix multi-skill split, recommender ranking + module unlock rule, A/B simulation and metrics (learning gain, Precision@3, MRR) |

**Rules of thumb:**
- Plan at a higher level, then implement at a lower one. For example, plan the schema at `xhigh`, then write the migration and seed at `medium` once the plan is approved.
- If a `low`/`medium` task fails twice or the fix keeps changing, stop. Raise effort one level and re-plan instead of retrying.
- Reviews (`/code-review`) of auth, scoring, BKT or recommender code: use `high` or above. Other reviews: `medium`.
- At the start of a task, Claude states the effort level this table suggests. If the current level differs by two or more steps, Claude says so before starting.

## Hard rules

- Never read or edit `.env` files. Use `.env.example` to document new variables.
- **Schema changes need approval.** Propose the change to `backend/src/prisma/schema.prisma` first, then run `contract:emit`.
- Every endpoint lives under `/api/v1` and must be added to `backend/src/docs/openapi.yaml` in the same change.
- Never commit or push unless asked. Never use `--force` or `--no-verify`.
- Don't add dependencies without saying why. Pin Prisma packages exactly, because they are release candidates.
- Code and comments in English. Match the comment density of the surrounding code.
