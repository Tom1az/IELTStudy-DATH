# Deployment

CI runs on every pull request and on pushes to `main` and `develop`. CD deploys `main` after CI passes.

| Part | Where | How it deploys |
| --- | --- | --- |
| Frontend | Vercel | Vercel CLI in `.github/workflows/cd.yml`, which reads `BACKEND_URL` when it builds |
| Backend (API, BKT and recommendations) | Render, Docker (`backend/Dockerfile`) | Render deploy hook |
| Database and media | Supabase | Migrations run in CD before the backend deploys |
| Email (password reset) | Brevo HTTP API | `MAIL_API_KEY`, `MAIL_FROM` on Render |

Until the setup below is done, the CD workflow skips itself and only CI runs.

## One-time setup

### 1. Supabase

1. Create a project and a private Storage bucket named `media`.
2. Copy the session pooler connection string (Connect, Session pooler). GitHub runners have no IPv6, so the direct connection string may not work from CD.
3. From `backend/`, migrate and seed once. `npm run seed` needs `SEED_PASSWORD`, at least 8 characters:

   ```bash
   DATABASE_URL="<pooler url>" npx prisma db migrate --db "<pooler url>" --yes
   DATABASE_URL="<pooler url>" SEED_PASSWORD="<password>" npm run seed
   ```

### 2. Render

1. New, Blueprint, then connect this repository. `render.yaml` creates `ieltstudy-backend`.
2. Fill in the variables Render asks for:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase URL |
   | `JWT_SECRET` | one long random string |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | from Supabase |
   | `APP_URL` | the Vercel URL, for links in emails (no trailing slash) |
   | `MAIL_API_KEY`, `MAIL_FROM` | from Brevo (section 5). Without them the reset link is only logged |
   | `CORS_ORIGINS` | leave empty: the frontend calls the API through its own `/api/v1` proxy |

3. Open Settings and copy the Deploy Hook URL.

On the free plan the service sleeps when idle and takes about a minute to wake. Open the service URL before a demo.

### 3. Vercel

1. Create a project from this repository. Leave Root Directory empty, because CD runs the Vercel CLI inside `frontend/`.
2. Turn off automatic deployments (Settings, Git, Ignored Build Step: `exit 0`), so only CD deploys.
3. Add the production variable `BACKEND_URL`, the Render URL. Rewrites are fixed at build time, so redeploy after changing it.
4. Create an access token, and copy the Org ID and Project ID from `frontend/.vercel/project.json` after running `vercel link`.

### 5. Brevo (email)

1. Create a free Brevo account (no domain needed; 300 emails a day).
2. Senders, Domains & Dedicated IPs → Senders → add and verify the address that sends the emails. That is `MAIL_FROM`.
3. SMTP & API → API keys → generate a key. That is `MAIL_API_KEY`. The backend calls the HTTP API, not SMTP, so Render's blocked SMTP ports don't matter.

### 4. GitHub

In the repository settings, create an environment named `production`, then add:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `PRODUCTION_DATABASE_URL` | the Supabase pooler URL |
| Secret | `RENDER_BACKEND_DEPLOY_HOOK` | deploy hook of the backend |
| Secret | `VERCEL_TOKEN` | Vercel access token |
| Secret | `VERCEL_ORG_ID` | from `project.json` |
| Secret | `VERCEL_PROJECT_ID` | from `project.json` |
| Variable | `DEPLOY_ENABLED` | `true`, at repository level |

`DEPLOY_ENABLED` is what turns CD on. GitHub only runs the CD workflow once `cd.yml` is on the default branch.

## After a deploy

Render deploys in the background after the hook returns, so a green CD run means the deploy started. Check `https://<service>.onrender.com/` and log in on the Vercel URL.

To change the Node version, update `.node-version` and `backend/Dockerfile` together.
