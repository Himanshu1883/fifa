# Deploy: Railway Postgres + Vercel (Next.js)

This app uses **Prisma ORM 7** with **PostgreSQL** only (`prisma/schema.prisma`). Connection strings live in `prisma.config.ts` (CLI / migrations) and in `DATABASE_URL` at runtime (`@prisma/adapter-pg` + `pg`).

### Architecture (full-stack Next.js)

This repo is a **single Next.js app**: **UI, API routes, middleware, and Prisma** all run on **Vercel**. There is no separate Node “API server” to deploy—the **backend** in production terms is **PostgreSQL hosted on Railway**. Vercel serverless functions invoke Prisma using **`DATABASE_URL`** pointing at Railway’s **public** Postgres URL (`?sslmode=require` as needed).

### What you do vs what’s automatic

| You (dashboards — your Railway + Vercel accounts) | From your machine / automation (after `DATABASE_URL` exists) |
|---------------------------------------------------|----------------------------------------------------------------|
| Create **PostgreSQL** on Railway, copy the **public** `DATABASE_URL`, paste it into Vercel as **`DATABASE_URL`**. | Run **`npx prisma migrate deploy`** with `DATABASE_URL` set (shell or CI). Default **`npm run build`** does **not** run migrations unless you override the Vercel build command — see [§5](#5-prisma-migrations-first-deploy-and-ongoing). |
| Generate **`AUTH_SECRET`** (e.g. `openssl rand -base64 32`), add it on Vercel for **Production** and **Preview**. | Optional: seed data with **`npx prisma db seed`**. |
| **Import** the GitHub repo on Vercel and **deploy** / **redeploy** after env changes. | Same DB URL works for local scripts; never commit `.env` or tokens. |

**No CLI required for first deploy** if the repo is already on GitHub: use **Vercel → Add Project → Import** from Git. Commands like **`npx vercel link`** are **interactive** — avoid them in non-interactive environments. **Dashboard steps always need your login**; this doc does not deploy the project for you.

Optional: `scripts/deploy-notes.sh` echoes the same high-level reminders (no secrets).

### Vercel + Railway (quick)

1. **Railway:** Create **PostgreSQL** → copy the **public** `DATABASE_URL` (Vercel must not use `*.railway.internal`). Add `?sslmode=require` if connections fail.
2. **Vercel:** Project → **Settings** → **Environment Variables** — add for **Production** and **Preview** (same names in each; duplicate if Vercel does not auto-copy):
   - **`DATABASE_URL`** — required  
   - **`AUTH_SECRET`** — required (random string, **32+ characters**; e.g. `openssl rand -base64 32`)
3. **Schema:** Before the app can use the DB, run migrations **once** with that database: locally `DATABASE_URL=… npx prisma migrate deploy`, *or* set Vercel **Build Command** to `prisma generate && prisma migrate deploy && next build` (needs `DATABASE_URL` at build time). Default `npm run build` does **not** run `migrate deploy`.
4. **Deploy:** Import the GitHub repo in Vercel and deploy; **redeploy** after changing env vars.

Details, troubleshooting, and the optional **`fifa`** repo checklist are below.

## GitHub / Vercel / Railway (fifa)

Use this checklist when publishing to a GitHub repo named **`fifa`** and wiring the same tree to Vercel + Railway Postgres.

### 1. Create the GitHub repository `fifa`

**In the GitHub UI**

1. [github.com/new](https://github.com/new) → Repository name: **`fifa`**.
2. Choose public or private; **do not** add a README, `.gitignore`, or license if you are pushing an existing project (avoids merge conflicts).
3. Create repository.

**Optional (GitHub CLI)**

```bash
gh repo create fifa --private --source=. --remote=origin --push
# or public:
# gh repo create fifa --public --source=. --remote=origin --push
```

If you already have commits locally and only need the empty repo + remote:

```bash
gh repo create fifa --private --remote=origin
```

### 2. Connect local tree and push (`/Users/shubkumar/eventdetail`)

From the repo root, add `origin` if it is missing, ensure the default branch is `main`, then push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/fifa.git
git branch -M main
git push -u origin main
```

**Before pushing:** commit everything you intend to ship (see `git status`). **Do not** commit `.env`, `.env.local`, real connection strings, or `AUTH_SECRET`. This project ignores `.env*` via `.gitignore` except `.env.example`.

**Avoid committing by accident**

- Local DB files such as `dev.db` (legacy / local SQLite) — keep untracked or delete if unused.
- Any file under `prisma/catalogues/` if it contains sensitive snapshots (only commit if you intend to version them).

**No remote yet / first push:** the commands above are safe for an initial push. **Do not** `git push --force` to `main` without confirming with collaborators—force overwrites history on the remote.

**Troubleshooting — “My repo doesn’t show under GitHub → Repositories”:** GitHub only lists repositories that exist on GitHub.com and that your logged-in account can see. A folder on your laptop with `.git` is not automatically there—you need an empty repo created on GitHub (or via `gh repo create`) **and** at least one successful `git push` to `origin`. If you already pushed elsewhere, check **GitHub → profile (top right) → Your repositories** vs another org/account, confirm **private** repos aren’t hidden by filters, and run **`git remote -v`** locally: no `origin` or a URL under a different user/org usually explains a mismatch.

### 3. Vercel (Next.js frontend + API routes)

1. [Vercel Dashboard](https://vercel.com/dashboard) → **Add New…** → **Project** → **Import** `YOUR_USERNAME/fifa`.
2. **Framework Preset:** Next.js. **Root Directory:** `.` (repository root).
3. **Build command:** leave default **`npm run build`** (see `package.json`: `prisma generate && next build`). **Install command:** default `npm install` (`postinstall` runs `prisma generate`).
4. **Environment variables** (Production **and** Preview — duplicate as needed):

   | Variable         | Notes |
   |------------------|--------|
   | `DATABASE_URL`   | Railway **public** Postgres URL; append `?sslmode=require` if connections fail without TLS. |
   | `AUTH_SECRET`    | Random string, **32+ characters** (e.g. `openssl rand -base64 32`). |

5. **Node.js:** use **20.x or newer** on Vercel if prompted (matches `engines` / local dev expectations).

After the first successful deploy, **redeploy** if you change `AUTH_SECRET` or `DATABASE_URL` so serverless bundles pick up new values.

### 4. Railway (PostgreSQL only)

1. [Railway](https://railway.app) → **New Project** → **Database** → **PostgreSQL**.
2. Open the Postgres service → **Variables** / **Connect** → copy **`DATABASE_URL`** (or the **public** connection URL Vercel can reach—not `*.railway.internal`).
3. Paste into Vercel as **`DATABASE_URL`** (all capitals). Ensure the URL includes a **database name** path after the host and port, and add **`?sslmode=require`** if required (see [Railway: PostgreSQL](#railway-postgresql) below).

You may also run the app or ad-hoc scripts against this database from your laptop using the same `DATABASE_URL`.

### 5. Prisma migrations (first deploy and ongoing)

The **`build`** script in `package.json` runs **`prisma generate`** then **`next build`** — it does **not** run **`prisma migrate deploy`**. Apply migrations using **one** of these patterns:

| Approach | When |
|----------|------|
| **Local (recommended before first Vercel deploy)** | `export DATABASE_URL="postgresql://…?sslmode=require"` then `npx prisma migrate deploy`. |
| **Vercel Build Command override** | Set to: `prisma generate && prisma migrate deploy && next build` (requires `DATABASE_URL` at **build time** on Vercel). |
| **CI** | Run `npx prisma migrate deploy` in a pipeline step with `DATABASE_URL` set, before or after deploy. |

Until migrations have been applied at least once, the app may fail at runtime when Prisma touches missing tables.

## Prerequisites

- Node 20+ (match Vercel runtime if possible)
- Railway account and Vercel account
- This repo connected to Vercel (Git integration or CLI)

## Railway: PostgreSQL

1. In [Railway](https://railway.app), create a **New Project** (or open an existing one).
2. Add a **Database** → **PostgreSQL** (the managed Postgres plugin/service).
3. When the database is provisioned, open the Postgres service → **Variables** (or **Connect**).
4. Copy **`DATABASE_URL`** (or **Postgres URL** / **Connection URL**). Use a **public** URL Vercel can reach—not a `*.railway.internal` host (private to Railway's network). Railway **TCP / public** URLs usually look like:
   - `postgresql://USER:PASSWORD@HOST:PORT/railway`
   The path after the port **must be the database name** (often `railway`). A URL that stops at `:PORT` with no `/dbname` leads to Prisma **P1010** with database **`(not available)`**.
5. **SSL:** Hosted Postgres almost always requires TLS. If your client fails to connect, append query parameters to the URL, for example:
   - `?sslmode=require`
   - Full example shape: `postgresql://USER:PASSWORD@HOST:PORT/railway?sslmode=require`
   Keep the password URL-encoded if it contains special characters.

You can use this same database for **local development** (simplest alignment with production) or create a second Railway Postgres instance for dev-only data.

## Apply schema (migrations)

After the database exists, apply migrations from your machine (or any environment with `DATABASE_URL` set to that database):

```bash
export DATABASE_URL="postgresql://…?sslmode=require"
npx prisma migrate deploy
```

Optional seed:

```bash
npx prisma db seed
```

The seed creates default events/categories and an app login user whose password is set only in the seed script (hashed in the database — never stored as plaintext in the DB or in this doc).

### Data: local PostgreSQL → empty Railway

Choose **one** path:

| Situation | Steps |
|-----------|--------|
| **Railway can match seed** (catalogue JSON in repo, no unique local rows you need to keep) | On your machine: `export DATABASE_URL="<Railway public URL>"` then `npx prisma migrate deploy` and `npx prisma db seed`. The seed **deletes all events** and recreates them — do not run it after a manual dump if you want to keep dumped rows. |
| **Local DB has data you must preserve** | Run `npx prisma migrate deploy` against Railway first (schema must match migrations). Then from the repo root set **`SOURCE_DATABASE_URL`** (Postgres that has your rows) and **`TARGET_DATABASE_URL`** (Railway public URL), then either **`TRUNCATE_TARGET=1 ./scripts/pg-copy-app-data.sh`** (needs `pg_dump` / `psql`) **or** **`TRUNCATE_TARGET=1 npm run db:copy:railway`** (Node/`pg` only). Both copy **`users`**, **`"Event"`**, **`"EventCategory"`**, **`event_category_block_prices`**, and **`event_seat_listings`**. |

Verify row counts without exposing secrets: `DATABASE_URL="<Railway>" npx tsx scripts/db-row-counts.ts` (prints JSON counts only).

**No separate “API server” on Railway is required** for this repo: Next.js **API routes on Vercel** are the backend; they already use **`DATABASE_URL`** to reach Railway Postgres. Do **not** set **`NEXT_PUBLIC_*`** API base URLs unless you split the frontend onto a different origin and change fetches to absolute URLs (that complicates cookies, CORS, and `SameSite`). Deploying a **second** full Next.js app on Railway “next to” the DB is duplicative—only consider it if you need a non-Vercel edge or long-lived Node processes; if you do, align session cookies and hostnames deliberately so you do not break Vercel-only auth.

## Vercel: Next.js app

1. Import the Git repository into Vercel and create a project.
2. **Environment variables** (set per Vercel **environment**):

   | Variable         | Environments              | Required | Notes |
   |-----------------|---------------------------|----------|--------|
   | `DATABASE_URL`  | Production **and** Preview | Yes      | Same variable name in each; use your real Postgres URL (see Railway shape below). Add **Development** too if you run `vercel dev`. |
   | `AUTH_SECRET`   | Same as `DATABASE_URL`     | Yes      | Random string **32+ characters** used to sign session cookies (`jose` HS256). Generate locally e.g. `openssl rand -base64 32`. |

   The runtime and `src/lib/prisma.ts` read **`DATABASE_URL` only** (not `POSTGRES_URL`, `PRISMA_DATABASE_URL`, etc.). Names must match exactly or the app will throw a clear error.

   **Production vs Preview:** Vercel does not copy Production env into Preview. If `DATABASE_URL` is only set for Production, **Preview deployments and branch URLs will fail** at runtime (or show Prisma **P1010** if the URL is wrong). Duplicate the variable for Preview (same value, or a separate Preview database).

   You do **not** need separate `POSTGRES_HOST` / `POSTGRES_PASSWORD` variables unless you assemble the URL yourself; a single **`DATABASE_URL`** is enough for this codebase.

3. **Build command:** use the default from `package.json` (**`npm run build`** → `prisma generate && next build`). To run migrations **during** every Vercel build, override the build command to:

   ```bash
   prisma generate && prisma migrate deploy && next build
   ```

   That override requires **`DATABASE_URL`** at **build time**. Otherwise run **`npx prisma migrate deploy`** locally (or in CI) against the same database — see [GitHub / Vercel / Railway (fifa) — §5](#5-prisma-migrations-first-deploy-and-ongoing).

4. **Install command:** default `npm install` is fine (`postinstall` runs `prisma generate`).

5. Deploy.

### Serverless and connection pooling

Vercel functions are short-lived; avoid opening unbounded connections. If Railway exposes a **pooled** connection string (PgBouncer / pooler URL), prefer that for **`DATABASE_URL`** in Vercel. If you split **direct** (migrations) vs **pooled** (runtime), set:

- **`DATABASE_URL`** — pooled URL on Vercel for the running app  
- **`DIRECT_DATABASE_URL`** (or similar) — only if you customize `prisma.config.ts` so `migrate` uses the direct URL  

The stock repo uses one variable for both CLI and runtime; simplest path is **one Railway URL that works from Vercel** (often already pooled or Railway’s public URL).

## AUTH_SECRET — session signing

Session cookies are signed with **HS256** (`jose`). Set **`AUTH_SECRET`** in every environment to a random string of **at least 32 characters**.

**Generate locally:**

```bash
openssl rand -base64 32
```

**Vercel:** Project → **Settings** → **Environment Variables** → add `AUTH_SECRET` for Production (and Preview if you use preview URLs). **Save, then redeploy** (Deployments → ⋮ → Redeploy, or push a new commit) so serverless functions pick up the value.

**Local:** Add the same variable to `.env` or `.env.local` (copy from [`.env.example`](./.env.example)). Restart `npm run dev` after changing it.

Running the app without a valid secret shows an in-browser help page at **`/docs/auth-secret`** (Markdown excerpt from this section).

Optional **local-only** escape hatch (never enable in production): if `NODE_ENV` is `development`, you may set **`ALLOW_INSECURE_DEV_AUTH=1`** in `.env` to use a fixed dev-only secret when `AUTH_SECRET` is unset. Prefer setting a real `AUTH_SECRET` instead.

## Local development

Set `DATABASE_URL` to Postgres (Docker, Railway TCP proxy, or a local install). Example Docker:

```bash
docker run --name eventdetail-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
export AUTH_SECRET="$(openssl rand -base64 32)"
npx prisma migrate deploy
npm run dev
```

See [AUTH_SECRET — session signing](#auth-secret--session-signing) if sign-in fails or the login page warns about a missing secret.

### SQLite

Earlier versions used SQLite with `better-sqlite3`. **`prisma/schema.prisma` is PostgreSQL-only** (Prisma 7 does not support dual providers in one schema). Use Postgres locally or in the cloud instead of `file:` URLs.

## Operational notes

- **Migrations:** committed SQL is under `prisma/migrations/`. Use `prisma migrate dev` locally when you change the schema; use `prisma migrate deploy` in CI/Vercel builds.
- **Runtime:** Pages and API routes that use Prisma should set `export const runtime = "nodejs"` (Edge is not used for DB access).

### Troubleshooting: `P1010` / database `(not available)`

**P1010** is Prisma’s “user was denied access on the database” code—often a bad connection string, wrong DB name, or credentials, not only permission grants. With PostgreSQL, the message **database `(not available)`** usually means the client never got a usable database name (e.g. the URL has no `/dbname` after the host:port, or only works inside a private network).

Before Prisma runs, `src/lib/prisma.ts` validates `DATABASE_URL` (non-empty, `postgresql://…`, includes hostname and database path, rejects `*.railway.internal` when `VERCEL=1`). If you still see **P1010** after that, check **SSL** (`?sslmode=require`), password URL-encoding, and that the DB user can connect to that database name.

**Checklist:** URL shape `postgresql://USER:PASS@HOST:PORT/dbname?sslmode=require` · variable name **`DATABASE_URL`** · set on **Preview** if you use preview URLs · public Railway host, not `*.railway.internal`, from Vercel.
