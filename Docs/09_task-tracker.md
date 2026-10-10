# Kandypack — Task Tracker

> Status: Active
> Authority: Supporting implementation tracker
> Primary source: `Docs/03_architecture.md`
> Last reviewed: 2026-10-07

Companion to `08_workload-division.md`. Use this as a literal checklist (paste into GitHub Projects / Trello / Notion as a Kanban board if preferred — the structure below maps 1:1 to columns). **The Phase Gates are not optional** — nobody starts the next phase's tasks until the gate criteria are checked off.

Status legend: `[ ]` not started · `⏳` in progress · `✅` done

---

## 🚧 PHASE 0 — Foundation (Days 1–3)

**Owners:** Member 1, Member 5. **Everyone else:** read `03_architecture.md`, `05_api-and-pages.md`, `07_content-copy.md`, and `06_seed-data-spec.md` in full; do not write backend code yet.

### Member 1
- [x] Project scaffold (Next.js + TypeScript, folder structure per `03_architecture.md` §5)
- [x] Run migrations 01→20 against Aiven MySQL (including `20_delivery_status_cancelled.sql`)
- [x] `lib/db.ts` — mysql2 pool + query/call helpers
- [x] Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, bcrypt hashing
- [x] `proxy.ts` — Next.js 16 Proxy for JWT verification & route protection
- [x] `lib/rbac.ts` — role → route/action map
- [x] Bootstrap admin seed script (`scripts/seed.ts` via `npm run db:seed`)
- [x] Open PR → **at least one other member reviews**

### Member 5
- [x] `lib/redis.ts` — Upstash client, lock helper, cache helper, rate-limit helper
- [x] GitHub Actions CI skeleton — lint + typecheck job only for now
- [x] Report-export service dependency review and synchronous PDF export scaffold
- [x] Open PR → **at least one other member reviews**

### Members 2, 3, 4 (in parallel, no shared-file edits)
- [x] Read all reference docs (`03_architecture.md`, `05_api-and-pages.md`, `07_content-copy.md`, `06_seed-data-spec.md`)
- [x] Build static page shells for your own pages only (routes + layout + placeholder UI, no real data fetching)
- [x] Draft/confirm request-response shapes for your own module's endpoints against `api-and-pages.md` — flag any mismatch now, not later

---

### 🔒 PHASE 0 GATE — COMPLETED & LOCKED (2026-09-02)
- [x] Member 1's foundation PR is **merged to `development` / `main`**
- [x] Member 5's Redis + CI + export-service scaffold PR is **merged to `development` / `main`**
- [x] All 5 members' static page shells completed, unified under canonical `app/(dashboard)/layout.tsx`, and verified against `POST /auth/login`
- [x] CI lint/typecheck/build pipeline is green (0 errors, 14 routes compiled cleanly)
- **Status:** **PASSED / LOCKED** — All team members ready to pull `main` and branch for Phase 1.

---

## 🏗️ PHASE 1 — Critical Path (Days 4–7)

**Pacing item:** Member 1's Orders module. Others do not need to wait for it to fully finish, but nobody merges anything that touches `orders`/`order_items` until it's on `main`.

### Member 1 — Orders
- [x] `POST /orders` → `place_order()` integration (using Member 5's Redis lock helper)
- [x] `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`
- [x] `/orders` (list), `/orders/new`, `/orders/[orderId]` pages wired to real data — `/orders` and `/orders/[orderId]` verified against seeded data (2026-09-18). `/orders/new` built and verified in a browser 2026-09-23: customer search and inline add-customer popup, city → area dropdowns, 7-day date rule, item lines with live totals, submit with pre-flight validation, leave-the-page guard. Verified by placing real orders through the form: a rule-violating order left no rows behind, a normal order and a split-across-trips order both redirected with the placement toast and the split notice. Production `next build` passed on `development` (2026-09-26). Not yet verified: saving a new customer through the popup
- [x] `useAuth()` hook / auth context finalized for others to import
- [x] Open PR → review → merge — PR #10 merged to `development`

### Member 2 — Train Trips (independent of Orders)
- [x] `GET /train-trips`, `POST /train-trips`, `GET /train-trips/:id/capacity`
- [x] `/train-schedule` page wired to real data
- [x] Open PR → review → merge — PR #8 merged to `development`

### Member 3 — Truck Scheduling (independent of Orders)
- [x] `GET /trucks`, `GET /drivers`, `GET /assistants`
- [x] `GET /truck-schedules`, `POST /truck-schedules` → `schedule_truck_delivery()`, `GET /truck-schedules/conflicts` (query-param pre-check; `end_time` is derived server-side — see `05_api-and-pages.md` §A7)
- [x] `/truck-schedule` and `/truck-schedule/new` pages wired to real data (list with filter bar, live form with debounced conflict check, creation toast)
- [x] Open PR → review → merge — PR #12 merged to `development`. Not yet verified in a browser: creating a schedule end to end

### Member 4 — Master Data (zero dependencies — start here first if blocked on anything else)
- [x] `GET/POST /customers`, `GET/POST/PATCH /products`, `GET /cities`, `GET/POST /routes`
- [x] `GET/POST /employees`
- [x] `/admin/master-data` page wired to real data
- [x] Open PR → review → merge — PR #9 merged to `development`

---

### 🔒 PHASE 1 GATE — do not proceed to Phase 2 until ALL of these are true:
- [x] Orders module merged to `main` (Member 1) — merged to `development` (PR #10), then to `main` with the Phase 1 `development` → `main` PR (2026-09-26). Production build, lint and typecheck pass on `development`
- [x] `place_order()` verified working against the small-capacity overflow test case from `seed_data_spec.md` §8 — **passed 2026-09-18.** Order #46 booked across Trip #5 (the 50-unit Colombo trip, 49.50 units) and Trip #6 (70.50 units), with no trip exceeding capacity and the split conserving both space and quantity. Verified in the database and rendered on `/orders/46`, split-trip banner included. Required three fixes to `place_order` first — see `03_architecture.md`.
- [x] Master Data merged (Member 4) — PR #9 merged to `development` (reaches `main` with the same `development` → `main` PR)
- [x] Full baseline seed data (`seed_data_spec.md`, all sections) loaded into the shared dev DB — **done 2026-09-26.** §1–§9 and §12 were loaded earlier; §10–§11 were seeded by Stage 4 (`scripts/seed/logistics.ts`) using option 1 from `06_seed-data-spec.md` §9: 10 truck schedules and deliveries, 117 inventory transactions, 72 stock rows. Required migrations `23` and `24` first — `schedule_truck_delivery` and every stock decrease had been broken for every caller (see `03_architecture.md` §19.2).
- **Status:** **PASSED / LOCKED (2026-09-26)** — All Phase 1 work merged to `main`. All team members pull `main` (or `development`) before branching for Phase 2.

---

## 🔧 PHASE 2 — Module Completion (Days 8–12)

### Member 2 — Reports (data layer)
- [x] All 6 report GET endpoints (`quarterly-sales`, `most-ordered-items`, `city-route-sales`, `driver-assistant-hours`, `truck-usage`, `customer-history`)
- [x] `GET /reports/:type/export/csv`
- [x] `/reports` page — tabs + tables + CSV button wired (PDF button deferred to Phase 3)
- [x] Open PR → review → merge — PR #16 merged to `development`

### Member 3 — Deliveries (needs Orders + Truck Scheduling both on `main`)
- [x] `GET /deliveries`, `PATCH /deliveries/:id/complete` → `complete_delivery()` — completion runs under a Redis lock and an explicit transaction (a rejected stock dispatch rolls the delivery and order back). Verified 2026-10-07 against the shared dev DB through the real route: the read paths and rejections (not found, already completed, bad id, bad filters); an insufficient-stock completion returned 400 and left the delivery `Scheduled`, the order `At Store`, no dispatch rows and stock unchanged (rollback); a normal completion of delivery 7 (order #29) set it `Completed`, the order `Delivered` (trigger-verified), wrote one dispatch of 36 and left 90 on hand; a repeat call was rejected and changed nothing. The 409 lock-contention path was not exercised
- [x] `/deliveries` page wired to real data — table with mobile cards, status and date filters, "Mark complete" dialog; checked in the browser pane as the fleet supervisor account (list, dialog open/close)
- [x] Open PR → review → merge — PR #18 merged to `development` (2026-10-07)

### Member 4 — Inventory + Admin Users
- [x] `GET /stores/:id/inventory` (completed in Subtask 1), `POST /stores/:id/receive-goods` → `receive_goods_at_store()` (completed in Subtask 2), `GET /inventory/transactions` (completed in Subtask 3)
- [x] `GET/POST /users` (completed in Subtask 5), `PATCH /users/:id` (completed in Subtask 6)
- [x] `/inventory` (completed in Subtask 4) and `/admin/users` (completed in Subtask 7) pages wired to real data
- [x] Open PR → review → merge — PR #17 merged to `development`

### Member 5 — Report Exports (needs Member 2's report queries merged first)
> Status 2026-10-09: **completed.** Route handler, API test suite (18/18 passing), frontend wiring in `app/(dashboard)/reports/page.tsx`, and end-to-end seeded data PDF verification in `tests/integration/report-pdf-e2e.test.ts` complete. Phase 2 Gate closed; ready for PR into `development`.

- [x] `POST /api/reports/:type/export/pdf` (`app/api/reports/[type]/export/pdf/route.ts`) returns a direct PDF: `Content-Type: application/pdf`, `Content-Disposition: attachment`, no persistence (`03_architecture.md` §11, `05_api-and-pages.md` §A9). Reuse the report queries and role rules from the CSV route so both exports return the same data
- [x] Add PDF renderer wiring, report-size limits (`PDF_ROW_CAP = 1000`), permission checks and rate limiting (`applyRateLimit` with `REPORT_PDF_EXPORT` profile, per user)
- [x] Add export tests: content type and headers, permissions per role, filters, empty result, and a representative output that is a valid PDF (`tests/api/report-pdf-export.test.ts` — 18/18 passing)
- [x] Confirm no `report_jobs` migration, polling endpoint, or report-file storage is needed for version one (the code shows none; verified synchronous design)
- [x] Produce a downloadable PDF end to end at least once against the seeded data (wire `/reports` button and verify download to close Phase 2 gate)
- [ ] Open PR → review → merge

### Member 1 — Phase 2 review follow-ups
Items that came out of the Phase 2 reviews and belong to Member 1's files (`db/migrations/`, `lib/db.ts`, `lib/auth.ts`, `proxy.ts`) or to shared documentation. Status 2026-10-08: all code, migrations (`25` and `26`, applied and tested) and documentation are done; only the team announcement remains.
- [x] **O1, timezone:** `timezone: 'Z'` added to the `mysql2` pool in `lib/db.ts`; `app/api/truck-schedules/service.ts` now formats schedule times with `getUTC*` so they stay naive wall-clock on any server timezone. Verified 2026-10-08 against the shared dev DB on an Asia/Colombo machine: order, train-trip and delivery timestamps now equal the stored values, the orders and reports APIs agree, and schedule times are unchanged. Team announcement drafted (not yet posted)
- [x] **R7, audit logging for user changes:** `db/migrations/25_audit_users.sql` applied to the shared DB on 2026-10-08 (triggers on `users` and `user_profiles`, `record_id` NULL with the UUID in the JSON, `password_hash` never logged, one row per deactivation or role change). Tested inside a rolled-back transaction: create, deactivate, reactivate, role change and email change each wrote the expected single row with the acting admin and no hash; a no-op update wrote nothing; an insert whose actor has no profile yet did not break the audit FK. `03` §19, `04` §5.5 and §10 and `10_local-setup.md` updated. `/admin/audit-log` still renders mock data (Member 4, Phase 3), so the rows are checked in SQL
- [x] **R8, session staleness:** documented in `05` §A10 (guards and the 8-hour next-login limitation) and `03` §19
- [x] **F1, `complete_delivery` guard:** `db/migrations/26_fix_complete_delivery_guard.sql` applied to the shared DB on 2026-10-08 (only `Scheduled` or `In Progress` deliveries complete). Tested inside a rolled-back transaction: `Cancelled` and `Failed` deliveries are rejected, the "already Completed", "not found" and role-guard messages are unchanged, and a `Scheduled` delivery still completes (order `Delivered`, dispatch rows written). `05` §A8, `04` §6.2 and `03` §19 updated
- [x] **F2, start-delivery decision:** decided — no start-delivery endpoint in version one (`03` §19, `05` §A8); the mockup's "Start delivery" button stays omitted
- [x] **D1, stale documentation:** `05` and `07` `/reports` now describe the direct-PDF flow; `05` §A9 and `03` §9 name `v_driver_assistant_hours`; `03` §7 and `08` use `/truck-schedules/conflicts`; the Report 5 and 6 differences from the SRS are recorded in `03` §3 and §19 (accepted for version one, no view migration); `04` §10 lists migrations 21–26; `07` `/deliveries` matches the built page
- [ ] Team message: announce `timezone: 'Z'`, the `lib/redis.ts` delivery lock key (Member 5's file), migrations `25` and `26`, and the doc changes (message drafted, to be posted by Member 1)

---

### 🔒 PHASE 2 GATE — do not proceed to Phase 3 until ALL of these are true:
- [x] Deliveries merged — PR #18 (2026-10-07). `complete_delivery()` flipping the linked order to `Delivered` was verified through the real route: a normal completion set the order `Delivered` and wrote the dispatch; an insufficient-stock completion rolled everything back
- [x] Reports data endpoints merged and returning correct numbers against the seeded baseline data — PR #16, checked against the seeded data at review
- [x] Inventory + Admin Users merged — PR #17
- [x] PDF generation successfully produces a downloadable file end-to-end at least once — **closed (2026-10-09, Member 5)**; wired in `app/(dashboard)/reports/page.tsx` and verified end-to-end against live seeded data in `tests/integration/report-pdf-e2e.test.ts`
- **Status (2026-10-09):** 4 of 4 criteria met. Phase 2 Gate is CLOSED. Phase 3 Integration is unblocked.

---

## 🔗 PHASE 3 — Integration (Days 13–14)

- [ ] Member 5: `/dashboard` page built and wired (last, since it pulls from every other module)
- [x] Member 2: PDF export button on `/reports` wired to Member 5's direct PDF endpoint — direct binary stream download, client-side validation, 429 rate-limiting handling, and active generation spinners verified
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
- Shared files (`lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `proxy.ts` → Member 1 only; `lib/redis.ts` → Member 5 only) — ask the owner, don't edit directly.
- Any schema/migration/seed change, regardless of who needs it, goes through Member 1.
- If you're blocked waiting on someone else's PR, work on your own module's frontend shell or write copy/tests — never start editing a shared-owned file to unblock yourself.
