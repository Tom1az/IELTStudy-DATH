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
