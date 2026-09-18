# Memory — Member 1 (Dineth) Phase 1: Orders List + Order Detail Pages

Last updated: 2026-09-18

## What was built

### This session

- **`app/(dashboard)/orders/page.tsx`** — Orders list page.
  - Filters: status, destination city, date range, 300ms-debounced search — all mirrored into the URL query string via `router.replace()` so the view is shareable and survives refresh.
  - City filter options load from `GET /api/cities?destination_only=true` (reused Member 4 endpoint, not hardcoded).
  - Role-aware: City filter hidden for `store_manager` (API already forces their scope); "+ New Order" only for roles with `orders:place_order`.
  - Loading / error+retry / empty / table+pagination states, all copy verbatim from `Docs/07_content-copy.md` §/orders.
  - Split into `OrdersPageContent` + a `Suspense`-wrapped default export (required — see Problems solved).

- **`app/(dashboard)/orders/[orderId]/page.tsx`** — Order Detail page.
  - One call to `GET /api/orders/:id` for the whole composite payload; 8/4 bento grid.
  - Left: items table (Product+SKU · Qty · Unit price · Line total, with Total / Space required footer); rail transport cards with per-trip shipped items.
  - Right: customer, delivery destination, delivery status (or "Not yet scheduled for delivery."), status history timeline.
  - "This order was split across {n} train trips due to capacity." banner when `train_bookings.length > 1`.
  - Role-gated Update Status modal: legal-next-status dropdown + optional notes → in-modal confirmation step → `PATCH /api/orders/:id/status` → toast + full refetch.

- **`Docs/07_content-copy.md`** — recorded the Status History timeline-vs-table conflict resolution inline in the `/orders/[orderId]` section.
- **`.claude/launch.json`** — dev-server config so the browser preview tool can drive the app.

### Earlier in Phase 1 (already on `development`)

- `app/login/page.tsx`, `context/AuthContext.tsx` + `types/auth.ts`.
- Orders API — all 4 endpoints (`POST /api/orders`, `GET /api/orders`, `GET /api/orders/[id]`, `PATCH /api/orders/[id]/status`).
- Baseline seed modules (`scripts/seed/*`, spec §1–§8 and §12) + `lib/db.ts` pooled-connection user-context reset.

## Decisions made

- **Status History renders as a timeline, not the table doc 07 originally specified** — but each entry carries all five specified fields (From → To, Changed By, Date, Notes) so no content is lost. Rationale: `Docs/11_ui-rules.md` §1 calls the `UI/` references an implementation contract. Resolution is written into doc 07 so it doesn't resurface.
- **`StatusBadge` is deliberately duplicated** in the list and detail pages rather than extracted. A code comment marks the extraction point: do it when a third page needs the pill.
- **Status update is a single modal with two steps** (choose status + notes → explicit "This cannot be undone" confirmation), not an inline card plus separate dialog. Matches the `train-schedule` modal precedent.
- **"Print Invoice" omitted from Phase 1** — mockup-only, no endpoint, no copy, no invoice layout spec. Building it would be inventing scope.
- **Refetch after a successful PATCH, never an optimistic merge** — mandated by `Docs/05_api-and-pages.md` §347, and necessary anyway since the PATCH response carries neither the new `order_status_history` row nor the cascaded delivery cancellation.
- **Detail page drives refetch with a `refreshToken` counter** rather than a memoized fetch function, so the fetch logic exists in exactly one place (Retry and post-update refresh both just bump the token).
- **The client-side `ALLOWED_TRANSITIONS` table is a UX affordance only** — the server route stays the sole authority and its rejection message is surfaced verbatim if the two diverge (e.g. concurrent edits by two staff).
- **404 and 403 share one message** on the detail page ("This order doesn't exist or you don't have access to it.") — preserves the API's deliberate non-disclosure of cross-city order existence.

## Problems solved

- **ESLint `react-hooks/set-state-in-effect`** — calling a `useCallback`-memoized function that sets state *synchronously inside a `useEffect` body* is flagged; defining the loader **inline inside the effect** is not. This is why `train-schedule/page.tsx` duplicates its fetch logic. Also: "reset to page 1 on filter change" must live in the `onChange` handlers, not in a derived effect.
- **`useSearchParams()` fails the production build** with "missing-suspense-with-csr-bailout" during prerender. Fix: split the component and wrap it in `<Suspense>`. `useParams()` does **not** need this — the detail page is fine without it.
- **Stale `.next/types/validator.ts`** produces phantom `tsc` errors referencing other branches' routes. Run `rm -rf .next/types` before typechecking.
- **Next.js static segments beat dynamic ones** — once `app/(dashboard)/orders/new/page.tsx` exists it automatically claims `/orders/new` from `[orderId]`. No config needed, no change to the detail page. `lib/rbac.ts:283` already excludes `/orders/new` from the dynamic-pattern permission match, so the collision was anticipated.

## Current state

- **Pages backed by real data (5):** `/login`, `/admin/master-data`, `/train-schedule`, `/orders`, `/orders/[orderId]`.
- Still mock: `/inventory`, `/admin/users`, `/admin/audit-log`, `/truck-schedule`, `/truck-schedule/new`, `/deliveries`. `/reports` has tabs only. **`/dashboard` still 404s** and the sidebar links to it.
- **Lint, typecheck and build all pass.**
- **Verified live in browser:** orders list (filter change re-fetches with correct query string, URL syncs, empty state, RBAC-gated CTA appears for clerk / hidden for logistics manager); detail page 404 path and malformed-param guard, both showing the correct copy.
- **NOT verified — no order data exists on the shared dev DB.** The detail page's populated layout (items table, rail cards, split-trip banner, delivery card, history timeline) and the entire status-update flow are untested against real data.
- `/orders/new` currently falls through to `[orderId]` and shows the not-found message for `order_entry_clerk` (plain 404 for `logistics_manager`, whom the proxy blocks from that route). Cosmetic and self-resolving once the page is built.
- **Branches:** local `dineth` is **44+ commits ahead of a stale `origin/dineth`** — the seed work, both orders pages, and the `development` merge are all **local only and still unpushed**. Member 3's `m3` is not merged.
- Test role logins exist per `scripts/seed/test-accounts.ts` (logistics / clerk / store.colombo / fleet @kandypack.lk); password comes from `SEED_TEST_PASSWORD` in `.env.local`.

## Next session starts with

**Push `dineth` to origin first** — 44+ commits of work exist only on this machine.

Then build **seed sections §9–§11** (45 orders across two quarters + the overflow test order, ~20 truck schedules with deliveries, derived inventory transactions). Doing this before `/orders/new` is deliberate: it simultaneously unblocks visual verification of the Order Detail page *and* the Phase 1 overflow gate check. Past-quarter orders must be inserted directly, since `place_order` only books upcoming trips.

## Remaining Phase 1 work for Member 1

1. Seed §9–§11 (above).
2. `/orders/new` page — customer search, city/area/address, 7-day date rule (client-side for UX only), item lines, totals. `delivery_area` must match a seeded coverage-area name exactly (case-insensitive) — use a dropdown, not free text.
3. Verify the overflow case — an order exceeding the 50-unit trip's free space must produce 2+ `train_bookings` rows with `booked_space` never exceeding capacity. Record the order ID in the seed comments. **Phase 1 gate item.**
4. Ship it — lint/typecheck/build, manual role checks, tick `Docs/09_task-tracker.md`, PR `dineth` → `development` with one reviewer.

## Open questions

- **Order Detail populated layout is unverified.** Deliberately did *not* create a throwaway order on the shared dev DB: order IDs 1–45 are reserved for the seed, and the DB is shared with other members. Needs either the §9–§11 seed or explicit authorization for one test order.
- The overflow/split-trip banner in particular can only be genuinely proven against the 50-unit trip scenario.
- **Member 4 follow-ups** (non-blocking, raised on PR #9): soft-delete his test rows on shared dev (product 13, customer 25, employee 31 + assistant 9, route 13 + coverage 39); blank coverage-area names are still dropped silently when others are valid; `mockData.ts` still exports ~600 unused lines.
- **Team-wide doc conflicts still unresolved:** money fields as strings (doc 05) vs numbers (current code); doc 05's `/reports` section still describes PDF job polling; procedure signatures in doc 05 don't match the actual `receive_goods_at_store` / `complete_delivery` / `schedule_truck_delivery`.
- `DATABASE_URL`'s `ssl-mode=REQUIRED` is ignored by mysql2 and `lib/db.ts` sets `rejectUnauthorized: false` — encrypted but unverified certificate. Tidy-up for later.
