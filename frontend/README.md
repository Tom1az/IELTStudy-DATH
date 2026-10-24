# IELTStudy — Frontend

Adaptive IELTS learning web platform · CO3103 Programming Integration Project (Software Engineering), Semester 261.

Next.js 14 (App Router) + TypeScript + Tailwind CSS, implementing the team's Figma design (6 screens) and every screen the proposal and the course brief require for the three roles (learner, instructor, admin), including the advanced component **Direction 2 – Personalised learning paths and recommendations** (BKT + content-based filtering).

---

## 1. Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

No backend is needed to run it: with `NEXT_PUBLIC_API_URL` empty the app uses a built-in mock API that applies the same validation and role rules as the planned Express API and saves data in the browser (localStorage). Demo accounts (password `Password123!`), also one click away on the login page:

| Role | Email | Seeded state |
|---|---|---|
| Learner | `learner@ieltstudy.dev` | Mira Evans — Foundation completed, Intermediate 12/32, an unfinished Practice set 2.3 (this is exactly the Figma state) |
| Instructor | `instructor@ieltstudy.dev` | Hannah Cole — owns Foundation and Intermediate, 2 essays to grade |
| Admin | `admin@ieltstudy.dev` | 1 course waiting for review, 2 open content reports |

Admins can restore the seed data with **Reset demo data** on `/admin`.

### Connecting the real backend

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

Every call then goes to `${NEXT_PUBLIC_API_URL}${path}` with `Authorization: Bearer <JWT>`. Errors are expected as `{ "error": { "code", "message", "fields"? } }` (HTTP 401/403/404/409/422). The contract is listed in §6 and implemented once per call in `src/lib/api/*` — the mock handler next to each route is the reference behaviour.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run typecheck` · `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests (Vitest): BKT, scoring, band rounding, recommender, simulation, seed integrity, password hashing |
| `npm run test:e2e` | End-to-end tests (Playwright, 12 scenarios on desktop + mobile). First run `npx playwright install chromium` |

---

## 2. Screens

**Figma screens (pixel-matched: colours sampled from the file, Fraunces + DM Sans, same copy and layout)**

| Figma | Route |
|---|---|
| Home | `/` |
| Courses | `/courses` — search, skill filter, lesson results with pagination |
| Course detail | `/courses/[slug]` — syllabus accordions, free preview, prerequisite, enroll / leave |
| Lesson | `/learn/[slug]/[lessonId]` — video player (speed, captions, resume position), resources, Overview / Transcript / Notes / Discussion, mark complete, up next |
| Practice set | `/practice/[setId]` — timer (timed/untimed), passage + questions, navigator, autosave, save & exit, submit |
| My learning | `/my-learning` — continue learning, estimated band by skill, courses, BKT "Up next", recent results |

**Added for the proposal and the brief** — learner: `/login` `/register` `/forgot-password` `/reset-password` `/placement` (30 questions, cold start) `/practice/result/[attemptId]` (post-quiz review + remediation) `/mastery` (skill map, radar chart) `/practice` `/my-learning/history` `/notifications` `/profile` `/assignments/[id]` (file-upload writing task) and printable lesson resources.
Instructor studio `/instructor/*`: overview, courses (create, edit, submit for review, publish / hide), lesson editor (content, video, resources upload, passage / listening script, questions with Q-matrix tagging and live preview), question bank, grading with IELTS rubric, learners with early warning, analytics.
Admin `/admin/*`: overview statistics, users (roles, suspend, create), course review queue, skill taxonomy, content reports moderation, recommender evaluation, audit log.

All pages are responsive (checked at 375 px with no horizontal scroll) and keyboard accessible (skip link, focus rings, labelled controls, ARIA roles for radio groups, dialogs and progress).

---

## 3. Requirement coverage (brief §4–§6)

| Brief | Where |
|---|---|
| 4.1 Accounts & roles | Register / login / logout / forgot + reset password, profile, change password, RBAC on every API route (401/403) and route guards, admin role and status management |
| 4.2 Courses & content | Catalogue with search, filter, pagination; course detail with syllabus, instructor and prerequisite; chapter (skill) / lesson structure; video + text + downloadable resources; instructor create / edit / publish / hide course and lessons |
| 4.3 Enrolment & learning | Enroll (prerequisite check) / leave; lessons open in order; mark complete; progress saved; resume from last lesson **and** last video position; active and completed courses |
| 4.4 Assessment | Auto-graded practice sets (T/F/NG, multiple choice, gap fill, headings) with time limit; writing tasks with file upload and due date; instructor grading with feedback; results and attempt history |
| 4.5 Interaction & notifications | Lesson discussion with replies; notifications for new content, deadlines, results and replies; reporting posts, lessons and questions |
| 4.6 Admin & reports | Users and courses; enrolments, completion and score statistics; audit log of important admin actions |
| 5 Advanced component (Direction 2) | See §4 |

---

## 4. Advanced component — adaptive recommendations

Code: `src/lib/adaptive/`.

- **BKT** (`bkt.ts`): per-skill `pInit / pTransit / pSlip` and per-question-type guess rates from `bkt-params.json` (the file the offline pyBKT pipeline exports). Multi-skill questions update every tagged micro-skill in proportion to its Q-matrix weight.
- **Cold start**: the 30-question placement quiz fits the starting mastery vector and recommends a level.
- **Content-based filtering** (`recommender.ts`): lessons are vectors over micro-skills; the learner's need vector is `max(0, 0.65 − mastery)`; score = need·lesson / ‖lesson‖ (+ a small bonus for the next lesson in sequence). Each recommendation carries a human-readable reason, e.g. *“Recommended because mastery on 'True / False / Not Given' is 0.38, below 0.65.”*
- **Targeted remediation**: after a practice set, skills that fall below 0.65 trigger review lessons / sets and a **gate** before the next lesson in that skill (cleared by finishing a review, by mastery recovering, or by the learner choosing to continue).
- **Feedback & logging**: shown / clicked / helpful / not helpful events (CTR on the admin overview).
- **Evaluation** (`simulation.ts`, `/admin/evaluation`): simulated A/B test on synthetic learners vs a static sequential curriculum and a popularity baseline — normalised learning gain, Precision@3, MRR, time-to-mastery, learning curves — plus a re-ranking latency benchmark (target < 300 ms; measured well under 5 ms) and side-by-side paths for four learner profiles. With the default settings (200 learners, 24 steps) the adaptive policy improves learning gain by about 35 % and reaches mastery in fewer steps than the sequential baseline.

---

## 5. Project structure

```
src/
  app/(site)/        public + learner pages with the site header
  app/(focus)/       full-screen lesson player, practice runner, placement
  app/instructor/    instructor studio (sidebar layout)
  app/admin/         admin panel (sidebar layout)
  components/        UI kit, layout, quiz, lesson, studio, charts
  data/              skills taxonomy, practice content, lesson guides, seed
  lib/adaptive/      BKT, recommender, simulation (+ unit tests)
  lib/api/           API client + mock handlers (one function per endpoint)
  lib/               types (mirrors the proposal's data model), auth context, hooks, formatting
e2e/                 Playwright end-to-end tests
```

---

## 6. REST contract (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/change-password` · `PATCH /users/me` |
| Catalogue | `GET /courses?q&skill&page&pageSize` · `GET /courses/:slug` · `GET /skills` · `POST /courses/:id/enroll` · `POST /courses/:id/leave` |
| Lessons | `GET /courses/:slug/lessons/:lessonId` · `GET /courses/:slug/lessons/:lessonId/resources/:resourceId` · `POST /lessons/:id/complete` · `PUT /lessons/:id/position` · `PUT /lessons/:id/notes` · `GET·POST /lessons/:id/posts` · `POST /reports` · `POST /remediation/:gateId/override` |
| Practice | `GET /me/practice-sets` · `POST /practice-sets/:id/attempts` (start or resume) · `PUT /attempts/:id` (autosave) · `POST /attempts/:id/submit` · `GET /attempts/:id` · `GET /me/attempts` · `GET /placement` · `POST /placement/submit` |
| Learner | `GET /me/dashboard` · `GET /me/mastery` · `POST /recommendations/feedback` · `GET /me/notifications` · `POST /me/notifications/read` · `GET /assignments/:id` · `POST /assignments/:id/submissions` |
| Instructor | `GET·POST /instructor/courses` · `GET·PATCH /instructor/courses/:id` · `POST /instructor/courses/:id/submit` · `POST /instructor/courses/:id/visibility` · `POST /instructor/courses/:id/lessons` · `GET·PATCH·DELETE /instructor/lessons/:id` · `POST /instructor/lessons/:id/status` · `POST /instructor/lessons/:id/move` · `POST·DELETE /instructor/lessons/:id/resources[/:resId]` · `GET·PATCH /instructor/practice-sets/:id` · `PUT·DELETE /instructor/practice-sets/:id/questions/:qid` · `GET /instructor/questions` · `GET /instructor/submissions` · `POST /instructor/submissions/:id/grade` · `POST /instructor/courses/:id/assignments` · `GET /instructor/courses/:id/learners` · `GET /instructor/courses/:id/analytics` |
| Admin | `GET /admin/stats` · `GET·POST /admin/users` · `POST /admin/users/:id/role` · `POST /admin/users/:id/status` · `GET /admin/courses` · `POST /admin/courses/:id/review` · `POST /admin/courses/:id/status` · `GET·POST /admin/skills` · `PUT·DELETE /admin/skills/:id` · `GET /admin/reports` · `POST /admin/reports/:id/resolve` · `GET /admin/audit` · `GET /admin/evaluation?courseId` |

Answer keys are stripped from practice sets until the attempt is submitted.

---

## 7. Notes and known limitations

- **Brand**: the proposal names the product *IELTStudy*; the Figma file uses the working name *Stepband*. The UI uses IELTStudy — change `BRAND` in `src/lib/format.ts` and the logo text if the team prefers the Figma name.
- Level names follow the Figma (Foundation / Intermediate / Advanced) rather than the proposal's Beginner / Intermediate / Advanced.
- One Figma line read “Task 1 reports and Task 2 essays in 40 and 60 minutes”; it is shown as **20 and 40 minutes**, the real IELTS timing.
- Seeded lessons have no video files, so the player runs a timed slide-and-caption presentation of the lesson script with the same controls; a lesson with a `videoUrl` plays the real file. Listening recordings without an audio file are read aloud with the browser's speech synthesis.
- Practice texts and questions are original sample material written for this project, not taken from official IELTS papers.
- In mock mode, uploaded files ≤ 700 KB are stored in the browser; larger ones keep only metadata (the real backend uploads to Supabase Storage). Emails (password reset, notifications) are simulated and the reset link is shown on screen.
- Estimated bands are practice indicators, not official IELTS scores.
- AI use disclosure: parts of this frontend were produced with the help of an AI assistant (Claude) and reviewed by the team.
