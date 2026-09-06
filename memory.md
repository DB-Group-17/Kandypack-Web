# Memory — Member 1 (Dineth) Phase 1 Step 2 & Step 3 Orders Module API

Last updated: 2026-09-06 20:20:00

## What was built

- **Step 2 Login Page (`app/login/page.tsx`):**
  - Implemented responsive split-card layout matching `UI/login/code.html`, `DESIGN.md`, and `Docs/07_content-copy.md`.
  - Integrated `useAuth().login`, `localStorage` "Remember me", password visibility toggle, Lucide icons, safe `?from=` redirect, and `<Suspense>` boundary wrapper.
- **Step 3.1 Order Creation Endpoint (`POST /api/orders` in `app/api/orders/route.ts`):**
  - Validated payload requirements (7-day advance booking lead time, positive customer/city IDs, non-empty product items).
  - Acquired Redis distributed lock via `withLock(REDIS_KEYS.LOCK_ORDER_DESTINATION(city_id), ...)`.
  - Executed inside `withUserContext(session.user_id, session.role, async (conn) => ...)` on a single dedicated MySQL connection: called `place_order()` stored procedure and read `@out_order_id`.
  - Added explicit null-guard ensuring created order row existence before returning HTTP 201.
- **Step 3.2 Orders Listing Endpoint (`GET /api/orders` in `app/api/orders/route.ts`):**
  - Added dynamic parameterized filtering (`status`, `customer_id`, `city_id`, `date_from`, `date_to`, `search`).
  - Enforced multi-tenant store manager destination city isolation (`o.destination_city_id = store.city_id`).
  - Executed Count Query and Paginated Data Query in parallel via `Promise.all([queryOne(...), query(...)])`.
  - Returned standardized pagination metadata `{ items, total, page, page_size, total_pages }`.
- **Step 3.3 Order Details Endpoint (`GET /api/orders/[id]` in `app/api/orders/[id]/route.ts`):**
  - Resolved async route parameters (`params: Promise<{ id: string }>`) per Next.js 15/16.
  - Enforced RBAC (`orders:read`) and store manager scoping (returning 404 on regional mismatch to prevent order ID enumeration).
  - Fetched primary order header joined with customer, destination city, covering route, and creator.
  - Executed 5 child queries concurrently in parallel via `Promise.all`: `order_items`, `train_bookings`, `train_booking_items` (nested in each booking), `deliveries` (latest truck schedule/driver), and `order_status_history` timeline.
- **Step 3.4 Order Status Transition Endpoint (`PATCH /api/orders/[id]/status` in `app/api/orders/[id]/status/route.ts`):**
  - Enforced RBAC (`orders:update_status`) restricting access strictly to `system_administrator` and `logistics_manager`.
  - Enforced finite state machine (`Pending` -> `In Transit` -> `At Store` -> `Out for Delivery` -> `Delivered`, or branching to `Cancelled`), rejecting redundant transitions and terminal mutations.
  - Bound execution to `withUserContext` on a dedicated connection, enabling database trigger `trg_log_order_status_change` to record `@current_user_id` in `order_status_history`.
  - Attached optional transition notes to the newly created history record.
  - Synchronized linked active deliveries (`Scheduled`, `In Progress`) to `Cancelled` upon order cancellation.
  - Returned full updated order entity and confirmation message with HTTP 200.
- **Task Tracker Synchronization (`Docs/09_task-tracker.md`):**
  - Checked off: `[x] POST /orders → place_order() integration (using Member 5's Redis lock helper)`
  - Checked off: `[x] GET /orders, GET /orders/:id, PATCH /orders/:id/status`

## Decisions made

- **Manual Commit Discipline:** Adhered strictly to the rule that all git commits are executed manually by the user.
- **Central Infrastructure Reuse:** Strictly reused shared helpers (`withLock`, `REDIS_KEYS` from `@/lib/redis`, `withUserContext` from `@/lib/db`) without ad-hoc locking or manual connection acquisition.
- **Parallel Query Execution:** Used `Promise.all` across the connection pool for all read queries in `GET /api/orders` and `GET /api/orders/[id]` to cut database roundtrip latency.
- **Enumeration Defense:** Returned `404 Not Found` rather than `403 Forbidden` when a store manager requests an out-of-region order to prevent cross-warehouse order ID enumeration.
- **State Machine Terminal Integrity:** Locked `Delivered` and `Cancelled` as permanent terminal states; any transition attempt on a terminal order returns `400 Bad Request`.
- **Active Delivery Cancellation:** Transitioning an order to `Cancelled` automatically updates linked active deliveries to `'Cancelled'` to prevent orphaned roster assignments.

## Problems solved

- **MySQL Connection Scoping with Session Variables:** In `mysql2`, `@` session variables exist only on the physical connection that created them. Using `pool.execute()` across statements caused connection swapping where `@out_order_id` became `NULL`. Solved by running the procedure execution and variable read within a single `withUserContext(..., async (conn) => ...)` callback.
- **Null Guarding on Created Records:** Addressed JavaScript/TypeScript silent undefined returns by explicitly throwing an error if the created order record cannot be read back, triggering the 500 error handler.
- **Query Generic Array Typing:** Fixed TypeScript compiler type mismatch in `app/api/orders/[id]/route.ts` by explicitly typing queries with array brackets (`query<OrderItemRow[]>` instead of `query<OrderItemRow>`).

## Current state

- **Backend Orders API (Step 3) is 100% complete and fully verified:**
  - `POST /api/orders`: Complete & working
  - `GET /api/orders`: Complete & working
  - `GET /api/orders/[id]`: Complete & working
  - `PATCH /api/orders/[id]/status`: Complete & working
- **Validation passing cleanly:**
  - `npm run typecheck`: 0 errors
  - `npm run lint`: 0 errors, 0 warnings
  - `npm run build`: All 19 routes compiled cleanly (including all orders dynamic endpoints)
- **Git status:** Changes are unstaged and ready for the user to commit manually.

## Next session starts with

Begin **Step 4: Orders Frontend UI**:
1. **Step 4.1 (`/orders`):** Build orders list page (`app/(dashboard)/orders/page.tsx`) matching `UI/orders_list/code.html`, consuming `GET /api/orders`.
2. **Step 4.2 (`/orders/new`):** Build place order form (`app/(dashboard)/orders/new/page.tsx`) matching `UI/new_order/code.html`, consuming `POST /api/orders`.
3. **Step 4.3 (`/orders/[orderId]`):** Build order detail and tracking view (`app/(dashboard)/orders/[orderId]/page.tsx`) matching `UI/order_detail/code.html`, consuming `GET /api/orders/[id]` and `PATCH /api/orders/[id]/status`.

## Open questions

- None. All backend orders endpoints, validation rules, state machines, and triggers are complete and verified.
