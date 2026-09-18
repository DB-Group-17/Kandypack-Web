# Memory — Member 1 (Dineth) Phase 1: Orders API, Baseline Seed, Member 4 Review

Last updated: 2026-09-18

## What was built

### Earlier in Phase 1 (already on `development`)
- **`app/login/page.tsx`** — login page matching `UI/login`, `DESIGN.md`, and `Docs/07_content-copy.md`.
- **`context/AuthContext.tsx` + `types/auth.ts`** — `useAuth()` hook and auth context that every other member's pages import.
- **Orders API (complete, 4 endpoints):**
  - `POST /api/orders` — validation, Redis lock via `withLock`/`REDIS_KEYS.LOCK_ORDER_DESTINATION`, calls `place_order()` inside `withUserContext`.
  - `GET /api/orders` — filters (status, customer, city, date range, search), pagination, store-manager city scoping.
  - `GET /api/orders/[id]` — order + items + train bookings + delivery + status history; 404 (not 403) for out-of-scope store managers.
  - `PATCH /api/orders/[id]/status` — state machine, cancels linked active deliveries, notes in status history.

### This session
- **Baseline seed (`06_seed-data-spec.md` §1–§8, §12)** — restructured `scripts/seed.ts` into an entry point plus modules:
  - `scripts/seed/helpers.ts` — `insertMissing()` (idempotent insert), `sql()` / `SqlExpression` for server-evaluated values.
  - `scripts/seed/admin.ts` — bootstrap admin stage (moved; no longer closes the pool).
  - `scripts/seed/master-data.ts` — one transaction as the admin, inserts in FK order, rolls back on `--dry-run` or error.
  - `scripts/seed/train-trips.ts` — 36 trips with dates computed in SQL.
  - `scripts/seed/test-accounts.ts` — 4 role logins, skipped without `SEED_TEST_PASSWORD` or under `NODE_ENV=production`.
  - `scripts/seed/data/{locations,catalog,people}.ts` — the row constants.
- **`lib/db.ts`** — `withUserContext` now resets `@current_user_id` / `@current_app_role` to NULL before releasing the connection, and destroys the connection if the reset fails.
- **Docs** — `06_seed-data-spec.md` (SKU pattern, full route/coverage-area table, employee ID layout, trip ID/date rules, new §12 test accounts, re-run rule), `10_local-setup.md` (dry run, `SEED_TEST_PASSWORD`, fixed trip dates), `.env.example` (`SEED_TEST_PASSWORD`, empty by default).

## Decisions made

- **Seed idempotency = insert only missing primary keys.** `DELETE`/`TRUNCATE` are blocked by hard-delete triggers and FKs; `INSERT IGNORE` hides constraint violations; `ON DUPLICATE KEY UPDATE` writes an audit row on every run.
- **Seed runs as the bootstrap admin inside one transaction** so `audit_log.user_id` is attributed and a failure never leaves the shared DB half-seeded. Admin stage keeps its own transaction and runs first.
- **All relative dates are computed in SQL** (`CURDATE()`, `DATE_ADD`), because `place_order` compares against the DB server clock (UTC on Aiven) while local time is UTC+5:30.
- **Trip dates are frozen at the first seed run.** Re-runs never modify rows, so new trips must be appended with higher IDs once the seeded future trips depart.
- **`SEED_TEST_PASSWORD` has no fallback** — no usable credential is ever committed.
- **Seed spec correction:** employees are 30, not 31 (the role counts sum to 30).
- **Order IDs 1–45 are reserved** for the Step 5 order seed, so no real test orders on shared dev before then.

## Problems solved

- `seedBootstrapAdmin()` closed the connection pool in its `finally`, which would kill later stages — pool now closes once in `main()`.
- Customer emails built from names ending in "Co." produced invalid `tradingco.@example.lk` — trailing dots stripped.
- Pooled connections kept the previous request's `@current_user_id` (fixed in `lib/db.ts`).
- `npx tsc --noEmit` reported errors from stale `.next/types/validator.ts` referencing other branches' routes — not real code errors; clear `.next/types` before typechecking.

## Current state

- **Shared dev DB is seeded and verified (2026-09-17):** 7 cities, 6 stores, 12 products, 24 customers, 12 routes, 38 coverage areas, 30 employees, 8 drivers, 8 assistants, 6 trucks, 36 train trips (3 upcoming per city incl. one 50-unit overflow trip), 5 logins. Audit rows attributed to the admin; a dry run inserts 0 rows.
- **Member 4's Phase 1 was re-reviewed after commit `e0b810b` and approved** — all blockers fixed and verified live (mock fallback removed, `withUserContext` on all writes, FK/JSON errors return 400, `city_id` filter fixed, product edit wired). Merged to `development` as PR #9.
- **Branches:** `development` contains Member 2 and Member 4 Phase 1. Local `dineth` has merged `development` (commit `f30fde4`). **`origin/dineth` is still at Phase 0 — the seed work and merge are local only and need pushing.** Member 3's `m3` is not merged.
- **Pages with real data (3):** `/login`, `/admin/master-data`, `/train-schedule`. Mock: `/inventory`, `/admin/users`, `/admin/audit-log`, `/truck-schedule`, `/truck-schedule/new`, `/deliveries`. `/reports` has tabs only. Missing: `/orders`, `/orders/new`, `/orders/[orderId]`, `/dashboard` (sidebar links to `/orders` and `/dashboard` currently 404).
- Lint, typecheck and build pass.

## What Member 1 still has to build (Phase 1)

1. **`/orders` list page** (`app/(dashboard)/orders/page.tsx`) — match `UI/orders_list` + doc 07 copy; filters in the URL, loading/empty/error states, pagination, row → detail, "+ New Order".
2. **`/orders/[orderId]` detail page** — match `UI/order_detail`; customer, delivery, items, train booking (incl. "split across N trips"), delivery status, status history; role-gated status dropdown with valid next statuses and a confirm dialog.
3. **`/orders/new` page** — match `UI/new_order`; customer search, city/area/address, 7-day date rule (client-side for UX only), item lines, totals; `delivery_area` must match a seeded coverage-area name exactly (case-insensitive) — consider a dropdown instead of free text.
4. **Seed sections §9–§11** — 45 orders across two quarters + overflow test order, ~20 truck schedules with deliveries, derived inventory transactions. Past-quarter orders must be inserted directly (`place_order` only books upcoming trips).
5. **Verify the overflow case** — order larger than the 50-unit trip's free space produces 2+ `train_bookings` rows, `booked_space` never exceeds capacity; record the order ID in the seed comments. **Phase 1 gate item.**
6. **Ship it** — lint/typecheck/build, manual role checks, tick `Docs/09_task-tracker.md`, PR `dineth` → `development` with one reviewer.

## Next session starts with

Build `app/(dashboard)/orders/page.tsx` (the Orders list) against `GET /api/orders`, using the seeded data. Push `dineth` to origin first — it is 17 commits ahead of the stale remote branch.

## Open questions

- Deferred testing: test-account logins and an end-to-end order placement were postponed. The overflow check (item 5) must still happen before the Phase 1 gate closes.
- Member 4 follow-ups (non-blocking, raised on PR #9): soft-delete his test rows on shared dev (product 13, customer 25, employee 31 + assistant 9, route 13 + coverage 39); blank coverage-area names are still dropped silently when others are valid; `mockData.ts` still exports ~600 unused lines.
- Team-wide doc conflicts still unresolved: money fields as strings (doc 05) vs numbers (current code); doc 05's `/reports` section still describes PDF job polling; procedure signatures in doc 05 don't match the actual `receive_goods_at_store` / `complete_delivery` / `schedule_truck_delivery`.
- `DATABASE_URL`'s `ssl-mode=REQUIRED` is ignored by mysql2 and `lib/db.ts` sets `rejectUnauthorized: false`; encrypted but unverified certificate. Tidy-up for later.
