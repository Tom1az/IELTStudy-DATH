# Phase 4: Frontend

Approved plans for the Phase 4 tasks in `docs/ROADMAP.md`.

## Task: align the merged frontend with the real backend contract

Covers these roadmap items (partly): Auth pages; Learner; Instructor Studio; Admin panel. The Phase 4 **Gate** (Figma or wireframes approved) is still open.

Approved: 2026-10-26.

### Context

Merging `origin/phanqig` into `feat/phase-2-admin` brought in a full Next.js frontend and, at the repo root, leftover files from the old e-commerce project (`app.js`, `controllers/`, `routes/`, `utils/`, `src/prisma/`, a `package.json` named "MiniMemoryZone"). The frontend has no e-commerce code. It was written against an invented REST contract of about 100 endpoints and runs on an in-browser mock API. Only a few of its paths match `backend/src/docs/openapi.yaml`, and none of its response or error shapes do.

Decisions taken with the owner:
- Pages for features with no backend (password reset and change, notifications, discussion, reports, notes, assignments, grading, remediation gates, audit, admin skills, evaluation, instructor analytics) are **kept as stubs**. In real-backend mode they show "not available yet" instead of calling routes that don't exist.
- The old e-commerce files at the repo root are **deleted**.

### Plan

1. Resolve the merge: `.gitignore` (keep HEAD's entries, add `.idea/` and `qodana.yaml`), delete the root e-commerce files, and merge `frontend/README.md` into one file.
2. API layer, one module at a time: a `backendRequest()` that parses `{ error: { message, details } }`, and handles a 401 by dropping the token and sending the user to `/login`. Backend types copied from `openapi.yaml`, and mappers into the UI types, so pages keep working while modules move over.
3. Connectivity: a Next.js rewrite that proxies `/api/v1/*` to the backend (no CORS change on the backend). The frontend runs on port 3001.
4. Pages: rewire the kept pages to the real endpoints (course id instead of slug, quiz instead of practice set, `/diagnostic` for placement, approve/reject for review, `PATCH /admin/users/:id`). Stub the cut features. Stub the Phase 3 data (mastery radar, recommendations, locked lessons) until the backend serves it.
5. Remove the mock (`mock-db.ts`, `sha256.ts`, `src/data/seed.ts`, `lib/adaptive/*`) once no module uses it.
6. Tests: rewrite the Playwright specs against the real backend, and drop the specs for stubbed features.

### Backend gaps (decided 2026-10-26)

Phase 3 belongs to another team member, so this task skips it. Pages that need Phase 3 data (mastery radar, recommendations, locked lessons) show "not available yet" while `/me/mastery` and `/recommendations` return 404.

The owner asked to "fix the backend to fit the frontend". The decision was: keep the plan above, and change the backend only where an in-spec screen can't work without it. A gap analysis found no such screen, so the contract stays at v0.2.6. Each frontend need is handled on the frontend:

| Frontend expects | Handled by |
| --- | --- |
| Course slug in URLs | `courseId` is used as the route param |
| Course level 1/2/3, band range, outcomes | `targetLevel` gives the level; fields the backend doesn't have get neutral defaults |
| Lesson skill track, video, transcript, practice set | The first skill tag's category, the `video` passage's `mediaUrl`/`content`, the first quiz |
| Lesson complete, resume position | `PUT /lessons/:id/progress` (`in_progress` on open, `completed` on finish). The position is not saved |
| Practice set (one passage) | A quiz, with questions grouped by `passageId` (this also gives the placement sections) |
| Question types `mcq/tfng/gap/heading` | `multiple_choice / true_false_not_given / gap_fill / matching`. `ynng` is hidden in authoring |
| Attempt autosave | Answers stay in localStorage until submit |
| Post-quiz review with options | `GET /attempts/:id` merged with `GET /quizzes/:quizId` (learner view) |
| Dashboard aggregate | `/me/enrollments` + `/me/attempts` + `/courses/:id/lessons` |
| Practice page | `GET /lessons/:id` for each unlocked lesson of the enrolled courses. The syllabus drops the per-lesson question count |
| Leave course, admin create user, lesson hide/show, resources, demo reset | Stubbed with `notAvailable()` |
| Course visibility (hide) | `POST /courses/:id/archive` |

Rejected: adding `quizzes` to the items of `GET /courses/:id/lessons`. It would only serve the practice page (not named in `specs.md`) and a cosmetic question count. If the practice page turns out slow on real data, propose it then as an additive change.

### Outcome (in progress)

Done on 2026-10-26:
- `.gitignore` conflict resolved. `frontend/README.md` conflict resolved: one README that documents both modes, points to `openapi.yaml` for the contract and tracks migration status per module.
- `src/lib/api/client.ts`: `backendRequest()`, `fieldsFromDetails()` (Joi `details` → per-field messages), 401 handling, and `notAvailable()` for stubbed features. The old `request()` uses `backendRequest()` in real mode.
- `src/lib/api/backend-types.ts`, `src/lib/api/mappers.ts` (`toUser`).
- `src/lib/api/auth.ts` on the real contract: login, register (sends only `email`, `fullName` and `password`, because the backend rejects `targetBand` at sign-up; the target band is then set with `PATCH /me`), `GET /me`, `PATCH /me`. `placementDone` comes from `GET /diagnostic`'s `completedAttemptId`. Password reset and change are stubbed.
- `next.config.mjs` proxy, `frontend/.env.example` (`NEXT_PUBLIC_API_URL`, `BACKEND_URL`), port 3001 in `package.json` and `playwright.config.ts`.
- Verified: typecheck, lint and unit tests pass. The register, login, `/me`, `PATCH /me`, `/diagnostic`, validation-error and bad-token responses were checked through the proxy against the running backend.

- Root e-commerce files deleted (the owner ran the `git rm`). The merge has no unmerged paths left.

- `learning.ts` on the real contract (2026-10-26). The real calls live in `src/lib/api/learning-backend.ts`, and `learning.ts` delegates to them when `USING_MOCK` is false, so the mock code stays untouched until step 5. New mappers in `mappers.ts`: `toCourse`, `toSkill`, `lessonCategory` (a lesson goes under the category of its heaviest skill tag), `buildSyllabus` (core lessons grouped into the four skill sections, remedial lessons left out), `toLesson`, `toEnrollment`, `toRecommendation`. Pages hide the fields the backend doesn't have (band range, hours, outcomes, learner count, video length) instead of showing zeros. The lesson viewer now shows the lesson's passages (reading text, audio, extra videos), and only shows the video player when there is a video. Notes, discussion, reports and "leave course" are hidden in real mode. Verified with a throwaway Vitest script against the running backend: register, catalog, search, course page, enroll, lesson, complete, dashboard.
- Finding: `GET /courses` needs a token (only `/auth/*` is public), so logged-out visitors can't see the catalog. The home page and `/courses` ask them to log in. Making the catalog public would be a contract change; it was not made.

- `practice.ts` on the real contract (2026-10-26), in `src/lib/api/practice-backend.ts`. `quiz-mappers.ts` converts quizzes into the player's sections (one per passage, plus "Other questions" for questions without one) and answers both ways (option index ↔ option id, `TRUE`/`NOT GIVEN` ↔ `true`/`not_given`, accepted gap answers joined with `|`). Matching questions got a new UI type `matching` (a dropdown per item; the answer is kept as JSON text because the player stores strings). The player starts untimed when the quiz has no time limit, and labels its section tabs with the section title. Real-mode placement starts the diagnostic attempt when the learner presses "Start", submits it like any attempt and opens the post-quiz review, because band estimates and a recommended level need Phase 3; a finished diagnostic links to its review (it can't be retaken). The result page says "not available yet" for skill changes and recommendations while `masteryChanges` is empty. Verified with a throwaway Vitest script against the running backend: diagnostic (all question types, including matching), practice list, start, draft resume, submit, review, history.

- `instructor.ts` on the real contract (2026-10-26). Deviation from "map backend responses into the UI types": the mock studio's lesson model (an embedded passage and question set, video length, strategy steps, resources, hide/publish) has no backend equivalent, and mapping would drop what the backend does have (several passages per lesson, `kind`, weighted tags, separate quizzes). So in real mode the pages render new components in `src/components/studio/backend/` (`CourseEditor`, `LessonEditor`, `PassageForm`, `QuestionForm`, `NewCourseForm`, `QuestionBank`), built on `studioApi` in `instructor-backend.ts`. They cover the spec's Instructor Studio: course details and the review flow (submit, withdraw to edit, archive, delete a draft), core and remedial lessons with skill tags and up/down ordering (swaps `orderIndex` with the neighbour), passages with signed media uploads, and quiz questions of all five types with a Q-matrix row whose weights must add up to 1. A lesson's first question creates its quiz (a quiz needs at least one question). Locked courses show a "withdraw to edit" banner and read-only forms. Grading, learners and analytics are hidden from the sidebar. On the real backend the studio is for instructors only (admins don't own courses).
- `admin.ts` on the real contract (2026-10-26), in `admin-backend.ts`: users (search and paging client-side, role change, suspend/reactivate through `PATCH /admin/users/:id`), the review queue (approve with optional feedback, reject with required feedback, archive), and a new real-mode overview built on `GET /admin/stats`. Creating accounts, reports, audit log, skill editing, the evaluation page and demo reset are hidden.
- Verified: typecheck, lint, unit tests and `next build` pass. The studio and admin smoke script (`studio.smoke.test.ts`) needs the seed admin password, so the owner runs it.

- Mock removed (step 5, 2026-10-26). Deleted: `mock-db.ts`, `helpers.ts`, `sha256.ts`, `src/data/`, `src/lib/adaptive/` (client-side BKT, recommender, simulation), the mock studio components, the lesson discussion, report dialog and simulated video player, and the lesson resources route. `USING_MOCK` and the mock `request()` are gone, and `API_URL` defaults to `/api/v1` (the proxy), so no `.env.local` is needed. Each `*-backend.ts` file was merged back into its module (`learning.ts`, `practice.ts`, `instructor.ts`, `admin.ts`), and the studio components moved from `components/studio/backend/` to `components/studio/`. `src/lib/types.ts` was pruned to what the backend provides (for example `Course` lost `slug`, band range, hours and outcomes, and `Lesson` became id, skill, order, title and content), and the DTOs lost their always-empty fields. Route folders were renamed to match: `courses/[courseId]`, `learn/[courseId]/[lessonId]`, `practice/[quizId]`. Pages for features with no backend are now one-line `NotAvailable` stubs, left out of the menus: notifications, writing tasks, grading, password reset, instructor learners and analytics, admin skills, reports, evaluation and audit. The notification bell, demo-account buttons, profile bio and notification settings, and the password change form are gone. The lesson viewer shows the lesson text and its passages (video, audio, reading). The only unit test tested the mock BKT, so it was replaced with unit tests for `mappers.ts` and `quiz-mappers.ts` (16 tests). Verified: typecheck (also with `--noUnusedLocals`), lint, unit tests, `next build`, and the learning and practice smoke scripts against the running backend.
- Playwright specs rewritten for the real backend (step 6, 2026-10-26). Learners sign up fresh through the UI: sign-up validation, the placement quiz (start, submit, review, no retake), the wrong-password message, role-based redirects, the logged-out catalog, the main flow (enroll → lesson → complete → quiz → review → dashboard → history) and quiz resume from localStorage. The staff spec (instructor builds and submits a course, admin approves, a learner sees it; admin promotes a user) needs `SEED_PASSWORD` and is skipped without it. Result against the running backend: 8 passed, 2 skipped (staff). The run found a real bug: right after a page load, "Enroll" could be clicked before the auth context had loaded the user, which sent a logged-in learner to sign-up. `EnrollButton` now stays disabled while auth is loading.

- Staff checks run by the owner with `SEED_PASSWORD` loaded (2026-10-26): the staff Playwright spec passes (2 tests), and so does the studio and admin smoke script. Fixes found on the way:
  - `playwright.config.ts` read `PORT` for the frontend, but loading `backend/.env` sets `PORT` to the backend's port, so the browser hit the backend. It now reads `E2E_PORT` (default 3001).
  - The e2e `login()` helper returned before the login finished; `loginAs()` waits until the app leaves `/login`. The role-change test picks the row by the run's unique email, because earlier runs leave accounts with the same name.
  - `instructorApi.addQuestionToLesson` and `removeQuestion` built the quiz's question list from the quiz object the caller passed in, so a stale object could drop questions. They now read the current list from the server first.

Still to do:
- Phase 4 Gate (wireframes) is still open, and the dashboard's radar chart and next best step wait for Phase 3.

Deviation: the plan said to replace the UI types with the backend's. Mapping backend responses into the existing UI types (`mappers.ts`) lets each module move over on its own while the rest of the app keeps building.

## Task: UI restyle from the DATH Figma file

ROADMAP: Phase 4, "UI design: Figma or wireframe approval" and the open Learner task. Approved 2026-10-26.

### Context
The owner asked for the frontend to follow the new Figma file `DATH` (`fgGST1I6LC0FEOJ7Cmiitx`). It has 5 frames: Desktop/Mobile *My learning*, Desktop/Mobile *Reading practice*, Mobile *Practice result*. The goal was the Figma's design language, not a pixel copy, with the same style applied to the screens the Figma doesn't cover. The old teal and orange were dropped for the owner's palette:

| Name | Hex | Role |
|---|---|---|
| Celtic Blue | #3971B8 | primary: buttons, active nav, progress, links, timer, "correct" in review |
| Ivory | #FBFCEE | page background |
| Drab Dark Brown | #343B1B | text, dark surfaces (level 3, footer) |
| Vanilla | #F6E6A5 | accent cards (courses), selected answer, level 1 |
| Tea Green | #C8D69B | used as little as possible (owner's choice): the Writing skill colour and the "below 65%" mastery badge |

Decisions made in chat:
- The Figma's Tea Green "Next best step" card is a solid Celtic Blue card with white text instead.
- Only real data is shown. Study streak, weekly goal, exam date, "Mark for review", the Highlight tool, "Help & resources" and the "Plus" plan are not in `specs.md` and have no backend, so they were left out. Their places show data that exists (bands, recommendations, courses, recent results, target band).
- No new features and no backend change.

### Plan
1. Feature branch `feat/figma-restyle`. Font: Plus Jakarta Sans (the Figma's only font) through `@fontsource/plus-jakarta-sans`, replacing DM Sans and Fraunces.
2. New tokens in `tailwind.config.ts` (`ivory`, `line`, `ink`, `brand`, `vanilla`, `tea`, `skill-*`, `success`, `danger`) and `globals.css`. Remove `cream`, `sand`, `navy`, `teal`, `peach` and sweep every usage.
3. Brand mark from the Figma (blue rounded square, white open book).
4. `LearnerShell`: a white sidebar on desktop and a bottom bar on phones for learners. Guests and staff keep the top header. `AppShell` (instructor/admin) gets the same sidebar look.
5. Rebuild the My learning dashboard, the quiz player and the practice result page after the Figma frames.
6. Apply the same style to the other screens (mostly the token sweep).
7. Verify: typecheck, lint, unit tests, `next build`, screenshots at 1440 and 390 px, and e2e.

### Outcome
Done 2026-10-26. What changed (read in this order):
- **Tokens**: `frontend/tailwind.config.ts`, `frontend/src/app/globals.css`, `frontend/src/lib/format.ts` (`SKILL_META`, `SKILL_HEX`, `LEVEL_THEME`). Old token names were replaced in about 30 files with a search-and-replace script (`bg-cream` → `bg-ivory`, `navy`/`teal` → `brand` or `ink`, `sand` → `line/50`, `peach` → `vanilla`). Headings use `font-extrabold` instead of a serif face.
- **Layout**: new `frontend/src/components/layout/LearnerShell.tsx`. `frontend/src/app/(site)/layout.tsx` is now a client component that picks `LearnerShell` for learners and `SiteHeader` for everyone else. It renders no header until the session check ends, so learners don't see the guest header flash. `AppShell`, `Logo`, `SiteHeader` and `AuthShell` were restyled.
- **Dashboard** (`app/(site)/my-learning/page.tsx`): header with date and greeting, an overview strip (estimated band, courses, latest quiz), then three columns: learning path (blue next-best-step card from `upNext[0]`, falling back to the lesson to resume), skill compass (radar of the four bands plus bars; "not available yet" while `bands` is null), and course cards on Vanilla with recent quiz results.
- **Quiz player** (`components/quiz/QuizRunner.tsx`, `QuestionView.tsx`, `PassagePane.tsx`): a white header with brand, title, timer box and "Save & exit", a progress row, passage and questions as two cards, and the passage collapsed behind "Show passage" on phones. Answer options are cards with a round letter marker. Selected = Vanilla with a blue border. In review, correct = blue and wrong = red. Logic (timer, autosave, submit) is unchanged.
- **Result page** (`app/(site)/practice/result/[attemptId]/page.tsx`): accuracy ring, a "Your mastery update" list (before → after, with a Tea Green badge under 0.65), and a blue "Your next best step" card with the first recommendation and its rationale.
- Smaller tweaks: lesson viewer header is white, the landing page's level 3 bar is Drab Dark Brown, skill filter pills use the line border, and the favicon is the new brand mark.

Deviations:
- "Practice" is a fifth item in the learner nav (the Figma has four), because the practice list would otherwise be unreachable for learners.
- Writing's skill colour is a darker olive built from Tea Green (`#7F9148` on `#E6EDCF`), so the four skills stay distinct without a fifth hue.

Verified: typecheck, lint, unit tests (16) and `next build` pass. Screenshots of the landing page, login, placement, catalog, lesson, quiz (desktop and phone), result (desktop and phone), dashboard (desktop and phone), history and practice were checked against the Figma. E2E against the running backend with one worker: 8 passed, 2 skipped (the staff spec needs `SEED_PASSWORD`, so the owner runs it). With the default parallel workers on a dev server, 4 auth tests timed out waiting for sign-up or login. The same tests pass serially and the API answers in about 0.5 s, so this was load on the dev server, not the UI.
