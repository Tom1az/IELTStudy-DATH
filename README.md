# IELTStudy

IELTStudy is an adaptive IELTS learning platform with a TypeScript/Express
backend and a Next.js frontend.

This guide explains how to run the main application locally. You do not need
to run the optional `advanced/` or `ml/` folders for the normal learner,
instructor, or admin web experience.

## 1. Install the prerequisites

Install the following software before starting:

- **Node.js 26.8.2 or newer** (the backend runs TypeScript directly)
- **npm** (included with Node.js)
- **PostgreSQL 15 or newer**
- **Git**, if you are cloning the repository

Check your versions:

```bash
node --version
npm --version
psql --version
```

## 2. Open the project

Clone the repository and enter its folder:

```bash
git clone https://github.com/Tom1az/IELTStudy-DATH.git
cd IELTStudy-DATH
```

If you already downloaded the project, open a terminal in the project folder
instead.

## 3. Prepare the backend database

The backend needs two separate PostgreSQL databases:

- `ieltstudy` for normal development
- `ieltstudy-test` for automated tests

Create them with:

```bash
createdb ieltstudy
createdb ieltstudy-test
```

If your PostgreSQL user or password is different, use connection strings
matching your local PostgreSQL setup in the next step.

## 4. Configure the backend

Open a new terminal in the project folder and run:

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and set at least these values:

```env
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/ieltstudy"
TEST_DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/ieltstudy-test"
JWT_SECRET="use-a-long-random-secret"
SEED_PASSWORD="choose-a-password-at-least-8-characters"
```

You can generate a suitable JWT secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Keep `DATABASE_URL` and `TEST_DATABASE_URL` pointed at different databases.
Tests clear the test database.

> Supabase is optional. The API can run without it, but passage media uploads
> will not work until `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
> `SUPABASE_STORAGE_BUCKET` are configured. Keep the service-role key only in
> `backend/.env`, never in the frontend.

## 5. Install and initialize the backend

Run these commands from `backend/`:

```bash
npm install
npm run db:migrate
npm run db:verify
npm run seed
```

The seed creates the skill taxonomy, diagnostic questions, sample courses, and
demo accounts. All demo accounts use the `SEED_PASSWORD` from `backend/.env`:

| Account | Role |
| --- | --- |
| `learner@ieltstudy.dev` | Learner |
| `instructor@ieltstudy.dev` | Instructor |
| `admin@ieltstudy.dev` | Admin |

## 6. Start the backend

Keep the terminal in `backend/` and run:

```bash
npm run dev
```

The API should be available at:

- API: <http://localhost:3000>
- Swagger documentation: <http://localhost:3000/api-docs>

Check that it is running by opening <http://localhost:3000> or by running:

```bash
curl http://localhost:3000
```

Leave this terminal running.

## 7. Install and start the frontend

Open a **second terminal** in the project folder:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The web application should be available at:

<http://localhost:3001>

The frontend sends `/api/v1` requests through its Next.js proxy to the
backend at `http://localhost:3000`. That is why the backend must be running
before using the website.

## 8. Try the application

1. Open <http://localhost:3001>.
2. Log in with one of the seeded accounts above.
3. Use the learner account to browse courses, enrol, study lessons, and take
   quizzes.
4. Use the instructor account to open the instructor area.
5. Use the admin account to review courses and manage users.

New users can register from the website. New registrations are learners by
default.

## 9. Run checks

Run backend checks from `backend/`:

```bash
npm run typecheck
npm run lint
npm test
```

Run frontend checks from `frontend/`:

```bash
npm run typecheck
npm run lint
npm test
```

Frontend end-to-end tests require the backend to be running. Install the
Playwright browser once, then run the tests:

```bash
npx playwright install chromium
npm run test:e2e
```

## Optional folders

### `advanced/`

This is a separate Node.js/TypeScript service for advanced BKT and evaluation
work. It is not required for the main frontend.

```bash
cd advanced
npm install
npm run typecheck
npm test
npm run eval
npm run dev
```

Before starting the service, create an `advanced/.env` file containing
`DATABASE_URL`, `JWT_SECRET`, and optionally `PORT=4001`. You can reuse the
development database and JWT secret from `backend/.env`. Its default port is
4001. See [`advanced/README.md`](advanced/README.md) for more details.

### `ml/`

This contains the offline Python modelling and simulation pipeline. It uses
the repository virtual environment:

```bash
source .venv/bin/activate
```

See [`ml/README.md`](ml/README.md) for the available pipeline steps.

## Common problems

### `createdb: command not found`

Install PostgreSQL and make sure its command-line tools are on your `PATH`.
You can also create the databases using a PostgreSQL GUI such as pgAdmin.

### Database authentication or connection errors

Check that PostgreSQL is running and that the username, password, host, port,
and database names in `backend/.env` are correct.

### The frontend says the API is unavailable

Make sure the backend is still running in the first terminal on port 3000.
If you changed the backend port, update `BACKEND_URL` in
`frontend/.env.local`.

### Seed data already exists

The seed is intended for a fresh, migrated development database. Use an empty
development database for a first setup rather than running the seed repeatedly.

## Useful project files

- [`backend/README.md`](backend/README.md): detailed API and database notes
- [`frontend/README.md`](frontend/README.md): frontend architecture and test notes
- [`specs.md`](specs.md): product and technical specification
- [`docs/ROADMAP.md`](docs/ROADMAP.md): implementation progress
