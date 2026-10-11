# Kandypack — Local Development Setup

> Status: Active
> Authority: Supporting setup reference
> Primary source: `Docs/03_architecture.md`
> Last reviewed: 2026-10-11

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
SEED_TEST_PASSWORD=<optional — only needed if you run the seed and want the test role accounts>
```

`SEED_TEST_PASSWORD` has no default. If it is empty, `npm run db:seed` skips the four test role accounts (`06_seed-data-spec.md` §12) with a warning.

**Never commit `.env.local`.** It's already in `.gitignore` — double check before your first commit anyway.

---

## 5. Run Database Migrations

⚠️ **Do this against the shared dev database only if you're told to** — running migrations resets/alters shared state everyone else depends on. During Phase 0, only **Member 1** runs migrations. After that, coordinate in the team channel before running new migrations against the shared dev DB.

> **Note:** Migrations `01` through `26` and the full baseline seed (`06_seed-data-spec.md` §1–§12) have already been executed against the shared Aiven database. You do not need to run either on a fresh clone — the shared database is a single instance, so a stored procedure or seeded row added by one member is immediately live for everyone.
>
> **Shared dev state as of 2026-10-08:**
> - **Migrations applied through `26_fix_complete_delivery_guard.sql`.** `25_audit_users.sql` adds audit triggers on `users` and `user_profiles` (account creation, deactivation, reactivation and role changes now appear in `audit_log`, with `record_id` NULL and the account UUID in the JSON; `password_hash` is never logged). `26_fix_complete_delivery_guard.sql` makes `complete_delivery()` refuse `Failed` and `Cancelled` deliveries. Both were applied and tested on 2026-10-08 inside rolled-back transactions (18 checks passed, no data left behind).
> - **Database datetimes are read as UTC.** The shared database stores UTC and `lib/db.ts` creates the pool with `timezone: 'Z'`, so API datetimes equal the stored values on any developer machine (before this, orders and Member 4's routes returned times 5½ hours early on Asia/Colombo machines). Do not pass JS `Date` objects as query parameters; pass strings.
> - **Earlier state (2026-09-26): migrations applied through `24_fix_inventory_apply_trigger.sql`.** Note that `20_delivery_status_cancelled.sql` (which adds `Cancelled` to the `deliveries` status CHECK) had never actually been applied despite earlier notes saying migrations ran to `20` — it went in alongside 21 and 22.
> - **`place_order` was broken for every caller until 2026-09-18** and is now fixed by migrations 21 and 22 (see `03_architecture.md`). If you previously saw order creation fail for no obvious reason, that was why.
> - **Creating a truck schedule and completing a delivery were broken for every caller until 2026-09-26** and are fixed by migrations 23 and 24 (see `03_architecture.md` §19.2).
> - **46 baseline orders are seeded** (1–45 plus #46, the capacity-overflow test case); #47 was placed by a teammate.
> - **Logistics (§10–§11) is seeded:** 10 truck schedules and deliveries (3 `Completed`, 2 `In Progress`, 5 `Scheduled`), 117 inventory transactions and 72 `store_inventory` rows. Trips 4, 10, 16, 22, 28 and 34 are `Arrived`; the 7 `In Transit` orders on them are deliberately **not received yet**, for testing the receive-goods flow.
> - Re-running `npm run db:seed` is safe: every stage inserts only missing rows and reports `0 inserted, N already present`.

```bash
npm run db:migrate
```

This runs every `db/migrations/*.sql` file not yet recorded in `_schema_migrations`, in filename order, against whatever `DATABASE_URL` points to. Applied files are never re-run, so **an already-applied migration cannot be fixed by editing it** — corrections need a new numbered file.

To load the baseline seed data (per `06_seed-data-spec.md`) via `scripts/seed.ts` — again, coordinate before running against shared dev:

```bash
npm run db:seed
```

Rehearse first with a dry run, which executes every insert and then rolls back (requires the bootstrap admin to exist):

```bash
npx tsx scripts/seed.ts --dry-run
```

Seed behaviour to know:
- Re-running is safe: only rows whose ID is missing are inserted; existing rows are never changed.
- Train trip dates are relative to the **first** run. Later runs do not move them forward, so once the seeded future trips have departed, `place_order` will report "no trip with capacity" until newer trips are added.

---

## 6. Start the App

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

## 10. Docker

Docker is **not** needed for local development: use `npm run dev` (§6). The Docker files in the repository exist for the **production server** only (see §12 below and `03_architecture.md` §12):

- `Dockerfile` builds the production image (built by GitHub Actions, not on your machine).
- `docker-compose.prod.yml` and `Caddyfile` define the production stack (the app plus Caddy) and are copied to the server by the deploy workflow.

There is no separate "local Docker" setup. If you want to try the production image locally you need Docker installed and a `.env` file of your own; this is optional and not part of the team workflow.

---

## 11. Daily Workflow Reminder

- `git pull` before starting work each day — shared-owned files (`lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `proxy.ts`, `lib/redis.ts`) change under you if you don't.
- Never run `npm run db:migrate` or `npm run db:seed` against the shared dev DB without checking in the team channel first — it affects everyone at once. Migrations are the sharper edge: a stored-procedure change is live for every member the moment it lands, with no action on their part.
- If `.env.example` gets a new variable added, you'll need to manually add it to your own `.env.local` — it isn't automatic.
- **The live site shares the database with development.** Production uses the same Aiven MySQL and Upstash Redis as `.env.local` (a documented exception, `03_architecture.md` §19). Orders, seeds, migrations and test data you create are visible on the live site immediately, so treat the shared database as production data.
- **Merging to `main` deploys.** A merge into `main` runs CI and, if it passes, deploys to the live server (§12). Merge `development` into `main` only with **Create a merge commit**, never Squash.

---

## 12. Production deployment (EC2)

The live site is `https://dinethnimsara.dpdns.org`, served from one AWS EC2 instance. Architecture and decisions are in `03_architecture.md` §12 and §19; this section is the runbook.

### 12.1 How a release happens
1. Merge a PR into `development`, then merge `development` into `main` (merge commit).
2. GitHub Actions runs **CI** on `main`. If it passes, **Deploy** builds the Docker image, pushes it to GHCR (tag = full commit SHA) and deploys it to the server over SSH.
3. If the `production` Environment has required reviewers, the deploy waits for approval after the image is built (Actions → the run → *Review deployments*).
4. The deploy waits for the container health check, rolls back automatically to the previous image if it fails, and finishes with a smoke test of `/login`.

Database migrations and seeding are **never** run by a deploy. Run them yourself, deliberately, and coordinate in the team channel (§5).

### 12.2 Roll back a bad release
Actions → **Deploy** → *Run workflow* → set `image_tag` to the full commit SHA of the release you want back (visible on earlier Deploy runs and under the repository's Packages).

### 12.3 One-time server setup (already done; kept for rebuilding the server)
- Ubuntu EC2 instance with an Elastic IP, security group open on 80, 443/tcp, 443/udp and 22 (port 3000 closed), and 2 GB swap.
- Docker installed from the Ubuntu packages (`docker.io`, `docker-compose-v2`); nginx stopped and disabled.
- A `deploy` user in the `docker` group with the deploy public key in `authorized_keys`; password SSH login disabled.
- `/opt/kandypack` owned by `deploy`, containing `app.env` (mode `600`; `DATABASE_URL`, `JWT_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NODE_ENV=production`; **no** `SEED_TEST_PASSWORD` or `BOOTSTRAP_ADMIN_PASSWORD`). The compose file, `Caddyfile` and `.env` are written by each deploy.
- Cloudflare `A` record for the domain pointing at the Elastic IP, **DNS only** (grey cloud).
- GitHub Environment `production` with secrets `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` (dedicated deploy key, never a personal `.pem`) and `EC2_HOST_KEY` (the server's `ssh-ed25519` host key as a `host key-type key` line).

### 12.4 Everyday operations (SSH as `deploy`, in `/opt/kandypack`)

| Task | Command |
|---|---|
| See the stack | `docker compose -f docker-compose.prod.yml ps` |
| App logs | `docker compose -f docker-compose.prod.yml logs --tail 100 app` |
| Caddy and certificate logs | `docker compose -f docker-compose.prod.yml logs --tail 100 caddy` |
| Restart the app | `docker compose -f docker-compose.prod.yml restart app` |
| Change a secret | edit `app.env`, then `docker compose -f docker-compose.prod.yml up -d` |
| Free disk space | `docker image prune -f` |

Changing `JWT_SECRET` signs every user out (existing tokens stop verifying).

### 12.5 Known limitations and follow-ups
- Production and development share the database, Redis and `JWT_SECRET` (§19). Revisit before real users.
- The Caddy HSTS `max-age` is deliberately one day while HTTPS is new; raise it in `Caddyfile` once stable.
- The seeded train trips have all departed, so `place_order` reports "no trip with capacity" until a logistics manager or administrator adds upcoming trips on `/train-schedule`.
- Optional hardening: protect `main` with a required review, turn on the Cloudflare proxy (SSL mode *Full (strict)*), and use a separate production database.
