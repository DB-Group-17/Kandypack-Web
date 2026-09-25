# Memory — Member 1 (Dineth) Phase 1: Orders seed, place_order fixes, /orders/new

Last updated: 2026-09-23

## What was built

### Seed §9 — orders (committed, and loaded on the shared dev DB)
- `scripts/seed/data/orders.ts` — pure data: 45 orders + `OVERFLOW_TEST_ORDER` (#46, deliberately NOT in `SEED_ORDERS`), `STATUS_WALK`, status-count assertions. Deterministic (no random), dates as offsets resolved in SQL.
- `scripts/seed/orders.ts` — `seedOrders(dryRun)` = one transaction: `seedHistoricalOrders` (1–23, direct INSERT, previous quarter) → `seedCurrentQuarterOrders` (24–45, via `place_order`) → `seedOverflowTestOrder` (#46, asserts ≥2 bookings, no trip over capacity, space + quantity conserved). Guarded `prepareAutoIncrement` resets counters only when `orders` is empty. Wired into `scripts/seed.ts` as Stage 3. `train-trips.ts` now exports `THIS_MONDAY` and the offset constants.
- Result on dev: 46 seeded orders, 24 train bookings. **Phase 1 gate passed:** order #46 is booked across Trip #5 (the 50-unit Colombo trip, 49.50) and Trip #6 (70.50).

### Migrations (applied to shared dev)
- `21_fix_place_order_collation.sql` and `22_fix_place_order_temp_tables.sql` replace `place_order`. Migration 20 had never actually been applied to dev; it went in alongside them. Applied through **22**.

### `POST /api/orders`
- `app/api/orders/route.ts` now wraps the `CALL place_order` in `beginTransaction` / `commit` (inside the Redis lock) / `rollback`. Verified: a failing order leaves no rows.

### `/orders/new` (built, verified in a browser, all 8 steps)
- `app/(dashboard)/orders/new/page.tsx` (~2000 lines): customer type-ahead + chip + prefill, required-city "Add new customer" popup, city → coverage-area dropdowns (from `/api/routes?city_id=`), 7-day date rule (starts empty), item table with live totals, submit with pre-flight validation, shared `ModalShell` (focus trap), "Discard this order?" leave guard.
- `app/(dashboard)/orders/[orderId]/page.tsx`: reads `?placed=1` once, shows the placement toast and the split notice, strips the flag. Default export is now a `<Suspense>` wrapper.

### Docs
- `Docs/05` (procedure signatures corrected; POST 201 shape is `{ order: {...}, message }`; transaction requirement; new `/orders/new` flow), `Docs/06` §9 (Decisions A and B, implementation status), `Docs/07` (popup, table layout, new-copy block, mockup deviations), `Docs/09` (gate + `/orders/new` ticked), `Docs/10` (shared dev state), `Docs/03` §19.1 (the three `place_order` defects).

## Decisions made

- **Historical orders carry no train bookings** (no trip exists in the previous quarter; every report needing depth reads only `orders` + `order_items`). They must set `route_id` themselves.
- **Seeded status history comes from walking the status** (insert `Pending`, UPDATE through each step) so the trigger writes real history; historical `changed_at` values are backdated.
- **Migrations are never edited once applied** — fixes ship as new numbered files. The DB is one shared instance, so a migration is live for everyone instantly.
- `/orders/new`: Order Items is a table in the left column (doc 07) with a Summary card in the rail (deviates from the mockup); mockup extras (tax, shipping, Save Draft, State/Region, Postal Code, Contact Person) dropped; whole-number quantities; one product per line; registered city required in the customer popup, preselected from the chosen destination city.
- The page must not be wrapped in an outer `<form>` (the popup is its own form).
- `place_order` is only atomic if the caller opens a transaction.

## Problems solved

- **`place_order` was broken for every caller until 2026-09-18**, three ways: (1) collation mismatch on the coverage-area lookup, (2) `tmp_trip_alloc` had no primary key while Aiven runs `sql_require_primary_key=ON`, (3) `TRUNCATE` is DDL and forced an implicit COMMIT, so nothing rolled back. Fixed by migrations 21–22.
- **Dry runs that call `place_order` were not dry** before migration 22 (the implicit commit persisted 25 rows); cleaned up. Always read row counts afterwards instead of trusting a script's "rolled back" message.
- InnoDB does not reclaim `AUTO_INCREMENT` on rollback; `ALTER TABLE … AUTO_INCREMENT = 1` sets it to max(id)+1. It is DDL, so it must run outside any transaction.
- `information_schema` caches table stats in MySQL 8; set `information_schema_stats_expiry = 0` to read a live AUTO_INCREMENT.
- ESLint `react-hooks/set-state-in-effect`: define loaders inline in the effect, derive "loading" from `null` data, reset dependent fields in the `onChange` handler.
- `useSearchParams()` needs a `<Suspense>` wrapper or the production build fails.
- **Testing in the Browser pane:** the pane is hidden (`document.hidden`), so `requestAnimationFrame` is throttled 1–6 s; focus-restore checks need long waits. The pane's session is separate from the user's own browser, and it must be signed in inside the pane itself. Do not type passwords for the user.
- Heredocs with apostrophes break in the Bash tool; write a script file and run it instead.

## Current state

- **Works and verified:** seed §9, `POST /api/orders` transaction, and `/orders/new` (rule-violating order left no rows; normal and split orders redirected with the toast and the split notice). All tests were cleaned up by exact order ID.
- **Uncommitted (check `git status`):** the registered-city change and click-time link capture in `app/(dashboard)/orders/new/page.tsx`, plus the doc 05 / doc 07 edits describing them. Everything before that was committed.
- **Shared dev DB now:** 47 orders. Order **#47 was placed by someone else** (Rs. 189,000, on trip 6); do not delete it. Next order ID is 48.
- **Not verified:** a production `next build` (needs the user's dev server on port 3000 stopped — it shares `.next`), and saving a new customer through the popup (would create a real customer; cleanup would be soft-delete).
- Branches: `dineth` not merged to `development`; verify pushed state before anything else.

## Next session starts with

1. Run `git status`; commit the uncommitted page + doc changes.
2. Production build (`npm run build`, dev server stopped), then `npm run lint` and `npm run typecheck`.
3. Manual role checks (clerk allowed on `/orders/new`; `logistics_manager` blocked), then open the PR `dineth` → `development` with one reviewer.

## Remaining Phase 1 work for Member 1

- Seed §10–§11 (truck schedules, deliveries, inventory). Blocked on Member 3 (truck-scheduling not started). Preferred plan already in spec §9: scope the ~20 schedules/deliveries to current-quarter `At Store` / `Out for Delivery` orders, because historical orders have no received stock to dispatch against (`trg_check_inventory_before_dispatch` rejects negative stock). Check the real procedure signatures in `18_proc_remaining.sql` first.
- Ship: tick the tracker's "Orders module merged" gate item after the PR merges.

## Open questions

- Who placed order #47? (Harmless, but confirm it is a teammate's test.)
- **Team message still owed:** `place_order` changed under everyone (migrations 21–22); migration 20 was only just applied; `POST /api/orders` now works; `receive-goods` no longer takes `items[]` (doc 05 corrected).
- Member 4 follow-ups (non-blocking): soft-delete their test rows (product 13 "Member 4 Test Product Updated", customer 25, employee 31 + assistant 9, route 13, coverage area "Member 4 Test Area") — they show up in the `/orders/new` dropdowns; `mockData.ts` has ~600 unused lines; duplicate customer phones are allowed (no uniqueness rule).
- Doc 05 still says money fields are strings while the code returns numbers; its `/reports` section still describes PDF polling.
- `v_quarterly_sales` filters `status = 'Delivered'`, so it shows one quarter only; if Member 2 wants a period comparison, seed §9 needs Delivered orders in two quarters.
- The leave-the-page guard cannot intercept sidebar links or the browser Back button (App Router limitation); the `SectionCard` and `StatusBadge` components are duplicated across pages and should be extracted when convenient.
- `DATABASE_URL`'s `ssl-mode=REQUIRED` is ignored by mysql2 and `lib/db.ts` sets `rejectUnauthorized: false`. `package.json` lists `lucide-react` twice.


---

# Memory — Member 3 (Monishka) Phase 1: Truck Scheduling filter bar

Last updated: 2026-09-25

## What was built

### Filter bar for `/truck-schedule`
- `app/(dashboard)/truck-schedule/TruckScheduleFilters.tsx` — new `'use client'` component. Renders four controls: **Date from**, **Date to**, **Status** (All / Scheduled / In Progress / Completed / Cancelled), **Driver** (partial name search). On "Apply" pushes updated URL search params via `router.push`; on "Clear" navigates back to `/truck-schedule` with no params. Shows an active-filter count badge on the filter icon. Wrapped in `Suspense` by the parent page (required for `useSearchParams()` in App Router).
- `app/(dashboard)/truck-schedule/page.tsx` — added `Suspense` import and `TruckScheduleFilters` import; inserted the filter bar between the page header and the table card; extended `ALLOWED_PARAMS` to include `driver_name`.
- `app/api/truck-schedules/route.ts` — added `driver_name` query param: performs `de.full_name LIKE %value%` on the joined driver employee name. `driver_id` takes precedence over `driver_name` if both are present.

### Lockfile / CI check
- Verified `npm ci` passes cleanly on the `m3` branch both before and after merging `origin/development`. The reported `@emnapi` error did not reproduce on this branch; no lockfile change was committed (package.json did not change).

## Decisions made

- Driver filter uses a free-text name (LIKE) rather than a numeric ID dropdown — avoids needing a separate driver-list fetch in the filter bar. The API resolves it server-side.
- `driver_id` in the URL takes precedence over `driver_name` (useful for programmatic deep links).
- Filter bar is a separate `'use client'` file; the page itself stays a server component so filtering drives a server re-fetch rather than a client fetch.
- No commits were made this session (instructed to hold commits).

## Problems solved

- `useSearchParams()` requires a `Suspense` boundary in App Router or the production build fails — same issue as Member 1 encountered; solved with `<Suspense fallback={...}>`.
- Lockfile `@emnapi` error: did not reproduce; `npm ci` exits 0 on `m3` after merging `origin/development`. No fix was needed.

## Current state

- **Works (local, typecheck clean):** filter bar renders with all four controls; applying filters updates the URL and the server re-fetches; clearing removes all params.
- **Not committed:** all changes are local on `m3` (instructed not to commit).
- **Not yet built:** Deliveries module (`GET /deliveries`, `PATCH /deliveries/:id/complete`, `/deliveries` page) — Phase 2, blocked until Orders + Truck Scheduling are merged.

## Next session starts with

1. Commit the filter bar changes: `TruckScheduleFilters.tsx`, `page.tsx`, `route.ts`.
2. Run `npm run lint` and `npm run build` to confirm the production build is clean.
3. Open the PR `m3` → `development` with at least one reviewer.
4. After PR merges, start Phase 2: Deliveries (`GET /deliveries`, `PATCH /deliveries/:id/complete`, `/deliveries` page).

## Open questions

- Deliveries page (`app/(dashboard)/deliveries/page.tsx`) already exists as a shell — check what is already there before building.
- Confirm that `complete_delivery()` procedure exists in the migrations and check its exact signature in `18_proc_remaining.sql` before writing the PATCH handler.
- Seed §10–§11 (truck schedules, deliveries, inventory) still outstanding — coordinate timing with Member 1.

