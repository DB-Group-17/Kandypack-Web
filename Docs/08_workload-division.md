# Kandypack — Team Workload Division (5 Members)

> Status: Active
> Authority: Supporting
> Primary source: `Docs/03_architecture.md`
> Last reviewed: 2026-08-25

Companion to `03_architecture.md`. Every member owns **backend + frontend** for their slice. Member 1 owns the foundation everyone else depends on, plus the most critical/complex business logic — heavier load is intentional and unavoidable there.

---

## Member 1 — Foundation, Auth, Orders *(heaviest load — critical path)*

### Why this person carries the most
- Nobody else can start real backend work until the DB connection helper, auth system, and RBAC middleware exist.
- Orders (`place_order`) is the single most complex piece of business logic in the whole system — 7-day rule, route matching, train capacity check, overflow-to-next-trip.

### Backend
- Project scaffold (Next.js + TypeScript setup)
- Run all 20 migration files against Aiven MySQL; own the `db/migrations/` folder going forward — **any schema change from any member goes through Member 1**
- `lib/db.ts` — mysql2 pool + query/call helpers (used by everyone)
- Auth system: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, bcrypt, JWT sign/verify
- `middleware.ts` — JWT verification on protected routes
- `lib/rbac.ts` — role → allowed routes/actions map
- Seed script for the first admin account
- Orders module: `POST /orders` (calls `place_order()`), `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`

### Frontend
- Login page
- Orders list page, Place New Order page, Order Detail page
- `useAuth()` hook / auth context — **the pattern everyone else's pages import**

### Owns these shared files (others don't touch without asking)
`lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `middleware.ts`, `db/migrations/`

---

## Member 2 — Train Scheduling + Reports (data layer)

### Backend
- `GET /train-trips`, `POST /train-trips`, `GET /train-trips/:id/capacity`
- All 6 report query endpoints: quarterly-sales, most-ordered-items, city-route-sales, driver-assistant-hours, truck-usage, customer-history
- `GET /reports/:type/export/csv` (synchronous CSV export)

### Frontend
- Train Schedule page (calendar view, booked/remaining capacity, add-trip form)
- Reports page (run each report, date-range filters, results table, CSV/PDF export buttons — PDF button wired to Member 5's direct export endpoint once ready)

### Depends on
Member 1's `db.ts` + auth/RBAC being merged first.

---

## Member 3 — Truck Scheduling, Roster, Deliveries

### Backend
- `GET /trucks`, `GET /drivers`, `GET /assistants` (with current weekly hours)
- `GET /truck-schedules`, `POST /truck-schedules` (calls `schedule_truck_delivery()`)
- `GET /truck-schedules/:id/conflicts` (live pre-check for the UI)
- `GET /deliveries`, `PATCH /deliveries/:id/complete` (calls `complete_delivery()`)

### Frontend
- Truck Schedule list page + New Truck Schedule page (with live conflict/roster warnings)
- Deliveries page (mark complete, add notes)

### Depends on
Member 1's foundation. Deliveries also needs `orders` to exist — coordinate timing with Member 1 (see Build Sequence).

---

## Member 4 — Inventory, Master Data, Admin

### Backend
- `GET /stores/:id/inventory`, `POST /stores/:id/receive-goods` (calls `receive_goods_at_store()`), `GET /inventory/transactions`
- Master data CRUD: `/products`, `/cities`, `/routes`, `/customers`, `/employees`
- Admin: `GET/POST /users`, `PATCH /users/:id` (create/deactivate accounts, assign roles)
- `GET /audit-log`

### Frontend
- Store Inventory page
- Admin: Users page, Master Data page, Audit Log page

### Depends on
Member 1's foundation. `/admin/users` specifically depends on Member 1's auth system being complete (it creates rows in `users`/`user_profiles`).

---

## Member 5 — Cross-Cutting: Redis, Testing, CI/CD, Docker, and Exports

### Backend
- `lib/redis.ts` — Upstash client, distributed-lock helper (used inside Member 1's `place_order` and Member 3's `schedule_truck_delivery`), caching helper, rate-limit helper
- Rate limiting wired onto: `/auth/login`, `/orders`, `/truck-schedules`, `/reports/:type/export/pdf`
- Synchronous CSV/PDF export service: validate filters, render output, return direct downloads, and add export-level tests
- Test suite: unit tests (7-day rule, space calc, roster hours), integration tests (`place_order`, `schedule_truck_delivery` against a throwaway MySQL instance), one API route test (`/auth/login`)
- GitHub Actions CI: lint, typecheck, test job (MySQL service container), migration check
- Optional `docker-compose.yml` (whole-project self-host option)

### Frontend
- Dashboard page (summary cards — pulls from Orders/Train/Truck/Inventory once those APIs exist, cached via Redis)

### Depends on
Nothing to *start* (Redis/CI scaffolding is independent) — but PDF export needs Member 2's report queries, and the Dashboard needs data from all four other members' APIs, so both land late.

---

## Build Sequence (Avoids Merge Conflicts)

### Phase 0 — Foundation (Days 1–3)
**Member 1** and **Member 5** work in parallel; Members 2, 3, 4 do *not* touch shared backend files yet.
- Member 1: scaffold, migrations, `db.ts`, auth, RBAC, middleware, seed admin — merge to `main` first
- Member 5: `redis.ts` (lock + cache + rate-limit helpers), CI skeleton (lint/typecheck job), and export-service scaffold — merge to `main` alongside Member 1
- Members 2/3/4: build static page shells (routes, layout, placeholder UI) off the current `main`; agree on request/response shapes for their own endpoints so backend and frontend within each person's slice don't drift

**Gate:** everyone pulls `main` after Member 1 + Member 5's work merges before starting their own module branch. This is the one hard sync point in the whole project.

### Phase 1 — Critical path (Days 4–7)
- **Member 1** builds Orders (`place_order`, using Member 5's Redis lock helper) — this is the pacing item; other modules reference orders/customers but don't block on it existing in full.
- **Members 2, 3, 4** start their backend routes now that `db.ts`/auth/RBAC/Redis are on `main`.
  - Member 4's Master Data (products, cities, routes, customers, employees) has **zero dependencies** — start here first if waiting on anything else.
  - Member 3's Truck Scheduling can build fully independently of Orders.
  - Member 2's Train Trips can build independently; the *booking* link to Orders comes once Member 1's `place_order` lands.

### Phase 2 — Module completion (Days 8–12)
- Member 2 finishes Reports data queries + CSV export (needs real data in the DB — coordinate seed data timing with everyone).
- Member 3 finishes Deliveries (`complete_delivery`) — needs `orders` + `truck_schedules` both to exist, so this is the last thing Member 3 builds.
- Member 4 finishes Inventory receive/dispatch (needs `train_bookings` and `deliveries` to exist for the FK checks) and Admin Users page.
- Member 5 builds the synchronous PDF export once Member 2's report queries exist.

### Phase 3 — Integration (Days 13–14)
- Member 5 builds the Dashboard — last, since it pulls from every other module's API.
- Member 2 wires the PDF export button on the Reports page to Member 5's direct PDF endpoint.
- Cross-module smoke test: place an order → book train space → receive goods at store → schedule truck → complete delivery → confirm it shows in Reports and Dashboard.

### Phase 4 — Testing & Hardening (Days 15–16)
- Member 5 finalizes the test suite and confirms CI blocks merges on failure.
- Each member adds at least one test for their own module's riskiest logic if time allows (optional, stretch goal — not required per the time-boxed plan in `03_architecture.md` §16).
- Full run-through of the Schema v4 §10 manual deployment checklist.

---

## Conflict-Avoidance Rules

- **One feature branch per member per module**, PR into `main`, at least one other member reviews before merge.
- **Shared files are owned, not shared:** `lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `middleware.ts` → Member 1 only. `lib/redis.ts` → Member 5 only. Anyone needing a change to these asks the owner rather than editing directly.
- **Migrations are sequential and single-owner:** if a module needs a schema tweak after Phase 0, it goes through Member 1 to avoid two people claiming the same migration number.
- **No two members touch the same page/route file.** The module split above guarantees this as long as everyone stays in their own `app/(dashboard)/<module>/` and `app/api/<module>/` folders.
- **Agree on API contracts before writing code**, not after — each member's own frontend depends on their own backend, so a shape mismatch only hurts them, but cross-module reads (Dashboard reading Orders' shape, Reports reading everyone's data) need the contract fixed early.
