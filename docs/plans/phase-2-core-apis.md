# Phase 2: Core backend APIs

Approved plans for the Phase 2 tasks in `docs/ROADMAP.md`, one section per task, each with an **Outcome** note.

## Task: OpenAPI contract written first for each module

Approved: 2026-10-24 (effort `xhigh`).

### Context

Phase 1 is committed (`829a1b2`). The roadmap starts Phase 2 contract-first: write the OpenAPI contract for every module, get it approved at the **Gate**, and only then build the routes. The frontend team mocks the API from this file with Prism, so the contract has to be complete and have examples.

This task only writes the contract. It changes no route code. Implementation (auth, courses, uploads, quizzes, attempts, admin) comes after the Gate, one roadmap item at a time.

Decision taken with the user: **approved courses are locked.** To change one, the instructor withdraws it to draft, edits, and resubmits it for review.

Phase 3 endpoints (`/recommendations`, `/me/mastery`) go into the contract now so the frontend can mock the whole learner flow. Their behaviour is built in Phase 3, and the contract marks them as such.

### Conventions

- **Base path** `/api/v1`. Auth uses the header `Authorization: Bearer <JWT>` (the `bearerAuth` scheme already in the file). Every endpoint needs a token except `register`, `login` and `GET /`.
- **Success:** `{ <resource>, message }`. This is the existing pattern (`controllers/user.ts`). A list uses a plural key: `{ courses: [...], message }`.
- **Errors:** one shape everywhere: `{ error: { message, details? } }`.
  - Today `validator.ts` returns `{ error: [strings] }` and a missing user returns `{ user: null, message }`. Both move to the single shape when the implementation starts.
  - `details` holds the Joi messages for a 400.
- **Status codes:**
  - 400: invalid input (Joi)
  - 401: no token, or a bad or expired token
  - 403: wrong role, or not the owner
  - 404: not found (including resources the caller isn't allowed to see)
  - 409: conflict with the current state (duplicate email, wrong course status, diagnostic already taken)
- **Paths:**
  - Create and list a child under its parent (`POST /courses/{courseId}/lessons`); read, update and delete it by its own id (`PATCH /lessons/{lessonId}`).
  - Path parameters are camelCase (`{courseId}`), and every id is an integer ≥ 1.
  - Actions on a resource are `POST` sub-paths (`/courses/{courseId}/submit`), which keeps the state machine easy to read.
- **No pagination.** The data is small (3 courses, about 40 questions), and the spec doesn't ask for it. It can be added later without breaking clients.
- **Two views of a question.** Learners get `QuestionForLearner`, which has no `answerKey` and no `explanation` until they submit. Authors get `Question`, which has both.
- **Locked content** (added at the review before the Gate). Content inside a course (lessons, passages, quizzes, and the questions those quizzes use) changes only while the course is `draft` or `rejected`. Questions learners have answered and quizzes they have attempted can't be edited or deleted at all, so past grades and the response logs BKT learns from stay consistent. Both rules return 409.

### Endpoints

R = which roles may call it. L = learner, I = instructor, A = admin. "own" means the caller must own the resource; admins may always act.

#### Auth and profile
| Method + path | R | Notes |
| --- | --- | --- |
| `POST /auth/register` | public | Body `email, fullName, password`. Always creates a **learner**. 201 with `{ user, token }`. 409 if the email exists. |
| `POST /auth/login` | public | Returns `{ user, token }`. The same 401 "Invalid email or password" for an unknown email or a wrong password, so attackers can't tell which emails exist. 403 if deactivated. |
| `GET /me` | L I A | The current user, including `role` and `targetBand`. |
| `PATCH /me` | L I A | `fullName` and/or `targetBand` (0–9 in 0.5 steps). Onboarding sets `targetBand` here. |

JWT details:
- The token is signed HS256 with `JWT_SECRET`, holds `sub = userId`, and expires after 1 day. There are no refresh tokens. Log-out means the client discards the token.
- The `authenticate` middleware **reloads the user from the database** on every request, using a primary-key lookup. That way a role change or a deactivation takes effect immediately, instead of when the token expires.

Changes from the MiniMemoryZone `auth.js` port:
- The token goes in the response **body**, not in a response header.
- A duplicate email returns 409 instead of 401.
- A wrong password and an unknown email give the same answer.

#### Users (admin)
These replace today's open `/users` CRUD, which lets anyone list every email and create users without signing in.
| Method + path | R | Notes |
| --- | --- | --- |
| `GET /admin/users` | A | Optional filters `?role=` and `?isActive=`. |
| `PATCH /admin/users/{userId}` | A | `role` and/or `isActive`. Admins can't demote or deactivate themselves (409), so the platform always keeps at least one admin. |

The old `/users` paths stay in the file marked `deprecated: true` until the auth implementation removes them, so the contract always matches the running code.

#### Skills
| `GET /skills` | L I A | The taxonomy, filterable by `?category=`. It is read-only, because `skill_code` is the immutable key into `bkt_params.json` and the spec has no skill editing. |
| --- | --- | --- |

#### Courses (review flow)
| Method + path | R | Notes |
| --- | --- | --- |
| `GET /courses` | L I A | The approved catalog. Optional `?level=`. Each course has `isEnrolled` for the caller. |
| `GET /instructor/courses` | I | My courses in every status, including `reviewFeedback`. |
| `GET /admin/courses` | A | All courses, filtered by `?status=`. `?status=pending_review` is the review queue. |
| `POST /courses` | I | Creates a **draft**. Body `title, description, targetLevel`. |
| `GET /courses/{courseId}` | L I A | Approved courses: everyone. Other statuses: the owner and admins (404 for anyone else). |
| `PATCH /courses/{courseId}` | I own | Only while `draft` or `rejected`; otherwise 409. |
| `DELETE /courses/{courseId}` | I own | Only a `draft` that has never been approved; otherwise 409. |
| `POST /courses/{courseId}/submit` | I own | `draft` or `rejected` → `pending_review`. Needs at least one core lesson (409 otherwise). |
| `POST /courses/{courseId}/withdraw` | I own | `pending_review` or `approved` → `draft`, so it can be edited. Enrolled learners keep their enrolment, but can't open lessons until the course is approved again. |
| `POST /courses/{courseId}/approve` | A | `pending_review` → `approved`. Optional `feedback`. |
| `POST /courses/{courseId}/reject` | A | `pending_review` → `rejected`. **`feedback` is required.** |
| `POST /courses/{courseId}/archive` | I own, A | Any status → `archived`. This is the way to retire a course that has learner history. |
| `POST /courses/{courseId}/enroll` | L | Approved courses only. Calling it twice is harmless (200 if already enrolled). |

#### Lessons and progress
| Method + path | R | Notes |
| --- | --- | --- |
| `GET /courses/{courseId}/lessons` | L I A | Core lessons in order, then remedial lessons. Learners also get `progress` and `locked`. |
| `POST /courses/{courseId}/lessons` | I own | `title, content, kind, orderIndex, skills: [{ skillId, weight }]`. Same editable-status rule as `PATCH /courses`. |
| `GET /lessons/{lessonId}` | L I A | The lesson, its passages and media (with signed `mediaUrl`), its quizzes and its skill tags. **Learners must be enrolled** in an approved course, and the lesson must not be `locked`. |
| `PATCH /lessons/{lessonId}` | I own | The same fields; `skills` replaces the whole tag list. |
| `DELETE /lessons/{lessonId}` | I own | Fails with 409 if the lesson has learner history. |
| `PUT /lessons/{lessonId}/progress` | L | Body `{ status: in_progress \| completed }`. Creates or updates the row, and sets `completedAt` when completed. |

`locked` is part of the contract now. Until Phase 3 decides the unlock rule, the implementation returns `false`, so nothing is locked.

#### Passages and media, and uploads
| Method + path | R | Notes |
| --- | --- | --- |
| `POST /uploads` | I A | Body `fileName, contentType`, which must be audio, video or image. Returns `{ uploadUrl, path }`: the client uploads the file straight to Supabase Storage with `uploadUrl`, then sends `path` as `mediaPath`. |
| `POST /passages` | I A | `lessonId?` (instructors must give their own lesson; only admins create lesson-less diagnostic passages), `type, title, content, mediaPath, orderIndex`. The same payload rule as the database: reading text needs `content`, audio and video need `mediaPath`. |
| `GET /passages/{passageId}` | I own, A | The author view. Learners see passages inside `GET /lessons/{id}` and in attempts. |
| `PATCH /passages/{passageId}`, `DELETE /passages/{passageId}` | I own, A | Same course-status rule as `POST`. `DELETE` also deletes the passage's questions, so it fails with 409 once learners have answered them. |

Responses never contain a Storage URL that lasts. `mediaUrl` is a signed URL that expires after 1 hour, generated on each read.

#### Questions (bank) and quizzes
| Method + path | R | Notes |
| --- | --- | --- |
| `GET /questions` | I A | Instructors see their own questions; admins see all. Filters `?skillId=`, `?passageId=`, `?type=`. |
| `POST /questions` | I A | `passageId?, questionType, questionText, options, answerKey, explanation, difficulty, skills: [{ skillId, weight }]`. **The `skills` weights must sum to 1** (400 otherwise). The `options` and `answerKey` shape depends on `questionType`, following the JSONB table in `docs/ERD.md`. |
| `GET /questions/{questionId}`, `PATCH`, `DELETE` | I own, A | `PATCH` replaces `skills` as a whole. `PATCH` and `DELETE` fail with 409 once the question has responses, or while a quiz in a course that isn't `draft` or `rejected` uses it. |
| `POST /quizzes` | I A | `kind (lesson \| practice \| diagnostic), lessonId?, title, description, timeLimitSeconds, questionIds` (in order). `diagnostic` is admin-only, and only one can exist. Instructors must attach their quizzes to their own lesson. |
| `GET /quizzes/{quizId}` | L I A | Authors get the full questions. Learners get `QuestionForLearner`, and the same access rule as the quiz's lesson. |
| `PATCH /quizzes/{quizId}`, `DELETE` | I own, A | `questionIds` replaces the whole list. `PATCH` and `DELETE` fail with 409 once the quiz has attempts, or if its course isn't `draft` or `rejected`. |
| `GET /diagnostic` | L | The diagnostic quiz, plus `completedAttemptId` if the learner has already taken it. |

#### Attempts (taking a quiz)
| Method + path | R | Notes |
| --- | --- | --- |
| `POST /quizzes/{quizId}/attempts` | L | Starts an attempt, or **resumes** the open one (200), and returns `{ attempt, quiz }` with the learner view of the questions. 409 if the learner already completed the diagnostic. |
| `POST /attempts/{attemptId}/submit` | L own | Body `{ responses: [{ questionId, answer, responseTimeSeconds }] }`. Array order is the `attemptOrder`. Each question must belong to the quiz, at most once; unanswered questions count as wrong. The server grades everything (the client never sends `isCorrect`), and the whole submit runs in one transaction. Returns the graded `AttemptResult`: score, per-question correctness, correct answers and explanations, `masteryChanges` and `recommendations`. 409 if already submitted. |
| `GET /attempts/{attemptId}` | L own, A | The same `AttemptResult`, for the post-quiz review screen. Before submitting, this returns the open attempt without answers. |
| `GET /me/attempts` | L | My attempt history, newest first. Optional `?quizId=`. |

In Phase 2, `masteryChanges` and `recommendations` are empty arrays. Phase 3 fills them, when the BKT update joins the same submit transaction.

#### Learner dashboard (Phase 3 data)
| Method + path | R | Notes |
| --- | --- | --- |
| `GET /me/enrollments` | L | My courses, each with `completedLessons`, `totalCoreLessons` and `progressPercent`. |
| `GET /me/mastery` | L | One entry per skill: `skillCode, name, category, masteryProb, observations`, for the radar chart. Empty until the diagnostic is done. |
| `GET /recommendations` | L | **Phase 3.** Up to 3 items. Each has `type` (lesson or quiz), the target, `skill`, `masteryProb`, `rank`, `score`, and a human-readable `rationale`, such as "Recommended because your mastery of 'Conditionals' is 0.48, below 0.65". Target latency: p95 under 300 ms. |
| `POST /recommendations/{recommendationId}/click` | L own | **Phase 3.** Records `clickedAt`, which Precision@3 and MRR need. |

There is no single `/dashboard` endpoint. The frontend combines `/me`, `/me/enrollments`, `/me/mastery` and `/recommendations`, which keeps each endpoint small.

#### Admin stats
| `GET /admin/stats` | A | Users by role, active and inactive users, courses by status, total enrollments, completed attempts (all time and last 7 days), and learners active in the last 7 days. This covers the spec's "monitor platform usage statistics". |
| --- | --- | --- |

**Total:** 44 operations (plus `GET /`). Two of them are Phase 3.

### Schemas (`components/schemas`)

**Users and auth:** `User` (userId, email, fullName, role, targetBand, isActive, createdAt), `AuthResult`, `RegisterInput`, `LoginInput`, `ProfileUpdate`, `AdminUserUpdate`.

**Courses and lessons:** `Skill`, `Course`, `CourseInput`, `RejectInput`, `Lesson`, `LessonDetail`, `LessonInput`, `SkillWeight`, `LessonProgress`, `Enrollment`.

**Content:** `Passage`, `PassageInput`, `UploadRequest`, `UploadTicket`.

**Questions and quizzes:**
- `Question` and `QuestionForLearner`.
- `QuestionInput`, whose `options` and `answerKey` are `oneOf` by `questionType`.
- `Quiz` and `QuizInput`.

**Attempts and dashboard:** `Attempt`, `SubmitInput`, `AttemptResult`, `ResponseResult`, `MasteryChange`, `Mastery`, `Recommendation`, `AdminStats`.

**Shared:** the `Error` shape, plus reusable `responses`: `ValidationError`, `Unauthorized`, `Forbidden`, `NotFound` and `Conflict`.

Enum values match `schema.prisma` exactly. Timestamps are `string, format: date-time` (ISO, which is how `Temporal.Instant` serializes). Key schemas carry `example`s drawn from the seed data, such as the Riverside Sports Centre questions and the "Band 7+ Mastery" course, so Prism mocks look realistic.

### Files

- `backend/src/docs/openapi.yaml`: the contract. It stays one file, so `app.ts` keeps serving it as-is. Sections follow the tags in the order above, with a comment header per section so a reader can find their way. Bump `info.version` to `0.2.0`.
- `docs/ROADMAP.md`: tick "OpenAPI contract written first for each module" once it lints clean. Add Decisions rows for "Approved courses locked; withdraw to edit" and "JWT in body, 1 day, user reloaded per request".
- No route, controller or test changes in this step.

### Verification

- `npx @redocly/cli@1.34.5 lint src/docs/openapi.yaml`: no errors (run once with `npx`; not added as a dependency).
- Prism smoke test: `npx @stoplight/prism-cli@5.14.2 mock src/docs/openapi.yaml` in the background, then `curl` the mock for `GET /courses`, `POST /auth/login` and `POST /attempts/1/submit`. Each should return its example.
- `npm run dev`: Swagger UI at `/api-docs` renders all the tags. `npm run typecheck && npm run lint && npm test` still pass, since nothing else changes.
- **Gate:** you read the contract in Swagger UI (it's easier to read than the YAML) and approve it. After approval, implementation starts with Auth at `high` effort.

### Outcome

Done 2026-10-24.
- **Contract:** `backend/src/docs/openapi.yaml` v0.2.0 has 50 operations, the 5 deprecated `/users` operations and 69 schemas, with examples taken from the seed data.
- **Lint:** Redocly lint is valid. Two warnings remain: there is no `license` field (choosing a license is the owner's call), and deprecated `GET /users` has no 4xx response (true of today's code).
- **Prism:** the mock returns the examples, 401 without a token, and the new 400 error shape.
- **Checks:** typecheck, lint and tests pass, and Swagger UI serves the new contract.

Deviations from the plan:
- **Operation count.** The plan said "44 operations". That was a counting error; the contract has the endpoints exactly as listed, which come to 50.
- **Question shapes.** `QuestionInput` describes `options` and `answerKey` with simple `oneOf` shapes, plus a table of which shape goes with which `questionType`. It doesn't use a per-type `oneOf`. This keeps the YAML readable, and Joi checks the exact pairing at runtime.
- **Global auth.** Security is declared once at the top (`bearerAuth`), and the public endpoints opt out with `security: []`.
- **Mock base URL.** Prism serves the mock at the root (`http://localhost:4010/courses`, no `/api/v1` prefix). The frontend's mock base URL must account for this.

Review before the Gate (2026-10-24):
- **Locked content (fixed).** `PATCH /questions/{questionId}` checked neither the course status nor learner answers, and `PATCH`/`DELETE /quizzes/{quizId}` didn't check the course status. So an instructor could change an approved course's quizzes without a new review. Also, editing an answered question's `answerKey` or skill weights would make old results and the BKT response logs disagree. The rule is now stated once in `info.description` and applied to question, quiz and passage edits and deletes (see **Locked content** under Conventions). Redocly lint is still valid, with the same two warnings.

Left open:
- **Remedial lessons outside enrolled courses** (the owner deferred this to the Phase 3 Gate). `GET /lessons/{lessonId}` requires learners to be enrolled in the lesson's course. A learner who has just finished the diagnostic is usually enrolled nowhere, so recommendations would either come back empty or point at lessons that return 403. The contract's own example recommends lesson 20 of "Band 7+ Mastery" right after the diagnostic. Settle it together with the ranking formula and the unlock rule.
- **Practice quizzes without a lesson.** `QuizInput` doesn't say whether a `practice` quiz needs `lessonId`. Without one, the learner access rule ("same as the quiz's lesson") has nothing to check. The owner chose to settle this in the "Questions and quizzes" task. **Settled** in that task: the API requires `lessonId` for practice quizzes.
- **Skipped questions.** `question_responses.user_answer` and `attempt_order` are `NOT NULL`, so a skipped question gets no row. The graded result still lists it (`userAnswer: null`, `isCorrect: false`) by reading the quiz's question list. Whether a skip counts as BKT evidence is a Phase 3 decision.

## Task: Gate: API contract approved

Approved: 2026-10-24.

### Plan

Review the contract against `specs.md` and `docs/ERD.md` before the owner signs off. Fix anything that blocks approval, and write down the rest. After approval, update the ERD rules that were waiting for the contract.

### Outcome

Done 2026-10-24. The owner approved `backend/src/docs/openapi.yaml` v0.2.0 (commit `ffde45d`).
- The review found one blocking gap, locked content. It was fixed before approval (see "Review before the Gate" in the previous task's Outcome).
- `docs/ERD.md`: the course status transitions and content edit rights are no longer marked "proposed" and now match the contract. Locked content is listed with the other rules the app enforces.
- Open points: remedial-lesson access goes to the Phase 3 Gate. Practice quizzes without a lesson, and skipped questions, are settled during implementation (see "Left open" in the previous task's Outcome).

## Task: Auth: register, login, JWT, `authenticate`, `authorize(...roles)`

Approved: 2026-10-24 (effort `high`).

### Context

Auth is the first implementation task after the contract Gate, because every other Phase 2 route depends on `authenticate` and `authorize`. Until now the only API was the Phase 0 `/users` CRUD, which was open to anyone. The contract marked it deprecated, to be removed when Auth lands.

Decisions taken with the owner for this task:
- **Tests use a separate test database** (`TEST_DATABASE_URL`), migrated once per run and wiped between tests. Every later Phase 2 suite follows this pattern.
- **`GET /me` and `PATCH /me` ship in this task** (contract section "Auth and profile"). `/admin/users` stays in the "Admin" task.

The contract already fixes the rest: HS256 JWT with `sub = userId`, 1 day, in the response body, no refresh token; the user is reloaded from the database on every request; the same 401 for an unknown email and a wrong password; 409 on a duplicate email; register always creates a learner; logging in to a deactivated account gives 403.

No new dependencies (`bcrypt` and `jsonwebtoken` were already installed) and no schema change.

### Plan

1. **Helpers:** `utils/http-error.ts` (`httpError(status, message)`, the `HttpError` type moved out of `app.ts`), `utils/jwt.ts` (`signToken` / `verifyToken`, algorithm pinned to HS256, clear error if `JWT_SECRET` is missing), `utils/public-user.ts` (`toPublicUser`, exactly the contract's `User` fields).
2. **Validation:** both validators return the contract's 400 shape `{ error: { message: "Validation failed", details } }` with `abortEarly: false`. New `registerSchema`, `loginSchema` and `profileUpdateSchema`. Emails are trimmed and lowercased. Passwords are limited to 72 bytes (bcrypt's limit), counted with `max(72, "utf8")`.
3. **Middlewares** (`middlewares/auth.ts`): `authenticate` reads the Bearer token, reloads the user by primary key, and gives 401 for a missing, bad or expired token, a deleted user, or a deactivated user. `authorize(...roles)` gives 403 for a role that isn't listed, and 401 if `authenticate` didn't run. `req.user` becomes a `PublicUser`.
4. **Routes:** `POST /auth/register`, `POST /auth/login` (ported from MiniMemoryZone `auth.js`, with the contract's changes), `GET /me` and `PATCH /me`. Remove `routes/user.ts` and `controllers/user.ts`.
5. **Contract:** delete the deprecated `/users` paths, their tag and the `LegacyUser` / `LegacyValidationError` components. Note on `/me` that a deactivated account's token gets 401. Version `0.2.1`.
6. **Test database:** `vitest.config.ts` (requires `TEST_DATABASE_URL`, refuses to run if it equals `DATABASE_URL`, runs files one at a time), `src/test/global-setup.ts` (`prisma db migrate`), `src/test/setup.ts` (closes the pool), `src/test/db.ts` (`resetDb`, `createTestUser`, `authHeader`).
7. **Tests:** `routes/auth.integration.test.ts`, `routes/me.integration.test.ts`, `middlewares/auth.integration.test.ts`, and an updated `app.integration.test.ts`.
8. **Docs:** `backend/CLAUDE.md` conventions, the root `CLAUDE.md` test command, two new rules in `docs/ERD.md`, `.env.example`.

### Outcome

Done 2026-10-24. Typecheck, lint and 38 tests pass (4 files, against a real Postgres test database). Redocly lint is valid, with only the known `license` warning; the deprecated-endpoint warning is gone. Manual run with `curl` against the test database: register → `GET /me` → `PATCH /me { targetBand: 7 }` → login (wrong password 401, right password 200); `GET /api/v1/users` now returns 404; Swagger UI still renders.

To read it: `src/middlewares/auth.ts`, then `src/controllers/auth.ts`, `src/controllers/me.ts`, `src/utils/jwt.ts`, and `src/test/db.ts` for the test pattern.

Deviations from the plan, and details settled while implementing:
- **Duplicate email race.** Prisma 8 throws a `SqlQueryError` with `sqlState: "23505"` when the `UNIQUE` index rejects an insert (checked with a throwaway probe). `register` maps it to the same 409, and a test sends two sign-ups at once and expects one 201 and one 409.
- **Login timing.** For an unknown email, login still runs one `bcrypt.compare` against a fixed dummy hash, so response time doesn't reveal which emails have accounts. This applies the contract's "same answer" rule to timing as well.
- **Deactivated token → 401** with the message "This account is deactivated" (login gives 403). `/me` only lists 401 in the contract, and the token has stopped working, so 401 fits. Recorded in the `/me` description.
- **Role-change test** is in `middlewares/auth.integration.test.ts` (a learner promoted to admin passes `authorize("admin")` on the very next request with the old token), not in `me.integration.test.ts`. That's where the behaviour lives.
- **Migration output** from the test global setup is captured and printed only on failure. vitest 5 crashes while printing a global-setup error (`code.charCodeAt is not a function`), so the setup also logs a plain message.

Left open:
- None for this task. `authorize` has no production caller yet; the Courses task is the first to use it.

## Task: Courses, lessons and media

Approved: 2026-10-24 (effort `high`).

### Context

Auth is done (`b1b891c`), so `authenticate` and `authorize` exist, but nothing called `authorize` yet. This task builds the first content APIs from the approved contract (v0.2.1):
- instructor course CRUD and the review state machine;
- lessons with skill tags;
- passages;
- learner enrolment and lesson progress.

Decisions taken with the owner for this task:
- **Passages ship now.** `mediaUrl` is `null` until the Uploads task adds Supabase signing (the contract allows `null`).
- **Extra routes in scope:** `GET /admin/courses` (review queue), `GET /skills`, `PUT /lessons/{id}/progress`, `GET /me/enrollments`. No other roadmap task names them, and the flow needs them.
- **Course delete rule:** only a `draft` that no learner has ever enrolled in (409 otherwise). The schema can't tell "was once approved" (`reviewedAt` is also set by a rejection), and enrolments are the learner history the rule protects. The contract wording changes to match.

No schema change and no new dependency.

### Plan

1. **Roles** follow each endpoint's contract description and `docs/ERD.md`:
   - only the course's instructor edits, submits, withdraws or deletes a course and its lessons;
   - admins review (approve/reject), archive and edit passages.

   The contract's "admins may always act on it" sentence is narrowed to match.
2. **Shared rules** in `services/courses.ts`:
   - `findVisibleCourse` / `findVisibleLesson` give 404 for missing *or* invisible courses;
   - `assertCourseOwner` gives 403;
   - `assertEditable` gives 409;
   - `assertCanStudy` gives 403 to learners who aren't enrolled;
   - `changeCourseStatus` checks the status on the loaded row (for a clear 409), then again in the `UPDATE ... WHERE status IN (...)`, so two conflicting transitions can't both win.
3. **Endpoints (19):**
   - Courses: catalog, my courses, all courses (admin), CRUD, submit, withdraw, approve, reject, archive, enrol.
   - Lessons: list, create, get (`LessonDetail` with passages and quiz summaries), update (a skill-list replacement runs in a transaction), delete (409 with learner history), progress.
   - Passages: CRUD with the payload rule checked before the database CHECK.
   - `GET /skills` and `GET /me/enrollments`.
4. **Response shapes** are built in batches (one `IN (...)` query per related table), because the Prisma contract only has to-one relations.
5. `validateQuery` for `?level=`, `?status=`, `?category=`. `isUniqueViolation` moves to `utils/db-errors.ts` so that enrolment can reuse it.
6. **Docs and tests:**
   - Contract v0.2.2 (delete rule, `mediaUrl` note, admin roles sentence). `docs/ERD.md` and `backend/CLAUDE.md` updated.
   - Supertest suites for courses, lessons, passages, skills and `/me/enrollments`, with new helpers in `src/test/db.ts`.

### Outcome

Done 2026-10-24.
- **Checks:** typecheck and lint are clean, and 81 tests pass across 8 files (43 new). Redocly lint is valid, with only the known `license` warning.
- **Manual run** against the test database, scripted with `fetch`:
  - create → submit without a lesson (409) → add lesson and passage → submit → admin queue → reject → edit → resubmit → approve → edit while approved (409);
  - learner: catalog → open lesson while not enrolled (403) → enrol (201, then 200) → open lesson → complete it → `/me/enrollments` shows 100%.

  Swagger UI renders.

To read it: `src/services/courses.ts` (the rules), then `src/controllers/courses.ts`, `src/controllers/lessons.ts`, `src/controllers/passages.ts`, `src/services/course-views.ts` (response shapes), and `src/routes/courses.ts` (which role may call what).

Deviations from the plan, and details settled while implementing:
- **Two service files instead of `utils/views.ts`.** The response builders query the database to load instructors, counts, tags and progress, so they live in `services/course-views.ts` next to `services/courses.ts`. They aren't pure utils.
- **Passage payload rule** (reading text needs `content`, audio/video need `mediaPath`) is one controller helper used by `POST` and `PATCH`, instead of a Joi `when`. `PATCH` has to check the merged row anyway. Its 400 has a `message` but no `details`.
- **Empty strings:** passage `content` and `mediaPath` must be `null`, not `""`, so an empty string can't satisfy the payload rule. Course descriptions, lesson content and passage titles accept `""`.
- **`validateBody` validates `{}` when there is no body.** Express 5 leaves `req.body` undefined for a bodiless `POST /approve`. Required fields still fail.
- **Unknown query parameters are a 400.** This matches how bodies are validated.
- **Visibility comes before ownership.** Another instructor gets 404 on someone else's draft and 403 on their approved course. An enrolled learner gets 404 for a lesson once its course is withdrawn, because the course isn't visible to learners until it is approved again.
- **Review queue order:** with `?status=`, the oldest submission comes first (noted in the contract).
- **Enrolment completion:** `enrollments.completed_at` is set when every core lesson is completed and cleared if one goes back to `in_progress` (recorded in `docs/ERD.md`).
- **Concurrency tests:**
  - approve and reject sent at the same moment give exactly one 200 and one 409;
  - two simultaneous enrol calls give one 201 and one 200 (the unique-violation path reads the row back).

Left open:
- **First progress write race.** Two simultaneous `PUT /lessons/{id}/progress` calls for a lesson with no progress row yet can make the second one fail with a 500 (primary key). The client sends these one at a time, so it was left as is. The enrolment fix (catch `isUniqueViolation` and update) applies if it ever matters.
- **Admin-created passages** in an instructor's lesson can only be edited by their creator or an admin, following the ERD's creator rule. The course owner can't edit them.
- **`mediaUrl`** is `null` until the Uploads task.
- **Remedial lessons outside enrolled courses** are still deferred to the Phase 3 Gate.

## Task: Uploads via Supabase Storage signed URLs

Approved: 2026-10-24 (effort `high`).

### Context

The courses task shipped passages with `mediaUrl: null` because nothing could sign Storage paths yet. This task builds `POST /uploads` and signs `mediaUrl` on every read, following the approved contract (`UploadRequest`, `UploadTicket`, `Passage.mediaUrl`). The database keeps storing only object paths (`docs/ERD.md`).

Decided with the owner for this task:
- **Dependency:** `@supabase/supabase-js` (official client), `^2.117.3`, the newest release at least two weeks old.
- **No `mediaPath` ownership check** on passages. The contract doesn't ask for one; it's left for the Phase 7 security review.
- **Signing failures on read** (not configured, object missing, Supabase down) give `mediaUrl: null` and a logged warning. The request still succeeds.

No schema change.

### Plan

1. `services/storage.ts`, the only file that calls Supabase:
   - It reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_STORAGE_BUCKET` on every call and creates a server-side client once.
   - `buildObjectPath(userId, fileName)` returns `<userId>/<uuid>-<safe name>`.
   - `createUploadTicket` wraps `createSignedUploadUrl` (Supabase fixes its lifetime at 2 hours).
   - `signMediaUrls(paths)` makes one `createSignedUrls(paths, 3600)` call. It leaves out paths that can't be signed.
2. `POST /uploads` (`routes/uploads.ts`, `controllers/uploads.ts`) for instructors and admins. `uploadRequestSchema` holds the contract's 7 MIME types.
3. `services/course-views.ts`: `buildPassages` / `buildPassage` sign every passage's `mediaPath` in one batch. `GET /lessons/{id}` and the passage handlers use them.
4. Tests never reach Supabase:
   - `vitest.config.ts` blanks the `SUPABASE_*` variables.
   - `services/storage.unit.test.ts` mocks `@supabase/supabase-js`.
   - Route tests mock `services/storage.ts` with `src/test/fake-storage.ts`.
5. Docs: contract v0.2.3 (`mediaUrl` note, private bucket), `.env.example`, `docs/ERD.md`, `backend/CLAUDE.md`.

### Outcome

Done 2026-10-24.
- **Checks:** typecheck and lint are clean, and 95 tests pass across 10 files (14 new). Redocly lint is valid, with only the known `license` warning. Swagger UI renders and lists `/uploads`.
- **Smoke test** of the real client, without credentials:
  - not configured: an empty map and one warning;
  - unreachable host: the error is returned and handled, so signing gives an empty map and an upload throws a clear error.
- **Manual run against a real Supabase project** (private `media` bucket, `sb_secret_` key), on the test database, all checks pass:
  - `POST /uploads` → `PUT` a WAV to `uploadUrl` (200) → create an audio passage with `path`;
  - `GET /passages/{id}` and `GET /lessons/{id}` return a signed `mediaUrl` that downloads the same bytes (`audio/wav`);
  - a passage pointing at a missing file gets `mediaUrl: null`;
  - the public URL of the object is refused (400), so the bucket is private.

  `npm test` still passes with the real keys in `.env`, because the test config blanks them.

To read it: `src/services/storage.ts`, then `buildPassages` in `src/services/course-views.ts`, `src/controllers/uploads.ts`, and `src/test/fake-storage.ts` (how the route tests avoid Supabase).

Details settled while implementing:
- **Version:** `npm install` with `^2.117.3` resolves to 2.118.0, so the lockfile pins 2.117.3 explicitly (`package.json` keeps `^2.117.3`).
- **Supabase errors:** the client returns network failures as `error` rather than throwing. `signMediaUrls` handles both.
- **`contentType`** is validated but not used when signing, because Supabase signed upload URLs can't restrict the type. The client sends it again as the `PUT`'s `Content-Type`.
- **`SUPABASE_URL` is the project origin only.** The first manual run failed with "Invalid path specified in request URL" because the value copied from the dashboard ended in `/rest/v1/`. `.env.example` now warns about it.
- **Safe names** turn every run of other characters into one `-`, so `Part 1 (Booking).MP3` becomes `part-1-booking-.mp3`.

Left open:
- `mediaPath` isn't checked against the uploader (Phase 7 security review).
- Uploaded files that no passage uses, and the files of deleted passages, stay in the bucket. Nothing cleans them up.
- File size and MIME limits are set on the bucket in the Supabase dashboard, not in code.

## Task: Questions and quizzes with skill tagging

Approved: 2026-10-24 (effort `high`).

Effort: `high` (the effort table's level for multi-file work with rules that are easy to get subtly wrong).
Branch: `feat/phase-2-questions-quizzes`, created from the current HEAD (`bc51583`, uploads).

### Context

This is the next unticked task in `docs/ROADMAP.md`. It builds the question bank (questions tagged with skills, which make up the Q-matrix) and quiz authoring from the approved contract (`openapi.yaml` v0.2.3):
- `GET`/`POST /questions`, and `GET`/`PATCH`/`DELETE /questions/{id}`;
- `POST /quizzes`, and `GET`/`PATCH`/`DELETE /quizzes/{id}`;
- `GET /diagnostic`.

Attempts are not part of this task; the next task builds them. This task gives that one the quizzes and the learner view of each question.

Decided with the owner:
- **Practice quizzes need a lesson.** The API requires `lessonId` for `lesson` and `practice` quizzes. A practice quiz follows its lesson's access rule and is locked with its course. This closes the "Left open" item from the contract task. The database CHECK stays as it is, so there is no schema change.
- **Author view of `GET /quizzes/{id}`**, with answers and skill weights: the quiz's creator, the instructor who owns its course, and admins. Everyone else gets the learner view, if they may open the lesson:
  - learners must be enrolled in an approved course;
  - other instructors must be able to see the course, which is the same rule as opening its lessons.
- **Editing and deleting** a question or quiz stays with its creator or an admin (ERD "Content edit rights"), as it already is for passages.

No new dependency, and no schema change.

### Rules (all return the contract's codes)

**Questions**
- **Create** (instructor, admin):
  - `passageId`, if given, must exist (404), and the caller must be the passage's creator or an admin (403).
  - Skills must exist (400). No skill may appear twice (400), and **the weights must sum to 1 ± 1e-9** (400), the same tolerance as the seed.
  - `options` and `answerKey` must fit `questionType` (400). This follows the JSONB table in `docs/ERD.md`:
    - `multiple_choice` / `error_identification`: at least 2 `{id, text}` options with distinct ids. `answerKey` is one of those ids.
    - `true_false_not_given`: `options` is null. `answerKey` is `true`, `false` or `not_given`.
    - `gap_fill`: `options` is null. `answerKey` is at least one non-empty string.
    - `matching`: `{items, choices}`, each with distinct ids. `answerKey` maps **every** item id to a choice id, and has no other keys.

    The answer key must point at real options, so that the next task can grade correctly.
- **List:** instructors see their own questions; admins see all. Filters `skillId`, `passageId` and `type`. Ordered by `questionId`.
- **Get, patch, delete:**
  - 404 if the question doesn't exist; 403 if the caller isn't its creator or an admin.
  - Patch and delete give 409 once the question has responses, or while any quiz whose course isn't `draft`/`rejected` uses it. The diagnostic has no course, so only responses lock its questions.
  - Patch checks the shape rule on the **merged** question, because `questionType`, `options` and `answerKey` can change separately. `skills` replaces the whole list. The row and its Q-matrix rows are written in one transaction.
  - Deleting a question also removes it from quizzes and from the Q-matrix (database cascade).

**Quizzes**
- **Create:**
  - `diagnostic`: admin only (403), and `lessonId` must be null (400). Only one may exist: 409 from a pre-check, and also when the partial unique index rejects a race (`isUniqueViolation`).
  - `lesson` / `practice`: `lessonId` is required (400). Then `findVisibleLesson` (404). An instructor must own the course (403); an admin may use any lesson, as with passages. Then `assertEditable` (409).
  - `questionIds`: each must exist (400), and an instructor may only use questions they created (403).
  - The quiz and its `quiz_questions` are written in one transaction. `orderIndex` is the question's position in the array.
- **Get:** described under "Author view" above. If the quiz is missing, or its lesson isn't visible to the caller, the answer is 404.
- **Patch and delete:**
  - Only the creator or an admin (403).
  - 409 if the lesson's course isn't `draft`/`rejected`, or once the quiz has attempts.
  - Patch uses the same `questionIds` rules as create, and replaces the list in a transaction.
- **`GET /diagnostic`** (learner only):
  - Returns the learner view, plus `completedAttemptId`: the learner's oldest completed diagnostic attempt, or null.
  - Gives 404 if no diagnostic exists yet. The contract gains this response.

### Files

New:
- `src/services/questions.ts`:
  - `checkQuestionShape(type, options, answerKey)`, one small function per question type, written as plain checks with comments;
  - `assertWeightsSumToOne(skills)`;
  - `findOwnQuestion` (404/403);
  - `assertQuestionEditable` (409: responses, or used in a locked course);
  - `replaceQuestionSkills(tx, ...)`.
- `src/services/quizzes.ts`:
  - `findQuizForViewer`, which loads the quiz, applies lesson visibility, and decides author or learner view;
  - `findOwnQuiz` (404/403);
  - `assertQuizEditable` (409);
  - `assertCanUseQuestions` (400/403);
  - `replaceQuizQuestions(tx, ...)`.
- `src/services/quiz-views.ts`:
  - `buildQuestions` (author view, with skill tags loaded in one `IN` query), `toQuestionForLearner`, and `buildQuiz(quiz, view)`;
  - questions come in quiz order, and the passages they refer to are each listed once, through `buildPassages` from `services/course-views.ts`, so `mediaUrl` is signed.
- `src/services/skills.ts`: `assertSkillsExist`, moved out of `controllers/lessons.ts` so that lessons and questions share it.
- `src/controllers/questions.ts`, `src/controllers/quizzes.ts` (which includes `getDiagnostic`).
- `src/routes/questions.ts` (`authenticate` and `authorize("instructor", "admin")` on the whole router), `src/routes/quizzes.ts` (roles per route, as in `routes/courses.ts`), `src/routes/diagnostic.ts`.
- Tests:
  - `src/services/questions.unit.test.ts`: pure unit tests of the shape and weight rules;
  - `src/routes/questions.integration.test.ts` and `src/routes/quizzes.integration.test.ts`, with `fake-storage` mocked because quiz views contain passages.

Changed:
- `src/app.ts`: mount `/api/v1/questions`, `/api/v1/quizzes` and `/api/v1/diagnostic`.
- `src/utils/validator.ts`:
  - `questionInputSchema`, `questionUpdateSchema` and `questionQuerySchema`. Their `skills` is a list of `{skillId, weight}`, with unique `skillId`s. Joi checks only the general types of `options` and `answerKey`; the pairing with the type is checked in `services/questions.ts`.
  - `quizInputSchema` and `quizUpdateSchema`. `questionIds` must be non-empty and unique.
- `src/controllers/lessons.ts`: import `assertSkillsExist` from `services/skills.ts`.
- `src/test/db.ts`: add `createTestQuestion({ createdById, passageId?, skillIds? })` and `createTestQuiz({ kind, lessonId, createdById, questionIds })`.
- `src/docs/openapi.yaml`, bumped to **v0.2.4**:
  - `QuizInput.lessonId` is required for `practice` too;
  - who gets which quiz view;
  - admins may attach quizzes to any lesson;
  - `passageId` ownership on questions;
  - the shape rules (the answer key must reference options; matching covers every item);
  - 400 for an unknown skill or question id;
  - `/diagnostic` 404;
  - the `info.description` admin sentence adds "questions and quizzes".
- Docs:
  - `docs/ERD.md`: the practice-quiz rule and the shape rules under "Rules the app must enforce".
  - `backend/CLAUDE.md`: the layout gains the new services, and the test helpers gain the new ones.
  - `docs/plans/phase-2-core-apis.md`: a new task section with this plan, then its Outcome. The "Left open" practice-quiz item is marked as settled.
  - `docs/ROADMAP.md`: tick the task.

### Tests (main cases)

- **Questions:**
  - each of the 5 types is created;
  - shape mismatches give 400: an answer that isn't an option, `options` sent for TFNG, a matching key that misses an item;
  - weights 0.5 + 0.4 give 400; a duplicate skill or an unknown skill gives 400;
  - someone else's passage gives 403, a missing passage 404, and a learner caller 403;
  - list scope (instructor vs. admin) and each filter;
  - patch: replacing the skills, changing the type checked against the merged row, 409 once answered, 409 when used by an approved course's quiz, 200 when only a draft course's quiz uses it;
  - delete: the same rules, and the question is removed from the quiz.
- **Quizzes:**
  - create a lesson quiz: the author view lists the questions in order and each passage once;
  - 400 for a practice or lesson quiz without `lessonId`, and for a diagnostic with a lesson; 403 for an instructor creating a diagnostic; 409 for a second diagnostic, including two sent at the same time (one 201, one 409);
  - 403 for another instructor's approved lesson, 404 for their draft lesson, 409 for my approved course, 403 for a question that isn't mine, 400 for an unknown question;
  - get:
    - an enrolled learner gets no `answerKey`, `explanation` or `skills`;
    - a learner who isn't enrolled gets 403; on a draft course, 404;
    - another instructor on an approved course gets the learner view;
    - the course owner gets the author view of a quiz an admin built;
  - patch and delete: 409 after an attempt (`createAnsweredQuiz`) and 409 on an approved course; patch replaces `questionIds`.
- **Diagnostic:** 404 when none exists; the learner view with `completedAttemptId` null, then set after a completed attempt; 403 for an instructor.

### Verification

- In `backend/`: `npm run typecheck && npm run lint && npm test`.
- `npx @redocly/cli@1.34.5 lint src/docs/openapi.yaml`: valid, with only the known `license` warning.
- Manual run against the test database, with a `fetch` script in the scratchpad:
  1. The instructor creates a draft course and lesson, a reading passage, 2 questions (MC, matching) and a lesson quiz.
  2. The instructor submits the course; the admin approves it.
  3. A learner enrols and opens the quiz: no answers appear.
  4. Editing that question now gives 409.
  5. The admin creates the diagnostic: the first succeeds and the second gives 409. `GET /diagnostic` as the learner returns it.
- Swagger UI renders the updated contract.

### Outcome

Done 2026-10-24.
- **Checks:** typecheck and lint are clean, and 136 tests pass across 13 files (41 new: 8 unit tests of the shape and weight rules, 15 question route tests, 18 quiz route tests). Redocly lint is valid, with only the known `license` warning. Swagger UI serves contract v0.2.4.
- **Manual run** against the test database, scripted with `fetch`. Every step returned the expected status:
  1. The instructor creates a course, a lesson, a reading passage, an MC question (weights 0.6 + 0.4), a matching question and a lesson quiz. The author view lists the passage once and shows the answers.
  2. The instructor submits the course and the admin approves it.
  3. The learner gets 403 before enrolling. After enrolling, the learner view of each question has only `questionId, passageId, questionType, questionText, options`.
  4. Editing the question or the quiz now gives 409.
  5. `GET /diagnostic` gives 404 before the diagnostic exists. The admin creates it (201); a second one gives 409. The learner then gets it with `completedAttemptId: null`.

To read it: `src/services/questions.ts` (shape rules, Q-matrix weights, locked questions), then `src/services/quizzes.ts` (who sees what, who edits what), `src/services/quiz-views.ts` (response shapes), `src/controllers/questions.ts` and `src/controllers/quizzes.ts`.

Details settled while implementing:
- **Shared skill weights.** The Joi `lessonSkills` became `skillWeights`, used by lessons and questions. `assertSkillsExist` moved to `services/skills.ts`, as planned.
- **Shape errors** are a 400 with a `message` and no `details`, like the passage payload rule, because they are checked after Joi, on the merged question for `PATCH`.
- **Empty strings:** an empty question `explanation` or quiz `description` is stored as `null`.
- **`?skillId=` filter** runs in code after the database filters (creator, passage, type). The question bank is small and has no pagination, so this keeps the query simple.
- **Diagnostic race:** a probe with the pre-check disabled showed that the partial unique index error reaches the `catch` from inside the transaction, so two simultaneous creations give one 201 and one 409 either way.
- **Diagnostic through `GET /quizzes/{id}`:** anyone who isn't an author gets its learner view. There is no lesson to check.

Left open:
- **Edit while a learner answers.** The "no responses yet" check and the edit are separate statements. A question edited at the same moment as its very first answer could slip through. The Attempts task writes responses, and can close this gap by locking the rows if it matters. **Reviewed** in the Attempts task: accepted, not locked (see that task's Outcome).
- **Questions on passages from other lessons.** A quiz may use a question whose passage belongs to a different lesson. The contract doesn't forbid it, and the quiz view lists that passage too.
- **Creating a question is not locked.** An instructor can add a question to their passage in an approved course. Learners don't see it until a quiz uses it, and changing a quiz still needs a `draft` or `rejected` course.

## Task: Attempts: start, submit, score, log responses

Approved: 2026-10-24 (effort `high`).

Effort: `high` (the effort table names "attempt submission + scoring in a transaction" as `high`).
Branch: `feat/phase-2-attempts`, created from `fecbb1b` (the Questions and quizzes commit, made first with the owner's OK).

### Context

This is the next unticked task in `docs/ROADMAP.md`. It builds the contract's **Attempts** section (`openapi.yaml` v0.2.4):
- `POST /quizzes/{quizId}/attempts`: start, or resume the open attempt (201 / 200);
- `POST /attempts/{attemptId}/submit`: grade, log `question_responses` and close the attempt, in one transaction;
- `GET /attempts/{attemptId}`: the `AttemptResult` for the review screen;
- `GET /me/attempts`: my history, newest first, with an optional `?quizId=`.

This is the pipeline Phase 3 learns from (spec: "Quiz Logs → Recommendation Engine"). `masteryChanges` and `recommendations` stay `[]`, as the contract says, until Phase 3 adds BKT inside the same submit transaction.

No schema change, and no new dependency.

### Rules

**Start** (learners only; 403 for other roles)
- Quiz access follows the quiz's learner view: `findVisibleQuiz` (404, now exported) and `assertCanStudy` (403 if not enrolled). The diagnostic has no course, so any learner may start it.
- If I have already completed the diagnostic: 409 ("One completed diagnostic per learner", ERD).
- If I have an open attempt on this quiz, it is returned (200). Otherwise a new one is created (201) with `maxScore` = the quiz's question count.
- Two starts at the same moment: the partial unique index `quiz_attempts_one_open` rejects the second insert. `isUniqueViolation` catches it, and that request returns the open attempt (200).
- A quiz with no questions gives 409.
- The response is `{ attempt, quiz }`, with `quiz` from `buildQuiz(quiz, "learner")`.

**Submit** (the learner who started it)
- 404 for a missing attempt, 403 if it isn't mine, 409 if it is already submitted.
- Body: `responses`, at most 200 of `{ questionId, answer, responseTimeSeconds? }`, with unique `questionId`s. `answer` is a string (≤ 500 characters) or an object of strings.
- Each `questionId` must be in the quiz (400).
- **The answer shape must fit the question type (400)**, for example an object for a multiple-choice question. An unknown option id is simply graded wrong.
- **Grading** (`services/grading.ts`):
  - option ids and `true`/`false`/`not_given` must match exactly;
  - gap fill accepts any listed answer, ignoring case and extra spaces;
  - matching is all or nothing.
- Skipped questions get no row and count as wrong. `attemptOrder` is the position in the array, starting at 1.
- **One transaction:** close the attempt with a conditional update (`completed_at IS NULL`, 409 if nothing was updated), then insert the responses. `maxScore` is recounted at submit, so the CHECK `total_score <= max_score` holds even if a question was removed while the attempt was open.

**Get** (the learner who made it, or an admin; 403 for others)
- Completed: every quiz question in quiz order, with `userAnswer`, `isCorrect`, `correctAnswer`, `explanation`, `attemptOrder`, `responseTimeSeconds` and `skills`. A skipped question has `userAnswer: null`, `isCorrect: false` and `attemptOrder: null`.
- Open: `responses: []` and `scorePercent: null`.
- `scorePercent` = `totalScore / maxScore × 100`, rounded to 1 decimal.

**My attempts** (learners only): newest first, each with its `QuizSummary`. Quizzes and question counts are loaded once per list. With an unknown `quizId` the list is `[]`.

**Not built** (neither the spec nor the contract asks for them):
- `timeLimitSeconds` is not enforced;
- access isn't re-checked at submit;
- quiz results don't change lesson progress (module gating is Phase 3).

### Files

New:
- `src/services/grading.ts`, `src/services/attempts.ts`, `src/services/attempt-views.ts`;
- `src/controllers/attempts.ts`, `src/routes/attempts.ts`;
- tests: `src/services/grading.unit.test.ts` and `src/routes/attempts.integration.test.ts`.

Changed:
- `src/routes/quizzes.ts` (start), `src/routes/me.ts` (`/me/attempts`), `src/app.ts` (mount);
- `src/services/quizzes.ts` (export `findVisibleQuiz`);
- `src/services/quiz-views.ts` (export the question loaders, add `buildQuizSummaries`);
- `src/utils/validator.ts` (`submitAttemptSchema`, `myAttemptsQuerySchema`);
- `src/test/db.ts`;
- `src/docs/openapi.yaml`, bumped to v0.2.5;
- docs.

### Tests (main cases)

- **Grading (unit):** each type right and wrong; gap-fill normalisation; matching with a missing, a wrong or an extra item; shape mismatches.
- **Start:** start then resume; the learner view has no answers; 403 for an instructor and for a learner who isn't enrolled; 404 on a draft course; 409 for a second diagnostic; a new attempt after a submitted one; two parallel starts give one attempt.
- **Submit:** grading and logging; skips; `attemptOrder`; 400 cases; 403; 409 on a second submit; two parallel submits write the responses once; an answered diagnostic question is locked.
- **Get and list:** the open attempt reveals nothing; the review matches the submit result; admin access; 403 cases; order and filter.

### Verification

- `npm run typecheck && npm run lint && npm test`, and Redocly lint.
- A manual `fetch` run against the test database.
- Swagger UI renders v0.2.5.

### Outcome

Done 2026-10-24.
- **Checks:** typecheck and lint are clean, and 164 tests pass across 15 files (28 new: 8 grading unit tests, 20 attempt route tests). The two race tests passed 5 runs in a row. Redocly lint is valid, with only the known `license` warning. Swagger UI serves contract v0.2.5.
- **Manual run:** a script in the scratchpad ran the real server against the test database (wiped before and after) and drove it with `fetch`. Every step returned the expected status:
  1. Starting before enrolling gives 403. After enrolling, the start gives 201, and the questions have only `questionId, passageId, questionType, questionText, options`. A second start gives 200 with the same attempt.
  2. The review before submitting has no responses and a null score.
  3. Submitting with one skip (gap fill `"  COLOR "` right, MC wrong) scores 1/3 = 33.3%. The skip is listed with `userAnswer: null`, and `attemptOrder` follows the submitted order. A second submit gives 409. An admin can read the review.
  4. The diagnostic: start 201, submit 100%, start again 409. `GET /diagnostic` then returns its `completedAttemptId`.
  5. `/me/attempts` lists both attempts, newest first. 3 `question_responses` rows were written.

To read it: `src/services/grading.ts` (how answers are graded), then `submitAttempt` and `startOrResumeAttempt` in `src/services/attempts.ts` (the transaction and the races), `src/services/attempt-views.ts` (response shapes), and `src/controllers/attempts.ts`.

Deviation from the plan:
- **The conditional update uses `updateAndCount`, not `update()`.** The parallel-submit test failed at first: one 200 and one 500 (a duplicate `question_responses` key) instead of 200 and 409. In this Prisma 8 build, `.where(...).update()` SELECTs the matching row and then updates it by primary key alone, so "only if still open" isn't checked atomically. `updateAndCount` sends one `UPDATE ... WHERE attempt_id = ? AND completed_at IS NULL`. The second submit waits for the first, updates 0 rows and gets 409. The attempt row is reloaded afterwards in the same transaction. `backend/CLAUDE.md` now documents this.

Details settled while implementing:
- **Duplicate question ids** in a submit are rejected by Joi (`unique("questionId")`), with the usual `details`.
- **Answers are trimmed** by Joi, like other text input, so `"  COLOR "` is stored as `"COLOR"`.
- **`isCorrect` in the body** is rejected (400): Joi doesn't allow unknown keys.
- **Helpers:** `createTestQuestion` takes an optional `questionType`, `options` and `answerKey`. `isPlainObject` in `services/questions.ts` is exported and reused by grading.

Left open:
- **Edit while a learner answers** (from the previous task): a question in an open attempt can still be edited until the first response is written. Lesson quizzes can't hit this, because learners only take quizzes in approved courses, which are locked. For the diagnostic, it would need an admin editing during an open attempt. Accepted without row locks.
- **`timeLimitSeconds` isn't enforced** by the server. The frontend timer is expected to submit when time runs out.

Follow-up (2026-10-24, approved by the owner): **`changeCourseStatus` had the same race.** It used `.where(...).update()`, so two status changes at the same moment could both succeed, for example an admin approving while the owner withdraws.
- The existing HTTP race test in `routes/courses.integration.test.ts` passed only because the two requests rarely overlap closely enough.
- The new `src/services/courses.integration.test.ts` calls the service directly, 10 rounds of approve and reject in parallel. It failed on the old code (both won) and passes with the fix.
- The fix is the same `updateAndCount` pattern, plus a reload of the row.
- Every other `update()` in the code filters by primary key only, so none of them has this race.

## Task: Admin: roles and usage stats

Approved: 2026-10-24 (effort `medium`; the effort table lists "a new CRUD route/controller" as `medium`, and the RBAC it relies on already exists and is tested).
Branch: `feat/phase-2-admin`, created from `50c4bca` (the Attempts commit).

### Context

This is the last unticked Phase 2 task. The contract (`openapi.yaml`, Admin tag) already defines the three endpoints; only `GET /admin/courses` was built. It covers the spec's admin story: "manage user roles and access rights" and "monitor platform usage statistics".
- `GET /admin/users?role=&isActive=`: list users (`User` shape, never `hashedPass`);
- `PATCH /admin/users/{userId}`: change `role` and/or `isActive`;
- `GET /admin/stats`: the `AdminStats` shape.

No schema change, and no new dependency.

The owner also asked for a new effort rule in the root `CLAUDE.md` (Effort guide → Rules of thumb): at the start of every task, Claude suggests an effort for the task and for each subtask, and asks the owner to switch before a subtask that needs a higher level. That was done first, in the same branch.

### Effort per subtask

| Subtask | Effort | Why |
| --- | --- | --- |
| Validator schemas, routes, `controllers/admin.ts` | `medium` | Copies the `routes/me.ts` / `controllers/me.ts` pattern |
| Self-update 409 rule and deactivation | `medium` | Rule decided in the plan; `authenticate` already reloads the user |
| `services/stats.ts` | `medium` | Aggregate pattern; zero-fill and the 7-day window are easy to get wrong |
| `routes/admin.integration.test.ts` | `medium` | Standard supertest suite |
| `openapi.yaml` wording and version | `low` | Two sentences, no shape change |
| `backend/CLAUDE.md`, Outcome, `ROADMAP.md` tick | `low` | Mechanical |
| Optional `/code-review` of the role-change code | `high` | Review rule: auth code needs `high` or above |

### Rules

**List users**
- Optional filters `role` and `isActive` (Joi turns `"true"`/`"false"` into booleans). Ordered by `userId`. Mapped through `toPublicUser`.

**Update user**
- Body `AdminUserUpdate`: `role` and/or `isActive`, at least one (400 otherwise; unknown keys rejected).
- 404 if the user doesn't exist.
- **409 if `userId` is the caller**, even for a change that does nothing. One simple rule instead of comparing field by field. Only an admin can demote an admin, and nobody can demote themselves, so the platform can't lose its last admin.
- Takes effect at once: `authenticate` reloads the user on every request, so a deactivated user's token gives 401 on the next request, and a promoted learner passes `authorize("instructor")` straight away. Login already returns 403 for deactivated accounts.
- Plain `.where({ userId }).update(...)` is fine here, because the filter is the primary key only.

**Stats**, counted by Postgres with `aggregate` / `groupBy` (nothing is loaded into memory), run in parallel:
- `users`: one `groupBy("role", "isActive")`; a loop adds each group to `byRole` and to `active` or `inactive`. Every role starts at 0.
- `courses`: `groupBy("status")`, the same zero-filled loop.
- `enrollments`: one count.
- `attempts.completed`: `completedAt IS NOT NULL`. `completedLast7Days`: `completedAt >= now − 168 hours` (a rolling window).
- `activeLearnersLast7Days`: the number of distinct `userId`s among those recent attempts (`groupBy("userId")`). Only learners can start attempts.

### Files

`src/routes/admin.ts`, `src/controllers/admin.ts` (new), `src/services/stats.ts` (new), `src/utils/validator.ts` (`userRole`, `adminUsersQuerySchema`, `adminUserUpdateSchema`), `src/docs/openapi.yaml` (wording, v0.2.6), `src/routes/admin.integration.test.ts` (new), `backend/CLAUDE.md`, root `CLAUDE.md` (effort rule).

### Outcome

Done 2026-10-24.
- **Checks:** typecheck and lint are clean, and 187 tests pass across 17 files (22 new in `routes/admin.integration.test.ts`). Redocly lint is valid, with only the known `license` warning. The contract is v0.2.6.
- **Manual run:** a script in the scratchpad ran the real app on a real port against the test database (wiped before and after) and drove it with `fetch`. Every step returned the expected status:
  1. The admin lists all users (no `hashedPass`), and `?role=learner&isActive=true` returns only the learner.
  2. The learner gets 403 on `/instructor/courses`. After the admin promotes them, the same token gets 200.
  3. After deactivation, the same token gets 401 ("This account is deactivated").
  4. The admin's PATCH on their own account gives 409.
  5. `/admin/stats` returns zero-filled groups and the right counts. The deactivated user's token gets 401.

To read it: `src/controllers/admin.ts` (the list and the self-update rule), then `src/services/stats.ts` (each count has a comment saying what it counts), then `src/routes/admin.integration.test.ts` (the stats test sets up data where each number is different, so a wrong window or a double count shows up).

Deviation from the plan:
- **The 8-days-ago attempt in the stats test is moved back in SQL.** The plan assumed a `Temporal.Instant` could be passed to `db.raw.sql`. The runtime rejects it ("unsupported JS value type for raw-SQL interpolation"). The test now shifts `started_at` and `completed_at` together with `- interval '8 days'`, which also keeps the `completed_at >= started_at` check. `backend/CLAUDE.md` notes this, and the counting pattern.

Left open:
- **Two admins demoting each other at the same moment** could leave zero admins. Preventing it needs row locks for a case that can't happen with one admin. Accepted.
- **`activeLearnersLast7Days`** counts users who completed an attempt, whatever their role is now. A learner promoted to instructor this week still counts. Accepted: the number answers "how many people studied this week".

## Task: Server-side quiz time limit (after Phase 2, for the interim report)

Approved 2026-11-01 (owner's rule: "graded as far as the learner got; the attempt submits itself").

### Plan

The assignment requires a time limit that the server enforces (`proposal_VI.md` §4.4). Before this task only the client timer ran. No schema change: `quizzes.time_limit_seconds` and `quiz_attempts.started_at` already exist.

- **A late submit is rejected with 409** and the attempt is closed with score 0 (changed from "graded, never rejected" after review: an API client could submit full marks days late).
- **An attempt nobody submits is closed by the server** (`closeAttemptIfTimeIsUp` in `services/attempts.ts`) when it is next opened, by `POST /quizzes/{id}/attempts` or `GET /attempts/{id}`. Score 0 and no response rows, because the server only receives answers at submit time. `completed_at` is the deadline, not the moment it was noticed. A learner who starts the quiz again gets a fresh attempt.
- **Grace period:** 30 seconds after the limit (`GRACE_SECONDS`), for network delay.
- **Not applied to the diagnostic:** an empty completed diagnostic would block a retake (409) and seed mastery with zeros.
- The close is one `UPDATE ... WHERE completed_at IS NULL` (`updateAndCount`), so it cannot race with a submit.

### Outcome

Done 2026-11-01.
- **Checks:** typecheck and lint are clean, 193 tests pass across 17 files (6 new, in `routes/attempts.integration.test.ts`, describe "quiz time limit"). Redocly lint is valid. `openapi.yaml` text updated for `startAttempt`, `getAttempt` and `submitAttempt`; no new endpoint, so the contract version is unchanged.
- **Files:** `src/services/attempts.ts`, `src/controllers/attempts.ts`, `src/routes/attempts.integration.test.ts`, `src/docs/openapi.yaml`.
- **Known limit:** the server cannot see answers before the learner submits. If the learner's browser dies, the answers given so far are lost and the attempt scores 0. (Before the 409 rule) a late submit could also contain answers given after the deadline, because the server cannot tell when each answer was given (`responseTimeSeconds` is sent by the client). Closing both gaps needs answers saved while the learner works (autosave), which needs a new column or table and is left for later.
- **Frontend:** nothing changes for it to keep working. It should send the answers when its own timer reaches zero (the "auto-submit" the learner sees).
