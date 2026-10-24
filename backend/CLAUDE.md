# Backend conventions

## Layout

```
src/
  server.ts            # listen only
  app.ts               # Express app: middleware, /api-docs, routes, 404 + error handler (exported for tests)
  routes/<name>.ts     # router -> validators -> controller
  controllers/<name>.ts # controllers/admin.ts: user list, role/deactivation (409 on yourself), stats
  middlewares/auth.ts  # authenticate (JWT -> req.user, reloaded from the DB) and authorize(...roles)
  services/courses.ts  # course access rules: visibility (404), owner (403), editable status (409), status transitions
  services/course-views.ts # builds the contract's Course / Lesson / LessonDetail / Passage / Enrollment shapes
  services/storage.ts  # Supabase Storage: signed upload URLs, signed read URLs (the only file that calls Supabase)
  services/skills.ts   # assertSkillsExist (400 for an unknown skill), shared by lessons and questions
  services/questions.ts # question rules: options/answerKey shape per type, Q-matrix weights sum to 1, owner (403), locked (409)
  services/quizzes.ts  # quiz rules: visibility (404), author or learner view, owner (403), locked (409), usable questions
  services/quiz-views.ts # builds Question / QuestionForLearner / Quiz / QuizForLearner / QuizSummary (passages via buildPassages)
  services/grading.ts  # answer shape per question type (400) and isAnswerCorrect (pure, no database)
  services/attempts.ts # attempt rules: own attempt (404/403), start or resume, submit (grade + log responses in one transaction)
  services/attempt-views.ts # builds Attempt / AttemptResult / AttemptSummary
  services/stats.ts    # getUsageStats: the AdminStats numbers, counted by Postgres (groupBy / aggregate)
  services/            # more business logic later: bkt.ts, recommender.ts (Phase 3)
  utils/validator.ts   # validateBody / validateParams / validateQuery + Joi schemas
  utils/db-types.ts    # varchar<N>() brand helper for Prisma VARCHAR columns
  utils/http-error.ts  # httpError(status, message) + the HttpError type
  utils/db-errors.ts   # isUniqueViolation(err): Postgres SQLSTATE 23505
  utils/jwt.ts         # signToken / verifyToken (HS256, sub = userId, 1 day)
  utils/public-user.ts # toPublicUser + PublicUser: the contract's User, never hashedPass
  types/express.d.ts   # req.value, req.user
  test/                # test-only helpers: global-setup.ts (migrate), setup.ts, db.ts (resetDb, createTestUser, authHeader),
                       # fake-storage.ts (stands in for services/storage.ts)
  docs/openapi.yaml    # Swagger contract
  prisma/              # schema.prisma (source), schema.d.ts + schema.json (generated), db.ts
                       # seed.ts + seed-data.ts (npm run seed)
migrations/            # Prisma 8 migration packages (npm run migration:plan / db:migrate), next to src/
```

## Patterns to follow

- **Request flow:** in `routes/<name>.ts`, chain `validateParams(schemas.idSchema, "courseId")`, `validateQuery(...)` and `validateBody(schemas.xSchema)`, then the controller. Controllers read **validated** input from `req.value.body` / `req.value.params` / `req.value.query`, never from `req.body` or `req.query`. Use `routes/me.ts` (small) and `routes/courses.ts` (roles per route) as references.
- **Auth:** protect a route with `authenticate`, then `authorize("instructor", "admin")` when only some roles may call it (a router can `router.use(authenticate)` once). Read the caller from `req.user` (a `PublicUser`, freshly loaded from the DB), never from the token or the body. Ownership checks ("I own") go in the controller and return 403.
- **Answers stay server-side:** build quizzes with `buildQuiz(quiz, view)` from `services/quiz-views.ts`. Pick `view` with `findQuizForViewer` (`services/quizzes.ts`), never from the caller's role alone. The learner view has no `answerKey`, `explanation` or skill weights.
- **Course content checks, in this order:** `findVisibleCourse` / `findVisibleLesson` (404, also for courses the caller may not see), then `assertCourseOwner` (403), then `assertEditable` (409), all from `services/courses.ts`. Change a course's status only through `changeCourseStatus`, which re-checks the status inside the `UPDATE` (with `updateAndCount`, see the Prisma note below).
- **Lists of related rows:** the Prisma contract only has to-one relations, so load children for a whole list with one `.where((x) => x.parentId.in(ids))` query and group them in a `Map` (see `services/course-views.ts`). Guard against empty id lists first.
- Add new Joi schemas to `schemas` in `utils/validator.ts`.
- **Responses:** `res.status(code).json({ <resource>, message })`. Never return `hashedPass` or other secrets (use `toPublicUser` from `utils/public-user.ts`).
- **Errors:** Express 5 forwards rejected promises to the error handler, so async controllers need no try/catch. Throw `httpError(404, "Course not found")` from `utils/http-error.ts` for non-500 codes; the handler in `app.ts` sends `{ error: { message } }`. Validation errors (400) come from `validator.ts` with `details`.
- **Prisma 8** (contract API, not classic Prisma Client):
  - Model access: `db.orm.public.<Model>` from `src/prisma/db.ts`, with `.all()`, `.first({...})`, `.where({...}).update(...)`, `.create(...)`, and `db.transaction(async (tx) => ...)`.
  - **`.where(...).update()` is not atomic.** It SELECTs the first matching row, then UPDATEs it by primary key alone, so the filter isn't checked again. For a conditional update that must hold under concurrency ("close the attempt only if it is still open"), use `.where(...).updateAndCount(...)`. It sends one `UPDATE ... WHERE <filter>`, and 0 means the condition no longer held. See `submitAttempt` in `services/attempts.ts` and `changeCourseStatus` in `services/courses.ts`.
  - **Counting:** use `.aggregate((agg) => ({ count: agg.count() }))`, or `.groupBy("field").aggregate(...)` for one row per value, instead of loading rows and taking `.length`. Groups with no rows don't come back, so start every count at 0 (see `services/stats.ts`).
  - Raw SQL (`db.raw.sql`) only takes plain values such as numbers as `${...}` parameters, not `Temporal` values. Do date arithmetic in SQL (`started_at - interval '8 days'`) instead.
  - VARCHAR columns are branded types. Wrap strings with `varchar<255>(value)` from `utils/db-types.ts`, and only after Joi has checked the length.
  - After editing `schema.prisma`, run `npm run contract:emit`. Never hand-edit `schema.d.ts` or `schema.json`.
- **TypeScript:**
  - Node runs `.ts` directly (type stripping), so relative imports use the `.ts` extension.
  - No `enum`, no `namespace` with values, no parameter properties (`erasableSyntaxOnly`). Use string-literal unions.
  - Use `import type` for type-only imports.
- **Tests:** `*.test.ts` next to the code (vitest + supertest), importing `app` from `app.ts`.
  - They run against a real Postgres database, `TEST_DATABASE_URL` in `.env` (separate from `DATABASE_URL`; `vitest.config.ts` refuses to start if they match). `src/test/global-setup.ts` migrates it once per run, and test files run one at a time.
  - Start each test from a blank database: `beforeEach(resetDb)`. Build data with `createTestUser({ role })` and send `authHeader(user.userId)` as the `Authorization` header. For content use `createTestSkill`, `createTestCourse({ instructorId, status })`, `createTestLesson`, `enrollTestUser`, `createTestQuestion({ createdById, passageId?, skillIds?, questionType?, options?, answerKey? })`, `createTestQuiz({ createdById, questionIds, kind?, lessonId? })` and `createAnsweredQuiz` (learner history that blocks deletes).
  - When a table is added to `schema.prisma`, add it to the `TRUNCATE` list in `src/test/db.ts`.
  - Tests never call Supabase. `vitest.config.ts` blanks the `SUPABASE_*` variables. A route test whose responses contain passages or upload tickets adds `vi.mock("../services/storage.ts", () => import("../test/fake-storage.ts"))`. The fake signs every path except `missing/...`.
- **Media:** store only the Storage object path (`mediaPath`), never a URL. Build passages with `buildPassages` / `buildPassage` from `services/course-views.ts`, so every `mediaUrl` is signed fresh, in one Storage request per response.
