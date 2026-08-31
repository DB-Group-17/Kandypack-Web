# Kandypack — Task Tracker

> Status: Active
> Authority: Supporting implementation tracker
> Primary source: `Docs/03_architecture.md`
> Last reviewed: 2026-08-25

Companion to `08_workload-division.md`. Use this as a literal checklist (paste into GitHub Projects / Trello / Notion as a Kanban board if preferred — the structure below maps 1:1 to columns). **The Phase Gates are not optional** — nobody starts the next phase's tasks until the gate criteria are checked off.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## 🚧 PHASE 0 — Foundation (Days 1–3)

**Owners:** Member 1, Member 5. **Everyone else:** read `03_architecture.md`, `05_api-and-pages.md`, `07_content-copy.md`, and `06_seed-data-spec.md` in full; do not write backend code yet.

### Member 1
- [ ] Project scaffold (Next.js + TypeScript, folder structure per `03_architecture.md` §5)
- [ ] Run migrations 01→19 against Aiven MySQL (schema only, no seed yet)
- [ ] `lib/db.ts` — mysql2 pool + query/call helpers
- [ ] Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, bcrypt hashing
- [ ] `middleware.ts` — JWT verification
- [ ] `lib/rbac.ts` — role → route/action map
- [ ] Bootstrap admin seed script (seed-data specification — admin row only, rest of seed comes later)
- [ ] Open PR → **at least one other member reviews**

### Member 5
- [ ] `lib/redis.ts` — Upstash client, lock helper, cache helper, rate-limit helper
- [ ] GitHub Actions CI skeleton — lint + typecheck job only for now
- [ ] Report-export service dependency review and synchronous PDF export scaffold
- [ ] Open PR → **at least one other member reviews**

### Members 2, 3, 4 (in parallel, no shared-file edits)
- [x] Read all reference docs (`03_architecture.md`, `05_api-and-pages.md`, `07_content-copy.md`, `06_seed-data-spec.md`)
- [~] Build static page shells for your own pages only (routes + layout + placeholder UI, no real data fetching)
- [~] Draft/confirm request-response shapes for your own module's endpoints against `api-and-pages.md` — flag any mismatch now, not later

---

### 🔒 PHASE 0 GATE — do not proceed to Phase 1 until ALL of these are true:
- [ ] Member 1's foundation PR is **merged to `main`**
- [ ] Member 5's Redis + CI + export-service scaffold PR is **merged to `main`**
- [ ] Everyone has pulled the latest `main` locally and can run the app + hit `POST /auth/login` successfully against the seeded bootstrap admin
- [ ] CI lint/typecheck job is green on `main`

---

## 🏗️ PHASE 1 — Critical Path (Days 4–7)

**Pacing item:** Member 1's Orders module. Others do not need to wait for it to fully finish, but nobody merges anything that touches `orders`/`order_items` until it's on `main`.

### Member 1 — Orders
- [ ] `POST /orders` → `place_order()` integration (using Member 5's Redis lock helper)
- [ ] `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`
- [ ] `/orders` (list), `/orders/new`, `/orders/[orderId]` pages wired to real data
- [ ] `useAuth()` hook / auth context finalized for others to import
- [ ] Open PR → review → merge

### Member 2 — Train Trips (independent of Orders)
- [ ] `GET /train-trips`, `POST /train-trips`, `GET /train-trips/:id/capacity`
- [ ] `/train-schedule` page wired to real data
- [ ] Open PR → review → merge

### Member 3 — Truck Scheduling (independent of Orders)
- [ ] `GET /trucks`, `GET /drivers`, `GET /assistants`
- [ ] `GET /truck-schedules`, `POST /truck-schedules` → `schedule_truck_delivery()`, `GET /truck-schedules/:id/conflicts`
- [ ] `/truck-schedule` and `/truck-schedule/new` pages wired to real data
- [ ] Open PR → review → merge

### Member 4 — Master Data (zero dependencies — start here first if blocked on anything else)
- [ ] `GET/POST /customers`, `GET/POST/PATCH /products`, `GET /cities`, `GET/POST /routes`
- [ ] `GET/POST /employees`
- [ ] `/admin/master-data` page wired to real data
- [ ] Open PR → review → merge

---

### 🔒 PHASE 1 GATE — do not proceed to Phase 2 until ALL of these are true:
- [ ] Orders module merged to `main` (Member 1)
- [ ] `place_order()` verified working against the small-capacity overflow test case from `seed_data_spec.md` §8
- [ ] Master Data merged (Member 4) — needed because Orders/Truck Scheduling both reference products/routes/customers
- [ ] Full baseline seed data (`seed_data_spec.md`, all sections) loaded into the shared dev DB — Member 1 runs this once everyone's underlying tables exist

---

## 🔧 PHASE 2 — Module Completion (Days 8–12)

### Member 2 — Reports (data layer)
- [ ] All 6 report GET endpoints (`quarterly-sales`, `most-ordered-items`, `city-route-sales`, `driver-assistant-hours`, `truck-usage`, `customer-history`)
- [ ] `GET /reports/:type/export/csv`
- [ ] `/reports` page — tabs + tables + CSV button wired (PDF button deferred to Phase 3)
- [ ] Open PR → review → merge

### Member 3 — Deliveries (needs Orders + Truck Scheduling both on `main`)
- [ ] `GET /deliveries`, `PATCH /deliveries/:id/complete` → `complete_delivery()`
- [ ] `/deliveries` page wired to real data
- [ ] Open PR → review → merge

### Member 4 — Inventory + Admin Users
- [ ] `GET /stores/:id/inventory`, `POST /stores/:id/receive-goods` → `receive_goods_at_store()`, `GET /inventory/transactions`
- [ ] `GET/POST /users`, `PATCH /users/:id`
- [ ] `/inventory` and `/admin/users` pages wired to real data
- [ ] Open PR → review → merge

### Member 5 — Report Exports (needs Member 2's report queries merged first)
- [ ] `POST /reports/:type/export/pdf` returns a direct PDF response
- [ ] Add PDF renderer, report-size limits, permission checks, and export tests
- [ ] Confirm no `report_jobs` migration, polling endpoint, or report-file storage is needed for version one
- [ ] Open PR → review → merge

---

### 🔒 PHASE 2 GATE — do not proceed to Phase 3 until ALL of these are true:
- [ ] Deliveries merged — confirm `complete_delivery()` correctly flips linked order to `Delivered` (trigger-verified)
- [ ] Reports data endpoints merged and returning correct numbers against the seeded baseline data
- [ ] Inventory + Admin Users merged
- [ ] PDF generation successfully produces a downloadable file end-to-end at least once

---

## 🔗 PHASE 3 — Integration (Days 13–14)

- [ ] Member 5: `/dashboard` page built and wired (last, since it pulls from every other module)
- [ ] Member 2: PDF export button on `/reports` wired to Member 5's direct PDF endpoint
- [ ] Member 4: `/admin/audit-log` page wired
- [ ] **Full cross-module smoke test** (everyone, together): place an order → confirm train booking → receive goods at destination store → schedule a truck → mark delivery complete → confirm it appears correctly in Reports and Dashboard
- [ ] Fix any integration issues found during the smoke test before moving on

---

### 🔒 PHASE 3 GATE — do not proceed to Phase 4 until ALL of these are true:
- [ ] Smoke test passes end-to-end with no manual DB edits required
- [ ] Dashboard shows correct live numbers
- [ ] All 14 pages are reachable and functional for at least one role each

---

## ✅ PHASE 4 — Testing & Hardening (Days 15–16)

### Member 5
- [ ] Finalize Vitest suite: unit tests (7-day rule, space calc, roster hours), integration tests (`place_order`, `schedule_truck_delivery`), one API route test (`/auth/login`)
- [ ] CI test job (MySQL service container) confirmed blocking merges on failure
- [ ] Migration-check CI job confirmed working

### All members (stretch goal, time-permitting only)
- [ ] Member 1: one test for `place_order` edge case (e.g. exact-capacity boundary)
- [ ] Member 2: one test for a reports query's numeric correctness
- [ ] Member 3: one test for `schedule_truck_delivery` conflict rejection
- [ ] Member 4: one test for `receive_goods_at_store` quantity math

### Everyone
- [ ] Run through the Schema v4 §10 manual Deployment Checklist together
- [ ] Final review of `07_content-copy.md` against actual rendered pages — fix any copy drift
- [ ] Confirm optional `docker-compose.yml` (whole-project self-host) still starts cleanly, if built

---

## Standing Rules (apply in every phase)

- One feature branch per person per module; PR into `main`; **at least one reviewer** before merge.
- Shared files (`lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `middleware.ts` → Member 1 only; `lib/redis.ts` → Member 5 only) — ask the owner, don't edit directly.
- Any schema/migration/seed change, regardless of who needs it, goes through Member 1.
- If you're blocked waiting on someone else's PR, work on your own module's frontend shell or write copy/tests — never start editing a shared-owned file to unblock yourself.
