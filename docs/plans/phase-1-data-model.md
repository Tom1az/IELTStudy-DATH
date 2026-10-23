# Phase 1: Data model

Approved plan for the Phase 1 tasks in `docs/ROADMAP.md`. Phase 1 used one plan for all of its tasks, because the schema had to be designed as a whole. This file was written after the fact (2026-10-24), when the "export every approved plan" rule was added to `CLAUDE.md`.

## Task: the whole data model (tables, indexes, seed) and the Gate

Covers these roadmap items:
- Users, Courses, Lessons, PassagesMedia
- Skills, Questions, QuestionSkills
- Quizzes, QuizQuestions, QuizAttempts, QuestionResponses
- UserSkillMastery, Enrollments, LessonProgress, Recommendations log
- Indexes
- Seed
- **Gate:** ERD reviewed, schema frozen

Approved: 2026-10-24 (designed at effort `xhigh`; the plan said to build it at `medium`).

### Context

Phase 0 left the e-commerce schema (`Users`, `Carts`, `Products`, `Orders`) in `backend/src/prisma/schema.prisma`. Phase 1 replaces it with the IELTStudy data model from `specs.md` §5 and the roadmap's Phase 1 list. The schema is frozen at the Phase 1 Gate, because Phase 2 APIs, Phase 3 BKT and recommender, and Phase 6 evaluation all build on it.

Decisions taken with the owner before planning:
- **Module = lesson.** A course is an ordered list of core lessons. Lesson N+1 unlocks when lesson N's quiz skills pass the gate; the exact rule is a Phase 3 decision.
- **Remedial lessons are a lesson kind** (`core | remedial`). Remedial lessons sit outside the gated sequence and are reached only through recommendations, matched by skill tags.
- **Node ≥ 26.8.2.** Prisma 8 timestamp columns are `Temporal` values, and Node 26.8.2+ ships `Temporal` natively, so no runtime dependency is needed.

### Conventions kept from the existing code

- Models are PascalCase plurals mapped to snake_case tables. Fields are camelCase with `@map("snake_case")`. Keys are `Int @id @default(autoincrement())` named `<entity>Id`, so `idSchema` and the user routes keep working.
- The existing `users` columns keep their names.
- Enums are PSL `enum` blocks stored as `text` plus a generated CHECK, with lowercase snake_case values.
- Timestamps use `timestamptz` everywhere.
- Delete rules: content with learner history can't be hard-deleted (courses use `status = archived` instead). Deleting a user removes their learning data, but is blocked while they have authored content (admins deactivate users with `is_active` instead).

### Tables (16)

| Table | Purpose / notable columns |
| --- | --- |
| `users` | `role` (learner/instructor/admin), `target_band` (0–9 in 0.5 steps), `is_active` |
| `courses` | `instructor_id`, `target_level`, `status` (draft → pending_review → approved/rejected, plus archived), `review_feedback` (required when rejected), `reviewed_by_id`, `submitted_at`, `reviewed_at` |
| `lessons` | `course_id`, `kind` (core/remedial), `order_index`, `content` |
| `lesson_skills` | Skill tags on lessons, used for remediation; `weight` in (0,1] |
| `passages_media` | `lesson_id` (null for diagnostic passages), `type` (reading_text/listening_audio/video), `content`, `media_path` (a Storage object path, never a signed URL) |
| `skills` | `skill_code` (unique, the immutable key into `ml/output/bkt_params.json`), `category` |
| `questions` | `passage_id?`, `question_type`, `question_text`, `options` and `answer_key` (JSONB), `explanation`, `difficulty` 1–5 |
| `question_skills` | The **Q-matrix**: `weight` in (0,1], summing to 1 per question (checked by the app and the seed) |
| `quizzes` | `kind` (diagnostic/lesson/practice), `lesson_id?`, at most one diagnostic quiz |
| `quiz_questions` | `order_index`; questions are reusable across quizzes |
| `quiz_attempts` | `started_at`, `completed_at`, `total_score`, `max_score`, `mastery_changes` (JSONB); at most one open attempt per user and quiz |
| `question_responses` | `user_answer` (JSONB), `is_correct`, `attempt_order`, `response_time_seconds`; unique per attempt and question |
| `user_skill_mastery` | `mastery_prob` in [0,1], `observations` |
| `enrollments` | `enrolled_at`, `completed_at` |
| `lesson_progress` | `status` (in_progress/completed); `completed_at` is set exactly when completed |
| `recommendations` | Log: the weak `skill_id`, exactly one of `lesson_id`/`quiz_id`, `source_attempt_id?`, `mastery_prob`, `rank`, `score`, `rationale`, `clicked_at` |

**Indexes (roadmap item):**
- `(user_id, skill_id)` is the primary key of `user_skill_mastery`.
- `(attempt_id)` leads `UNIQUE(attempt_id, question_id)` on `question_responses`.
- The JSONB GIN index is on `question_responses.user_answer`.
- Also: `skill_id` on both skill-tag tables, `courses(status)`, `lessons(course_id, order_index)`, `quiz_attempts(user_id, quiz_id)`, `recommendations(user_id, created_at)`, and every foreign key without a covering index.

**JSONB shapes** for each question type are documented in `docs/ERD.md`.

The full schema draft from the plan now lives in `backend/src/prisma/schema.prisma`, which was built from it with only the deviations listed under Outcome.

### Implementation steps

1. Raise the minimum Node version to 26.8.2 in `package.json` and the docs.
2. Replace `schema.prisma`, then run `npm run contract:emit`.
3. Fix the code that depends on the schema (the `createdAt` type in `controllers/user.ts`, and the Temporal types).
4. Plan the baseline migration with `prisma migration plan --from @empty --name init`. The owner drops the hand-made Phase 0 `users` table and runs `db:migrate` and `db:verify`, because auto mode blocks Claude from writing to the shared database. Add npm scripts `migration:plan`, `db:migrate`, `db:verify` and `seed`.
5. Seed (`src/prisma/seed.ts`), in one transaction that refuses to run on a non-empty database:
   - 3 users
   - 20 micro-skills, 5 per category
   - the 30-question diagnostic, assessing every skill
   - 3 approved courses with core and remedial lessons and one lesson quiz each
   - final checks: 30 diagnostic questions, Q-matrix weights summing to 1, every skill assessed and remediated, every remedial lesson tagged
6. Remove `backend/db.sql`.
7. Write `docs/ERD.md` and record the decisions in `docs/ROADMAP.md`.
8. Run typecheck, lint and tests.

### Verification

- `contract emit` succeeds.
- The migration plan starts from an empty database and contains every table, CHECK, partial unique index and the GIN index.
- `db migrate` and `db verify` pass, and the seed passes its own checks.
- Constraint spot checks: these inserts must fail with the expected constraint:
  - a second diagnostic quiz
  - a second open attempt on the same quiz
  - a rejected course without feedback
  - a target band of 6.3
- `GET /api/v1/users` returns the seeded users without `hashedPass`.
- Gate: the owner reviews `docs/ERD.md` and the migration, and the schema is frozen.

### Outcome

Done 2026-10-24. Commit `829a1b2` on `feat/phase-1-data-model`.

**Verified on a throwaway local Postgres first:**
- The migration applied all 78 operations, and `db verify` passed.
- The seed created 20 skills, 42 questions (30 in the diagnostic) and 21 lessons (12 remedial), passed its checks, and refused a second run.
- 10 invalid inserts each failed with the expected constraint, and the valid cases passed.
- The users API returned ISO timestamps and no password hashes.

**Then on Supabase:** the owner dropped the empty Phase 0 table and ran migrate, verify and seed, all successfully. `GET /api/v1/users` returned the 3 seeded users. The owner reviewed the ERD, so the Gate was ticked and the schema frozen.

Deviations from the plan:
- **11 automatic foreign-key indexes turned off** (`index: false`). Prisma adds an index on every foreign key, but these were already covered by a primary key or a composite index that starts with the same column.
- **`temporal-polyfill@1.0.6` added as a pinned dev dependency, for its types only** (`tsconfig.json` `types`). Prisma's types refer to a global `Temporal` that TypeScript doesn't declare, so Temporal fields were silently typed as `any`. No polyfill code runs, because Node 26 has Temporal built in.
- **Prettier no longer touches `migrations/`.** Migration packages are content-hashed, so `npm run format` would have broken `db:migrate`.
- **Timestamps are filled by the ORM** (`temporal.createdAt()` / `temporal.updatedAt()`), not by database defaults, so raw SQL inserts must supply them. Documented in `docs/ERD.md`.
- **The seed was rewritten for readability** after the owner added the "Project context" rules to `CLAUDE.md`: plain string types, ordinary `if` checks and loops, and no advanced type tricks. It produces the same data.
- **The ERD diagram moved from crow's-foot notation to Chen notation** at the owner's request. It is now one combined diagram with 10 entities, 24 relationships and every column as an oval, checked against the schema.
- **Owner-run helper.** Dropping the Phase 0 `users` table used a guarded scratch script: it only drops the table if it is empty and the database has no Prisma marker.
