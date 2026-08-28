# Kandypack — Local Development Setup

> Status: Active
> Authority: Supporting setup reference
> Primary source: `Docs/03_architecture.md`
> Last reviewed: 2026-08-25

Follow this exactly, in order. The stack depends on Aiven MySQL and, where enabled by the architecture, Upstash Redis — skipping a step here is the #1 source of "works on my machine" bugs.

---

## 1. Prerequisites

- **Node.js 20.x LTS** (`node -v` to check)
- **npm** (use the repository's `package-lock.json`; do not mix package managers)
- **Git**
- A **GitHub account** with access to the repo
- *(Optional)* **Docker Desktop** — only needed if you're using the whole-project `docker-compose.yml` self-host option instead of running natively

---

## 2. Clone & Install

```bash
git clone <repo-url>
cd kandypack
npm install
```

---

## 3. Get Your Service Credentials

You need accounts/access on the external services selected by the architecture. Ask Member 1 or Member 5 for the shared dev credentials if the team is using one shared dev environment (recommended for Phase 0–2, per `09_task-tracker.md`) rather than everyone provisioning their own.

### 3.1 Aiven (MySQL)
- Log in to the shared Aiven project (invite sent separately) or create your own dev service if instructed
- From the service overview page, copy the **connection URI** (includes host, port, user, password, database name)
- Note: Aiven requires `ssl-mode=REQUIRED` — this is already baked into the connection string Aiven gives you

### 3.2 Upstash (Redis)
- Log in to the shared Upstash console
- From the database's **Details** tab, copy:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

PDF exports are generated synchronously and returned directly, so no Inngest account, background worker, or Cloudflare R2 bucket is required for version one.

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
NODE_ENV=development
```

**Never commit `.env.local`.** It's already in `.gitignore` — double check before your first commit anyway.

---

## 5. Run Database Migrations

⚠️ **Do this against the shared dev database only if you're told to** — running migrations resets/alters shared state everyone else depends on. During Phase 0, only **Member 1** runs migrations. After that, coordinate in the team channel before running new migrations against the shared dev DB.

```bash
npm run db:migrate
```

This runs `db/migrations/01_*.sql` through the latest file in order against whatever `DATABASE_URL` points to.

To load the baseline seed data (per `06_seed-data-spec.md`) — again, coordinate before running against shared dev:

```bash
npm run db:seed
```

---

## 6. Start the application

No background worker is required for version-one report exports. Start the Next.js development server using the project package script.

- This opens a local dashboard at `http://localhost:8288` where you can see triggered events and function runs — useful for debugging PDF generation without waiting for the real thing to render.
- Leave this running in its own terminal tab alongside the Next.js dev server (§7).

---

## 7. Start the App

```bash
npm run dev
```

- App runs at `http://localhost:3000`
- Report exports are generated synchronously; no background worker or extra local service is required.

---

## 8. Verify Your Setup

Run through this checklist before writing any code:

- [ ] `http://localhost:3000/login` loads
- [ ] Logging in with the seeded bootstrap admin credentials succeeds and redirects to `/dashboard`
- [ ] `/dashboard` loads without errors (confirms DB + Redis connections both work)
- [ ] A representative CSV and PDF export returns the correct download response after the report feature is implemented
- [ ] `npm run lint` and `npm run typecheck` both pass with no errors on a fresh clone

If any of these fail, check §9 before asking in the team channel.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ER_ACCESS_DENIED` or connection timeout on startup | `DATABASE_URL` wrong, or your IP isn't allow-listed in Aiven's connection settings — check the Aiven console |
| Login succeeds but `/dashboard` throws a Redis error | `UPSTASH_REDIS_REST_URL`/`TOKEN` missing or wrong in `.env.local` |
| PDF export fails or times out | Check report permissions, filter limits, PDF renderer dependencies, and the server logs; large reports may require the future asynchronous architecture option |
| `npm run db:migrate` fails partway through | Someone else's migration changed the schema since you last pulled — `git pull`, re-run |
| Everything works for you but breaks for a teammate | Compare `.env.local` values — most common cause is a stale/wrong `JWT_SECRET` or `DATABASE_URL` copy-paste |
| Login works but every other request returns 401 | JWT_SECRET mismatch between when the cookie was issued and now — clear cookies and log in again after any `.env.local` change |

---

## 10. Alternative: Docker Compose (Optional Whole-Project Setup)

If you'd rather not install Node/MySQL locally at all, the optional `docker-compose.yml` at the project root spins up the whole stack (web app + Redis; MySQL optional — you can still point at Aiven from inside the container):

```bash
docker compose up
```

This is **not** the primary dev path for the team (per `03_architecture.md` §12 — Docker is an optional self-host alternative, not required for local dev), but it's there if your machine setup is giving you trouble.

---

## 11. Daily Workflow Reminder

- `git pull` before starting work each day — shared-owned files (`lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `proxy.ts`, `lib/redis.ts`) change under you if you don't.
- Never run `npm run db:migrate` or `npm run db:seed` against the shared dev DB without checking in the team channel first — it affects everyone at once.
- If `.env.example` gets a new variable added, you'll need to manually add it to your own `.env.local` — it isn't automatic.
