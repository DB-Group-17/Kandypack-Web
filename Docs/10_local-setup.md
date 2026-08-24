# Kandypack — Local Development Setup

Follow this exactly, in order. The stack depends on three external services (Aiven MySQL, Upstash Redis, Inngest) — skipping a step here is the #1 source of "works on my machine" bugs.

---

## 1. Prerequisites

- **Node.js 20.x LTS** (`node -v` to check)
- **npm** or **pnpm** (pick one and stick with it across the team — recommend `pnpm` for faster installs)
- **Git**
- A **GitHub account** with access to the repo
- *(Optional)* **Docker Desktop** — only needed if you're using the whole-project `docker-compose.yml` self-host option instead of running natively

---

## 2. Clone & Install

```bash
git clone <repo-url>
cd kandypack
pnpm install
```

---

## 3. Get Your Service Credentials

You need accounts/access on three external services. Ask Member 1 or Member 5 for the shared dev credentials if the team is using one shared dev environment (recommended for Phase 0–2, per `task.md`) rather than everyone provisioning their own.

### 3.1 Aiven (MySQL)
- Log in to the shared Aiven project (invite sent separately) or create your own dev service if instructed
- From the service overview page, copy the **connection URI** (includes host, port, user, password, database name)
- Note: Aiven requires `ssl-mode=REQUIRED` — this is already baked into the connection string Aiven gives you

### 3.2 Upstash (Redis)
- Log in to the shared Upstash console
- From the database's **Details** tab, copy:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

### 3.3 Inngest
- Log in to the shared Inngest dashboard (only needed for **deployed** environments — local dev uses the Inngest Dev Server, see §5, which needs no account)
- For deployed/staging use only, copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`

### 3.4 Cloudflare R2 (PDF storage)
- Ask Member 5 for the shared dev bucket credentials:
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET`
  - `R2_ACCOUNT_ID`

---

## 4. Configure `.env.local`

Copy the example file and fill in the values from §3:

```bash
cp .env.example .env.local
```

`.env.local` should end up looking like:

```
DATABASE_URL=mysql://<user>:<password>@<host>:<port>/<database>?ssl-mode=REQUIRED
JWT_SECRET=<ask a teammate for the shared dev secret — must match across the team>
UPSTASH_REDIS_REST_URL=<from Upstash>
UPSTASH_REDIS_REST_TOKEN=<from Upstash>
INNGEST_EVENT_KEY=<only needed if testing against deployed Inngest, not local dev server>
INNGEST_SIGNING_KEY=<same as above>
R2_ACCESS_KEY_ID=<from Cloudflare>
R2_SECRET_ACCESS_KEY=<from Cloudflare>
R2_BUCKET=<from Cloudflare>
R2_ACCOUNT_ID=<from Cloudflare>
NODE_ENV=development
```

**Never commit `.env.local`.** It's already in `.gitignore` — double check before your first commit anyway.

---

## 5. Run Database Migrations

⚠️ **Do this against the shared dev database only if you're told to** — running migrations resets/alters shared state everyone else depends on. During Phase 0, only **Member 1** runs migrations. After that, coordinate in the team channel before running new migrations against the shared dev DB.

```bash
pnpm db:migrate
```

This runs `db/migrations/01_*.sql` through the latest file in order against whatever `DATABASE_URL` points to.

To load the baseline seed data (per `seed_data_spec.md`) — again, coordinate before running against shared dev:

```bash
pnpm db:seed
```

---

## 6. Start the Inngest Dev Server

Background jobs (PDF generation) need the Inngest Dev Server running locally — this is separate from your Next.js dev server and does **not** need an Inngest account:

```bash
npx inngest-cli@latest dev
```

- This opens a local dashboard at `http://localhost:8288` where you can see triggered events and function runs — useful for debugging PDF generation without waiting for the real thing to render.
- Leave this running in its own terminal tab alongside the Next.js dev server (§7).

---

## 7. Start the App

```bash
pnpm dev
```

- App runs at `http://localhost:3000`
- The Inngest Dev Server (§6) auto-discovers your local `/api/inngest` route — no extra config needed as long as both are running.

---

## 8. Verify Your Setup

Run through this checklist before writing any code:

- [ ] `http://localhost:3000/login` loads
- [ ] Logging in with the seeded bootstrap admin credentials succeeds and redirects to `/dashboard`
- [ ] `/dashboard` loads without errors (confirms DB + Redis connections both work)
- [ ] Inngest Dev Server dashboard (`http://localhost:8288`) shows your app registered as a connected app
- [ ] `pnpm lint` and `pnpm typecheck` both pass with no errors on a fresh clone

If any of these fail, check §9 before asking in the team channel.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ER_ACCESS_DENIED` or connection timeout on startup | `DATABASE_URL` wrong, or your IP isn't allow-listed in Aiven's connection settings — check the Aiven console |
| Login succeeds but `/dashboard` throws a Redis error | `UPSTASH_REDIS_REST_URL`/`TOKEN` missing or wrong in `.env.local` |
| PDF export never completes | Inngest Dev Server (§6) isn't running, or isn't running *before* you started `pnpm dev` — restart both, Dev Server first |
| `pnpm db:migrate` fails partway through | Someone else's migration changed the schema since you last pulled — `git pull`, re-run |
| Everything works for you but breaks for a teammate | Compare `.env.local` values — most common cause is a stale/wrong `JWT_SECRET` or `DATABASE_URL` copy-paste |
| Login works but every other request returns 401 | JWT_SECRET mismatch between when the cookie was issued and now — clear cookies and log in again after any `.env.local` change |

---

## 10. Alternative: Docker Compose (Optional Whole-Project Setup)

If you'd rather not install Node/MySQL locally at all, the optional `docker-compose.yml` at the project root spins up the whole stack (web app + Redis; MySQL optional — you can still point at Aiven from inside the container):

```bash
docker compose up
```

This is **not** the primary dev path for the team (per `architecture.md` §12 — Docker is an optional self-host alternative, not required for local dev), but it's there if your machine setup is giving you trouble.

---

## 11. Daily Workflow Reminder

- `git pull` before starting work each day — shared-owned files (`lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `middleware.ts`, `lib/redis.ts`) change under you if you don't.
- Never run `pnpm db:migrate` or `pnpm db:seed` against the shared dev DB without checking in the team channel first — it affects everyone at once.
- If `.env.example` gets a new variable added, you'll need to manually add it to your own `.env.local` — it isn't automatic.
