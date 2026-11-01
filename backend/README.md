# IELTStudy backend

## Overview

The REST API for IELTStudy, an adaptive IELTS learning platform. It handles:

- **Authentication:** register, log in, JWT sessions and role-based access (learner, instructor, admin).
- **Courses:** instructors build courses, lessons and passages (with media), and submit them for admin review. Learners enrol and track lesson progress.
- **Quizzes:** instructors write questions tagged with IELTS micro-skills and group them into quizzes. Learners take a 30-question diagnostic and lesson quizzes.
- **Grading:** answers are graded on the server when an attempt is submitted, and every response is logged.
- **Admin:** manage user roles, deactivate accounts, review courses and view usage stats.

The Bayesian Knowledge Tracing engine and the recommendations run as a separate service in [`../advanced/`](../advanced/), which this API calls after a quiz submit and when it serves lessons (see [`../docs/ROADMAP.md`](../docs/ROADMAP.md)). The product spec is [`../specs.md`](../specs.md).

## Tech stack

| Part       | Choice                                                       |
| ---------- | ------------------------------------------------------------ |
| Runtime    | Node.js, which runs the `.ts` files directly (no build step) |
| Language   | TypeScript (strict)                                          |
| Framework  | Express 5                                                    |
| ORM        | Prisma 8 (release candidate, contract API)                   |
| Database   | PostgreSQL                                                   |
| Storage    | Supabase Storage (signed upload and read URLs)               |
| Validation | Joi                                                          |
| Auth       | JWT (`jsonwebtoken`) and bcrypt                              |
| Tests      | vitest and supertest                                         |
| API docs   | OpenAPI 3 and Swagger UI                                     |

## Requirements

- **Node.js 26.8.2 or newer.** Check with `node --version`.
- **npm** (it comes with Node.js). The repository uses `package-lock.json`.
- **PostgreSQL 15 or newer**, with two databases: one for development and one for tests.
- **Supabase** (optional): a project with a **private** Storage bucket, for passage media. Without it the API still runs, but uploads fail and `mediaUrl` is `null`.

## Installation

Run every command in this README from the `backend/` folder.

```bash
cd backend
npm install
```

## Environment variables

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in the values:

   | Variable                    | Required  | Meaning                                                                                                                                             |
   | --------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`              | Yes       | Development database, e.g. `postgresql://<user>:<password>@localhost:5432/ieltstudy_dev`                                                            |
   | `TEST_DATABASE_URL`         | For tests | Test database, e.g. `postgresql://<user>:<password>@localhost:5432/ieltstudy_test`. The tests wipe it, so it must be different from `DATABASE_URL`. |
   | `JWT_SECRET`                | Yes       | Secret for signing login tokens. Use a long random string.                                                                                          |
   | `PORT`                      | No        | HTTP port. Default `3000`.                                                                                                                          |
   | `SUPABASE_URL`              | No        | Project origin only, e.g. `https://<project>.supabase.co`, from Project Settings → API.                                                             |
   | `SUPABASE_SERVICE_ROLE_KEY` | No        | Service role key from the same page. It bypasses all access rules, so keep it on the server.                                                        |
   | `SUPABASE_STORAGE_BUCKET`   | No        | Name of the private bucket, e.g. `media`.                                                                                                           |
   | `SEED_PASSWORD`             | For seed  | Password for the demo accounts created by `npm run seed`. At least 8 characters.                                                                    |

3. Generate a value for `JWT_SECRET` and paste it into `.env`:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

Never commit `.env`. Document new variables in [`.env.example`](.env.example).

## Database setup

1. Create the two databases. The names must match the URLs in your `.env`.

   ```bash
   createdb ieltstudy
   createdb ieltstudy-test
   ```

2. Apply the migrations to the development database:

   ```bash
   npm run db:migrate
   ```

3. Check that the database matches the schema:

   ```bash
   npm run db:verify
   ```

4. Load the demo data: the skill taxonomy, the 30-question diagnostic, three approved courses and one account per role.

   ```bash
   npm run seed
   ```

   The seed only runs on an empty, freshly migrated database. All three accounts use the password from `SEED_PASSWORD`:

   | Email                      | Role       |
   | -------------------------- | ---------- |
   | `admin@ieltstudy.dev`      | admin      |
   | `instructor@ieltstudy.dev` | instructor |
   | `learner@ieltstudy.dev`    | learner    |

You don't need to migrate the test database yourself, because `npm test` does it.

## Running locally

```bash
npm run dev     # development: restarts when a file changes
npm start       # without file watching
```

- Server: <http://localhost:3000> (or your `PORT`). `GET /` returns `{ "message": "Server is OK!" }`.
- API base URL: `http://localhost:3000/api/v1`

## API documentation

- **Swagger UI:** <http://localhost:3000/api-docs> (while the server is running).
- **OpenAPI file:** [`src/docs/openapi.yaml`](src/docs/openapi.yaml). It is the API contract and the reference for every endpoint, request and response. Update it in the same change as any endpoint.

**Authenticating requests:**

1. Log in, or register with `POST /api/v1/auth/register` (new accounts are learners):

   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "learner@ieltstudy.dev", "password": "<SEED_PASSWORD>"}'
   ```

2. Copy the `token` from the response and send it with every protected request:

   ```bash
   curl http://localhost:3000/api/v1/me -H "Authorization: Bearer <token>"
   ```

   In Swagger UI, click **Authorize** and paste the token. Tokens expire after one day.

## Tests and checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint on src/
npm test            # vitest + supertest
npm run format      # Prettier (rewrites files)
```

Run the first three before every pull request:

```bash
npm run typecheck && npm run lint && npm test
```

**The test database:** tests need `TEST_DATABASE_URL` (see [Database setup](#database-setup)). They run against that real PostgreSQL database: each run applies the migrations once, every test starts from an empty database, and test files run one at a time. Tests never call Supabase. The `SUPABASE_*` variables are blanked and a fake storage module is used instead.

## Project structure

```text
backend/
  src/
    server.ts       # starts the HTTP server
    app.ts          # Express app: middleware, Swagger UI, routes, 404 and error handler
    routes/         # one router per resource; runs the Joi validators, then the controller
    controllers/    # reads validated input, calls services, sends the response
    services/       # business rules (course access, grading, attempts, stats) and response builders (*-views.ts)
    middlewares/    # authenticate (JWT) and authorize(...roles)
    utils/          # Joi schemas, validators, httpError, JWT and database helpers
    prisma/         # schema.prisma (source of truth), generated contract, db client, seed
    docs/           # openapi.yaml
    test/           # test helpers: database reset, test data, fake storage
  migrations/       # Prisma 8 migrations
```

Tests (`*.test.ts`) sit next to the code they cover. For conventions and code patterns, see [`CLAUDE.md`](CLAUDE.md).

## Key behavior

These are summaries. The exact requests and responses are in the OpenAPI file.

- **Roles:** `learner` (the default on register), `instructor` and `admin`. Admins change roles and deactivate accounts, but not their own (`409`). A deactivated account gets `401` on every request.
- **Course review flow:**
  - An instructor creates a course as `draft` and submits it for review (`pending_review`).
  - An admin approves it (`approved`, now visible to learners) or rejects it with feedback (`rejected`).
  - The instructor can edit a course only while it is `draft` or `rejected`, and can resubmit a rejected course.
  - Withdrawing moves a `pending_review` or `approved` course back to `draft`.
  - The instructor or an admin can archive a course at any time. Only draft courses without enrolled learners can be deleted.
- **Quiz submission rules:**
  - Learners never see answer keys, explanations or skill weights.
  - Starting a quiz resumes the learner's open attempt if there is one. A learner has at most one open attempt per quiz.
  - Each learner can complete the diagnostic only once.
  - On submit, the server grades every answer and logs the responses in one transaction. A skipped question counts as wrong. An attempt can be submitted only once (`409`), even when two requests arrive together.
- **Error responses:** every error has the same shape:

  ```json
  { "error": { "message": "Course not found" } }
  ```

  Validation errors (`400`) also include `details`. The other codes are `401` (not logged in), `403` (not allowed), `404` (not found, also used for content you aren't allowed to see) and `409` (conflicts with the current state). When `NODE_ENV` is set to anything other than `development`, `500` errors only say `Internal Server Error`.

For more detail, see [`../docs/ERD.md`](../docs/ERD.md) (data model and invariants) and [`../docs/plans/phase-2-core-apis.md`](../docs/plans/phase-2-core-apis.md) (design decisions).

## Troubleshooting

| Problem                                                                         | Fix                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_UNKNOWN_FILE_EXTENSION` for `.ts`, or `Temporal is not defined`            | Your Node.js is too old. Install 26.8.2 or newer.                                                                                                             |
| `JWT_SECRET is not set`                                                         | Add `JWT_SECRET` to `backend/.env`.                                                                                                                           |
| `TEST_DATABASE_URL is not set`                                                  | Create the test database and add its URL to `backend/.env`.                                                                                                   |
| `TEST_DATABASE_URL must point at a different database than DATABASE_URL`        | Use a separate database for tests, because they wipe it on every run.                                                                                         |
| `Could not migrate the test database`                                           | Check that the test database exists and that `TEST_DATABASE_URL` is correct. The Prisma output above the message shows the cause.                             |
| `The database already has data. Seed only runs on a freshly migrated database.` | Drop and recreate the development database, then run `npm run db:migrate` and `npm run seed` again.                                                           |
| `Supabase Storage is not configured`                                            | Set the three `SUPABASE_*` variables. You can ignore this if you don't need uploads.                                                                          |
| Storage answers `Invalid path specified in request URL`                         | `SUPABASE_URL` must be the project origin only. Remove any `/rest/v1/` after it.                                                                              |
| `npm run db:verify` reports drift                                               | The database doesn't match the schema. Run `npm run db:migrate`.                                                                                              |
| Types are out of date after editing `schema.prisma`                             | Run `npm run contract:emit`, then `npm run migration:plan` and `npm run db:migrate`. Schema changes need approval first (see [`../CLAUDE.md`](../CLAUDE.md)). |

## Deployment

The hosted setup (Docker, Render, Vercel and the GitHub Actions workflows) is in [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md). CORS, helmet and rate limiting are planned for Phase 7 (see [`../docs/ROADMAP.md`](../docs/ROADMAP.md)). With what exists today, a deploy to a server works like this:

1. Install Node.js 26.8.2 or newer. There is no build step: Node runs the TypeScript source directly.
2. Install the dependencies:

   ```bash
   npm ci
   ```

3. Set the variables from [Environment variables](#environment-variables), plus `NODE_ENV=production` so `500` errors don't leak internal messages. `TEST_DATABASE_URL` and `SEED_PASSWORD` aren't needed.
4. Apply the migrations. `--yes` skips the confirmation prompt.

   ```bash
   npm run db:migrate -- --yes
   ```

5. Start the server:

   ```bash
   npm start
   ```
