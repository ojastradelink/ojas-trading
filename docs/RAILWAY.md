# Deploying Ojas Trading to Railway

A step-by-step guide to run this monorepo on [Railway](https://railway.app) via GitHub
auto-deploy. Every push to `main` redeploys.

## Architecture

One Railway **project** with three services:

| Service      | Source                | Notes                                                        |
| ------------ | --------------------- | ----------------------------------------------------------- |
| **Postgres** | Railway plugin        | Managed database; provides `DATABASE_URL`.                  |
| **api**      | `apps/api/Dockerfile` | NestJS. Runs `prisma migrate deploy` + seed on boot.        |
| **web**      | `apps/web/Dockerfile` | Next.js 15 standalone.                                       |

> **Object storage (MinIO/S3) is intentionally not deployed yet.** The AWS SDK is a
> dependency but no module uses it — document/avatar storage isn't built. Add a MinIO
> service only when that feature lands (see the appendix). Nothing breaks without it.

## What was already prepared in the repo

- `apps/api/src/config/configuration.ts` — API now binds to Railway's injected `PORT`.
- `apps/api/package.json` `start:prod` — runs `prisma migrate deploy`, then the
  (idempotent) seed, then starts the server. First deploy seeds everything; later
  deploys are no-ops.
- `apps/web/Dockerfile` — takes `NEXT_PUBLIC_API_URL` as a build arg (Next inlines
  `NEXT_PUBLIC_*` at **build** time).
- `apps/web/next.config.ts` — `outputFileTracingRoot` pinned to the repo root so the
  standalone build emits `apps/web/server.js`.
- `.dockerignore` — keeps `node_modules`, `.next`, and **dev `.env` files** out of images.
- `apps/{api,web}/railway.json` — per-service Dockerfile build + healthcheck config.

---

## Step 1 — Push to GitHub

The repo is already `git init`'d with a clean first commit. Create an **empty** GitHub
repo (no README/…), then:

```bash
cd "C:/Coding/Ojas Trading"
git remote add origin https://github.com/<you>/ojas-trading.git
git push -u origin main
```

## Step 2 — Create the Railway project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** →
   pick your repo. Authorize Railway for the repo if prompted.
2. Railway creates one service from the repo. You'll reconfigure it as **api** and add
   **web** next.

## Step 3 — Add PostgreSQL

Project canvas → **+ New** → **Database** → **Add PostgreSQL**. It exposes a
`DATABASE_URL` you reference below. (Default service name: `Postgres`.)

## Step 4 — Configure the **api** service

Open the service → **Settings**:

- **Service name:** `api`
- **Root Directory:** `/` (repo root — the Dockerfiles build from repo root; do **not**
  set it to `apps/api`, or the Dockerfile's `COPY package.json` step can't see the root)
- **Force the Dockerfile build.** By default Railway uses its Railpack/Nixpacks
  auto-detector, which builds the whole monorepo and fails with *"No start command
  detected"*. Pick one:
  - add a **Variable** `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` (most reliable), **or**
  - Settings → Build → Builder = **Dockerfile**, Dockerfile Path = `apps/api/Dockerfile`, **or**
  - set the Railway config file path to `apps/api/railway.json`.
- **Networking → Generate Domain** (creates `api-*.up.railway.app`)

**Variables** (Settings → Variables → Raw Editor):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
JWT_ACCESS_SECRET=<paste a strong secret>
JWT_REFRESH_SECRET=<paste a different strong secret>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
WEB_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
SEED_ADMIN_EMAIL=admin@ojastrading.com
SEED_ADMIN_PASSWORD=<choose a strong admin password>
```

Generate secrets with `openssl rand -base64 48` (or `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).
**Do not** set `PORT` — Railway injects it.

## Step 5 — Configure the **web** service

Project canvas → **+ New** → **GitHub Repo** → same repo (this is the second service).
Then **Settings**:

- **Service name:** `web`
- **Root Directory:** `/`
- **Force the Dockerfile build** (same as the api service): add a **Variable**
  `RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile`, or set Builder = Dockerfile with
  Dockerfile Path = `apps/web/Dockerfile`, or point the config file at `apps/web/railway.json`.
- **Networking → Generate Domain** (creates `web-*.up.railway.app`)

**Variables:**

```
NEXT_PUBLIC_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1
NODE_ENV=production
```

`NEXT_PUBLIC_API_URL` is read at **build** time; the Dockerfile declares a matching
`ARG`, so Railway passes it into the build automatically. If you change it later, you
must **redeploy** the web service for it to take effect.

## Step 6 — Wire the two domains together, then redeploy

The api (`WEB_ORIGIN`) and web (`NEXT_PUBLIC_API_URL`) reference each other's domains.
Once **both** services have a generated domain:

1. Confirm both variables resolved (Variables tab shows the expanded URLs).
2. **Redeploy `web`** last, so the correct `NEXT_PUBLIC_API_URL` gets baked into the bundle.

## Step 7 — First deploy: migrations + seed

On the api's first boot, `start:prod` runs `prisma migrate deploy` then the seed. Watch
the **api → Deploy Logs** for:

```
✅ Seed complete.
   Login : admin@ojastrading.com / ...
🚀 Ojas API ready ...
```

The seed is idempotent (upserts + a "deals already present → skip" guard), so redeploys
won't duplicate data.

## Step 8 — Verify

- `https://api-*.up.railway.app/api/v1/health` → `{"status":"ok","db":"up",...}`
- Open `https://web-*.up.railway.app`, log in with the admin email/password you set.
- If login fails with a CORS/network error in the browser console, re-check
  `WEB_ORIGIN` (api) exactly matches the web domain and `NEXT_PUBLIC_API_URL` (web) points
  at the api domain **with** `/api/v1`, then redeploy web.

---

## Variable reference

**api**

| Variable            | Value                                    | Notes                        |
| ------------------- | ---------------------------------------- | ---------------------------- |
| `DATABASE_URL`      | `${{Postgres.DATABASE_URL}}`             | From the Postgres plugin     |
| `NODE_ENV`          | `production`                             | Locks CORS to `WEB_ORIGIN`   |
| `JWT_ACCESS_SECRET` | strong random                            | **Required**                 |
| `JWT_REFRESH_SECRET`| strong random (different)                | **Required**                 |
| `JWT_ACCESS_TTL`    | `15m`                                    |                              |
| `JWT_REFRESH_TTL`   | `7d`                                     |                              |
| `WEB_ORIGIN`        | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` | CORS allowlist               |
| `SEED_ADMIN_EMAIL`  | `admin@ojastrading.com`                  | First-deploy admin           |
| `SEED_ADMIN_PASSWORD`| your choice                             | First-deploy admin password  |
| `PORT`              | *(auto)*                                 | Injected by Railway          |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | `smtp.gmail.com` / `465` / `true` | Outgoing mail (contract notes, Mail replies) |
| `SMTP_USER`         | `work.ojasoilstradelink@gmail.com`       | The firm's Gmail             |
| `SMTP_PASS`         | Gmail App Password                       | Google Account → Security → App passwords |
| `MAIL_FROM`         | `"Rajendra Kumar Arun Kumar Brokerage House (OJAS) <work.ojasoilstradelink@gmail.com>"` | Sender shown to recipients |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASS` | *(optional)* | Mail section (Inbox + Sent). With a Gmail `SMTP_HOST` these default to `imap.gmail.com:993` + the SMTP user/App Password |

**web**

| Variable              | Value                                            | Notes              |
| --------------------- | ------------------------------------------------ | ------------------ |
| `NEXT_PUBLIC_API_URL` | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1`  | **Build-time**     |
| `NODE_ENV`            | `production`                                     |                    |
| `PORT`                | *(auto)*                                         | Injected by Railway|

---

## Troubleshooting

- **Build fails with `Railpack … ✖ No start command detected`** — the service is using
  Railway's auto-detector instead of the Dockerfile. Add the variable
  `RAILWAY_DOCKERFILE_PATH` (api → `apps/api/Dockerfile`, web → `apps/web/Dockerfile`) and
  redeploy. Keep Root Directory at the repo root, not the app subfolder.
- **api deploy fails at migrate** — `DATABASE_URL` unset/typo'd, or the Postgres service
  isn't up. Check the reference resolved on the Variables tab.
- **web loads but every API call fails (CORS / Network Error)** — `NEXT_PUBLIC_API_URL`
  was wrong at build time. Fix it and **redeploy web** (it's baked at build).
- **Login 401 right after first deploy** — the seed hasn't finished/failed. Check api
  deploy logs for `✅ Seed complete.` The start command logs `⚠ seed skipped` if it errored.
- **Healthcheck failing** — `/api/v1/health` must return 200. If the app can't reach the
  DB it returns `db:"down"` (still 200); a hard failure means the process didn't start —
  read the deploy logs.

## Appendix — adding MinIO later (when document storage is built)

Add a service from the `minio/minio` Docker image:

- **Image:** `minio/minio:latest`
- **Start command:** `server /data --console-address ":9001"`
- **Volume:** mount at `/data` (persistent storage)
- **Variables:** `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- Create the `ojas-documents` bucket once (via the MinIO console on the `:9001` domain).

Then set these on the **api** service (private networking):

```
S3_ENDPOINT=http://${{minio.RAILWAY_PRIVATE_DOMAIN}}:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=${{minio.MINIO_ROOT_USER}}
S3_SECRET_KEY=${{minio.MINIO_ROOT_PASSWORD}}
S3_BUCKET=ojas-documents
S3_FORCE_PATH_STYLE=true
```
