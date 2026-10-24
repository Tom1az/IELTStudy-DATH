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
- **Practice quizzes without a lesson.** `QuizInput` doesn't say whether a `practice` quiz needs `lessonId`. Without one, the learner access rule ("same as the quiz's lesson") has nothing to check. The owner chose to settle this in the "Questions and quizzes" task.
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
7. **Tests:** `routes/auth.test.ts`, `routes/me.test.ts`, `middlewares/auth.test.ts`, and an updated `app.test.ts`.
8. **Docs:** `backend/CLAUDE.md` conventions, the root `CLAUDE.md` test command, two new rules in `docs/ERD.md`, `.env.example`.

### Outcome

Done 2026-10-24. Typecheck, lint and 38 tests pass (4 files, against a real Postgres test database). Redocly lint is valid, with only the known `license` warning; the deprecated-endpoint warning is gone. Manual run with `curl` against the test database: register → `GET /me` → `PATCH /me { targetBand: 7 }` → login (wrong password 401, right password 200); `GET /api/v1/users` now returns 404; Swagger UI still renders.

To read it: `src/middlewares/auth.ts`, then `src/controllers/auth.ts`, `src/controllers/me.ts`, `src/utils/jwt.ts`, and `src/test/db.ts` for the test pattern.

Deviations from the plan, and details settled while implementing:
- **Duplicate email race.** Prisma 8 throws a `SqlQueryError` with `sqlState: "23505"` when the `UNIQUE` index rejects an insert (checked with a throwaway probe). `register` maps it to the same 409, and a test sends two sign-ups at once and expects one 201 and one 409.
- **Login timing.** For an unknown email, login still runs one `bcrypt.compare` against a fixed dummy hash, so response time doesn't reveal which emails have accounts. This applies the contract's "same answer" rule to timing as well.
- **Deactivated token → 401** with the message "This account is deactivated" (login gives 403). `/me` only lists 401 in the contract, and the token has stopped working, so 401 fits. Recorded in the `/me` description.
- **Role-change test** is in `middlewares/auth.test.ts` (a learner promoted to admin passes `authorize("admin")` on the very next request with the old token), not in `me.test.ts`. That's where the behaviour lives.
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
