# Kandypack — System Architecture

**Version:** 1.0
**Based on:** Project_Description.md, Kandypack_SRS_v1.0, Kandypack_Database_Schema_v4.0 (MySQL 8.0 / Aiven)

---

## 1. Project Overview

- Kandypack is a rail + road FMCG distribution system for a Kandy-based manufacturer.
- Two-stage distribution: bulk rail transport (Kandy → 6 destination cities) → city store → last-mile truck delivery.
- Replaces Excel-based tracking with a database-driven platform enforcing business rules at the DB level (triggers, procedures, constraints).
- Basic web UI for 5 staff roles: System Administrator, Logistics Manager, Order Entry Clerk, Store Manager, Fleet Supervisor.
- Produces 6 management reports (CSV + PDF export).

---

## 2. Scope

### 2.1 In Scope
- Order placement with 7-day lead-time rule and route-coverage validation.
- Train trip scheduling with cargo-space capacity enforcement + overflow-to-next-trip logic.
- Store inventory tracking (goods received, stock levels, dispatch deductions).
- Truck/route scheduling with driver & assistant roster rule enforcement.
- Delivery completion → automatic order status update.
- 6 management reports, each exportable as CSV and PDF.
- Role-based access control (5 roles, JWT-based, app-layer enforced — no DB-level RLS since MySQL has none).
- Audit logging of all create/update/delete actions.
- Web UI (desktop-first, modern browsers).

### 2.2 Out of Scope
- Mobile app / native mobile interface.
- Real-time GPS tracking of trucks.
- Electronic integration with Sri Lanka Railways (schedules entered manually).
- Driver or customer login accounts *(kept as data-only records — decision confirmed)*.
- Label printers / barcode scanners / hardware interfaces.
- Automatic failover / multi-region DB replication.

---

## 3. Assumptions & Documented Deviations from SRS

- **Deployment:** SRS assumes a self-hosted on-prem Linux server at Kandy. This project instead deploys the entire app (web + background jobs via Inngest) to **Vercel**, with Redis (Upstash) and MySQL (Aiven) as external managed services. *(Deviation confirmed — documented here as required.)*
- **Database:** SRS allows MySQL 8.0 or PostgreSQL 14+. This project uses **MySQL 8.0 on Aiven** (per Schema v4 migration).
- **Auth:** Manual (`users` table + bcrypt + JWT), not a third-party auth provider — matches Schema v4 §8.
- **Roles:** Only the 5 roles defined in `user_profiles.app_role` can log in. Drivers and customers are data rows only, never authenticate.
- **Reports:** SRS specifies CSV only. This project adds **PDF export via background worker** on top of CSV, per stakeholder decision.
- Product space rates, train capacity (500 units/trip default), and train frequency follow SRS §2.7 assumptions — configurable in DB, not hardcoded.

---

## 4. Tech Stack

### Application Layer
- **Framework:** Next.js (App Router) — frontend + API routes
- **Language:** TypeScript
- **Database access:** **Plain SQL — no ORM.** `mysql2` driver with a connection pool; parameterized queries; `CALL procedure_name(...)` for stored procedures
- **Auth:** Custom JWT (HttpOnly cookie) + bcrypt, per Schema v4 §8 — no NextAuth/Supabase Auth, no public sign-up (see §6)
- **Styling/UI:** Tailwind CSS + `lucide-react` + `react-icons`

### Data & Infra
- **Primary DB:** MySQL 8.0 on **Aiven** (`ssl-mode=REQUIRED`)
- **Cache / Locks:** Redis — **Upstash** (serverless REST) for caching, rate-limiting, distributed locks
- **Background jobs:** **Inngest** — serverless job runner, no dedicated worker host needed (see §11)
- **PDF Generation:** `puppeteer-core` + `@sparticuz/chromium` (serverless-compatible headless Chrome), run inside an Inngest function on Vercel
- **File Storage:** **Cloudflare R2** (free tier, no egress fees) for generated PDFs
- **CSV Export:** generated synchronously in the API route (fast, no queue needed)

### Deployment & Ops
- **Web app + background jobs:** Vercel (Inngest functions run as Vercel serverless functions — no separate worker host required)
- **CI/CD:** GitHub Actions
- **Containerization:** Docker is **optional**, not required for production. One root-level `docker-compose.yml` can containerize the *entire* stack (web app + Redis, MySQL optional) as a self-hosting alternative to Vercel — no separate worker-only container.

---

## 5. Folder Structure

```
kandypack/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── orders/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [orderId]/page.tsx
│   │   ├── train-schedule/
│   │   ├── truck-schedule/
│   │   │   ├── page.tsx
│   │   │   └── new/page.tsx
│   │   ├── deliveries/
│   │   ├── inventory/
│   │   ├── reports/
│   │   └── admin/
│   │       ├── users/              # create/deactivate accounts, assign roles
│   │       ├── master-data/
│   │       └── audit-log/
│   └── api/
│       ├── inngest/route.ts        # single Inngest handler (serves all background functions)
│       └── ...                     # all other API routes (see §7)
├── inngest/
│   ├── client.ts                   # Inngest client config
│   └── functions/
│       └── generate-report-pdf.ts  # PDF generation step function
├── components/
├── lib/
│   ├── db.ts                       # mysql2 pool + query/call helpers (no ORM)
│   ├── auth.ts                     # JWT sign/verify, session helpers
│   ├── redis.ts                    # Upstash client, lock helpers
│   ├── rbac.ts                     # role → allowed routes/actions map
│   └── rate-limit.ts               # per-route rate limiting
├── middleware.ts                   # JWT verification on protected routes
├── db/
│   ├── migrations/                 # 01_auth.sql … 20_seed.sql (Schema v4 order)
│   └── schema-docs/
├── tests/
│   ├── unit/                       # space calc, roster hours, 7-day rule
│   ├── integration/                # place_order, schedule_truck_delivery against test DB
│   └── api/                        # auth login route test
├── .github/workflows/
│   └── ci.yml                      # lint, typecheck, tests (w/ MySQL service container), migration check
├── docker-compose.yml              # OPTIONAL: full self-hosted stack (web + redis, mysql optional)
└── architecture.md
```

---

## 6. Authentication & Roles

- Login: `POST /api/auth/login` → bcrypt compare → JWT `{ sub: user_id, role, store_id, exp }` in HttpOnly cookie (per Schema v4 §8.1).
- `middleware.ts` verifies JWT on every protected route; injects `user_id`/`role`/`store_id` into request context.
- Every DB connection used by a request sets `@current_user_id` / `@current_app_role` session variables before calling procedures (required by triggers/audit logging).
- **Role → access** (from Schema v4 §9 Access Control Matrix):

| Role | Access summary |
|---|---|
| system_administrator | Full access to everything, including user management, audit log |
| logistics_manager | Orders (read/update), train trips/bookings (full), reports |
| order_entry_clerk | Place orders, view own-entered orders, customers (read+insert) |
| store_manager | Own store's inventory + goods receipt, own-city orders (read) |
| fleet_supervisor | Truck schedules/deliveries (full), trucks/drivers/assistants (read) |

- Drivers/customers: **no login** — referenced only as data (`drivers`, `customers` tables).

### 6.1 How Orders Get Placed Without the Customer Signing In
- Customers never authenticate. A signed-in staff member (typically `order_entry_clerk`) enters the order **on the customer's behalf** — via phone, in person, or email.
- `orders.customer_id` links the order to the `customers` record (name/phone/address).
- `orders.created_by` links to the staff member's `user_profiles.user_id` — this is how the system tracks *who* entered it, for accountability/audit.
- No customer session, cookie, or account exists anywhere in this flow.
- *A true self-service customer ordering flow (no staff involved) is not part of this design — see note below.*

### 6.2 Customer Self-Login — Decision
- **Not implemented in v1.** The system is staff-mediated (B2B/wholesale distribution), matching the SRS's clerk-enters-orders model.
- Adding customer accounts would require: new auth surface, customer-scoped data isolation, password reset flow — extra scope not required by the SRS.
- Documented here as a **future enhancement**, not built now.

### 6.3 Account Creation — Admin-Only, No Public Sign-Up
- There is **no public sign-up page.** New accounts are created exclusively by a `system_administrator` from `/admin/users`: set email, generate/send a temporary password, assign one of the 5 roles.
- **First admin account** is not created through the UI (no admin exists yet to do it) — it's inserted directly via the seed script (`20_seed.sql` or a one-time bootstrap script) with a pre-hashed bcrypt password.

---

## 7. API Routes

All routes under `/api/`. Auth required on all except `/auth/login`.

### Auth
| Route | Method | Description |
|---|---|---|
| `/auth/login` | POST | Validate credentials, issue JWT cookie |
| `/auth/logout` | POST | Clear session cookie |
| `/auth/me` | GET | Return current user's profile + role |

### Dashboard
| Route | Method | Description |
|---|---|---|
| `/dashboard/summary` | GET | Pending orders count, today's train departures, active truck schedules, low-stock alerts (cached in Redis, short TTL) |

### Customers & Master Data
| Route | Method | Description |
|---|---|---|
| `/customers` | GET | List/search customers |
| `/customers` | POST | Create customer (order_entry_clerk+) |
| `/products` | GET | List products (with space rate, unit price) |
| `/products` | POST/PATCH | Admin: create/edit product |
| `/cities` | GET | List the 6 destination cities |
| `/routes` | GET | List delivery routes + coverage areas |
| `/routes` | POST | Admin: create route + coverage areas |

### Orders
| Route | Method | Description |
|---|---|---|
| `/orders` | GET | Filterable/searchable order list |
| `/orders` | POST | Calls `place_order()` — validates 7-day rule, route coverage, books train space with overflow handling |
| `/orders/:id` | GET | Full order detail incl. items, status history |
| `/orders/:id/status` | PATCH | Manual status override (admin/logistics_manager) |

### Train Scheduling
| Route | Method | Description |
|---|---|---|
| `/train-trips` | GET | List trips with booked/remaining capacity (calendar view data) |
| `/train-trips` | POST | Create new trip (logistics_manager/admin) |
| `/train-trips/:id/capacity` | GET | Calls `get_available_capacity()` |

### Store Inventory
| Route | Method | Description |
|---|---|---|
| `/stores/:id/inventory` | GET | Current stock levels at a store |
| `/stores/:id/receive-goods` | POST | Calls `receive_goods_at_store()` — increments inventory from an arrived trip |
| `/inventory/transactions` | GET | Transaction history (receive/dispatch/adjustment) |

### Fleet & Truck Scheduling
| Route | Method | Description |
|---|---|---|
| `/trucks` | GET | List trucks |
| `/drivers` | GET | List drivers + current weekly hours |
| `/assistants` | GET | List assistants + current weekly hours |
| `/truck-schedules` | GET | List/filter truck schedules |
| `/truck-schedules` | POST | Calls `schedule_truck_delivery()` — overlap + roster + weekly-hour checks |
| `/truck-schedules/:id/conflicts` | GET | Pre-check conflicts before submit (UI live-validation) |

### Deliveries
| Route | Method | Description |
|---|---|---|
| `/deliveries` | GET | List deliveries (filter by status) |
| `/deliveries/:id/complete` | PATCH | Calls `complete_delivery()` → triggers order status update |

### Reports
| Route | Method | Description |
|---|---|---|
| `/reports/quarterly-sales` | GET | Report 1 (JSON, for on-screen table) |
| `/reports/most-ordered-items` | GET | Report 2 |
| `/reports/city-route-sales` | GET | Report 3 |
| `/reports/driver-assistant-hours` | GET | Report 4 |
| `/reports/truck-usage` | GET | Report 5 |
| `/reports/customer-history` | GET | Report 6 |
| `/reports/:type/export/csv` | GET | Stream CSV directly (synchronous, no queue) |
| `/reports/:type/export/pdf` | POST | Trigger Inngest PDF job, return `job_id` |
| `/reports/jobs/:job_id` | GET | Poll PDF job status; returns file URL when done |

### Admin
| Route | Method | Description |
|---|---|---|
| `/users` | GET | List login accounts (admin only) |
| `/users` | POST | Create a new login account + assign role (admin only — this is the **only** way an account gets created; no public sign-up) |
| `/users/:id` | PATCH | Activate/deactivate account, change role |
| `/employees` | GET/POST | Manage employee master data |
| `/audit-log` | GET | View audit trail (admin only) |

**Rate limiting applied at:** `/auth/login`, `/orders` (POST), `/truck-schedules` (POST), `/reports/:type/export/pdf` (POST), plus a global per-IP/per-user baseline across all `/api/*` routes.

---

## 8. Pages

| Page | Route | Description | Roles |
|---|---|---|---|
| Login | `/login` | Username/password form | All (unauthenticated) |
| Dashboard | `/dashboard` | Summary cards: pending orders, today's departures, active schedules, low stock | All |
| Orders List | `/orders` | Filterable/searchable order table | order_entry_clerk, logistics_manager, admin (own-city for store_manager) |
| Place New Order | `/orders/new` | Customer select, line items, delivery date, live 7-day + route validation | order_entry_clerk, admin |
| Order Detail | `/orders/[orderId]` | Full order info, items, status history, linked delivery | Role-scoped per matrix |
| Train Schedule | `/train-schedule` | Calendar of trips, booked/remaining capacity, add-trip form | logistics_manager, admin |
| Truck Schedule List | `/truck-schedule` | View schedules, conflict/roster status | fleet_supervisor, admin |
| New Truck Schedule | `/truck-schedule/new` | Assign truck/driver/assistant/route with live conflict warnings | fleet_supervisor, admin |
| Deliveries | `/deliveries` | Mark deliveries complete, add notes | fleet_supervisor, admin |
| Store Inventory | `/inventory` | Stock levels per store, receive-goods form | store_manager (own store), admin |
| Reports | `/reports` | Run all 6 reports, date-range filters, CSV/PDF export buttons | logistics_manager, admin (broader); others per matrix |
| Admin: Users | `/admin/users` | Create/deactivate login accounts, assign roles | admin only |
| Admin: Master Data | `/admin/master-data` | Manage products, routes, cities, employees, trucks | admin only |
| Admin: Audit Log | `/admin/audit-log` | Browse audit trail | admin only |

---

## 9. Database Schema (Summary)

*(Full DDL, triggers, procedures already defined in Schema v4 — this is the architecture-level reference.)*

### Core entity groups
- **Auth:** `users`, `user_profiles` (role, employee link)
- **Master data:** `cities`, `customers`, `products`, `stores`
- **People/fleet:** `employees`, `drivers`, `assistants`, `trucks`
- **Routing:** `routes`, `route_coverage_areas`
- **Orders:** `orders`, `order_items`, `order_status_history`
- **Rail:** `train_trips`, `train_bookings`, `train_booking_items`
- **Inventory:** `store_inventory`, `inventory_transactions`
- **Fleet ops:** `truck_schedules`, `deliveries`
- **Audit:** `audit_log`

### Business rules enforced at DB level
| Rule | Mechanism |
|---|---|
| 7-day advance order lead time | `CHECK` constraint + `trg_fn_validate_order_date` (defense-in-depth) |
| Train capacity not exceeded | `chk_tt_not_overbook` + `trg_fn_check_trip_capacity` |
| Overflow to next available trip | Inlined into `place_order()` procedure |
| Driver/assistant/truck no overlapping bookings | `trg_fn_validate_truck_schedule` |
| Driver ≤ 40 hrs/week, assistant ≤ 60 hrs/week | `fn_driver_chain_length()` / `fn_assistant_chain_length()` + trigger checks |
| Delivery completion → order status update | `trg_fn_delivery_complete_order` |
| Soft deletes only | `is_deleted`/`deleted_at` pattern + `trg_fn_prevent_hard_delete` |
| Auto-maintained totals | Triggers on `orders.total_value`, `total_space_required`, `train_trips.booked_space`, `store_inventory.quantity_on_hand` |
| Audit trail | One dedicated trigger per table → `audit_log` |

### Key procedures/functions
- `place_order()`, `schedule_truck_delivery()`, `complete_delivery()`, `receive_goods_at_store()`
- `calculate_order_space()`, `get_available_capacity()`, `get_driver_weekly_hours()`, `get_assistant_weekly_hours()`, `get_next_available_trip()`

### Reporting views
`v_quarterly_sales`, `v_most_ordered_items`, `v_city_route_sales`, `v_driver_hours`, `v_assistant_hours`, `v_truck_usage_monthly`, `v_customer_order_history`

---

## 10. Redis Usage

| Use case | Purpose |
|---|---|
| **Train trip capacity lock** | Distributed lock (`SET NX EX`) on `trip_id` during the check-then-book step in `place_order` flow — belt-and-braces alongside DB row locking |
| **Roster conflict check lock** | Short-lived lock on `driver_id`/`assistant_id` during `schedule_truck_delivery` to prevent two simultaneous bookings racing past the trigger check |
| **PDF report job triggering** | Inngest handles queuing/retries internally — Redis not needed for this (see §11) |
| **Report result caching** | Cache heavy aggregate report queries (quarterly sales, city-wise breakdown) with a TTL (e.g. 1 hour) |
| **Dashboard summary cache** | Cache `/dashboard/summary` for ~30–60s to avoid recomputing on every load |
| **Rate limiting** | Protect `/orders` (place_order) and `/auth/login` from abuse |
| **Session/deny-list** | Optional: JWT deny-list for logout-before-expiry |

---

## 11. Background Jobs — PDF Generation via Inngest

**Why Inngest (not BullMQ + a dedicated worker):**
- Inngest functions run as **serverless functions on Vercel** via a single `/api/inngest` route — no separate always-on worker process or host to deploy/maintain.
- Handles retries and durable step execution out of the box, which helps with a slower step like PDF rendering.
- Removes the need to Dockerize or separately deploy a worker service at all — the entire app (web + background jobs) lives on Vercel.

Flow:
1. `POST /reports/:type/export/pdf` → API inserts a `report_jobs` row (`status: pending`) + sends an event to Inngest (`report/pdf.requested`)
2. API returns `job_id` immediately (202 Accepted)
3. Inngest function (running as a Vercel serverless function): runs the report query → renders PDF using `puppeteer-core` + `@sparticuz/chromium` (serverless-compatible headless Chrome) → uploads to **Cloudflare R2** → updates `report_jobs.status = done` + `file_url`
4. Frontend polls `GET /reports/jobs/:job_id` until `done`

**Note:** persist job status in a DB table (`report_jobs`), not just Inngest's internal state — the frontend needs a simple thing to poll.

CSV export stays **synchronous** (fast, no queue needed).

**PDF storage — Cloudflare R2** (free tier: 10GB storage, no egress fees — the best free option here since staff will be downloading reports regularly). Vercel Blob is a simpler fallback if you'd rather stay single-vendor.

---

## 12. Docker & CI/CD

### Docker — Optional, Whole-Project Only
- **No dedicated worker container** — Inngest removed that need entirely (§11).
- **Production default:** Vercel builds and runs the Next.js app natively, no Docker involved.
- **Docker as an alternative:** one root-level `docker-compose.yml` that containerizes the **entire project** (web app + Redis, MySQL optional) for anyone who wants to self-host instead of using Vercel. This is offered as an *option*, not the primary deployment path.

### CI/CD (GitHub Actions) — where it applies

| Stage | Trigger | What it does |
|---|---|---|
| **Lint + typecheck** | Every PR | ESLint, `tsc --noEmit` — blocks merge on failure |
| **Automated tests** | Every PR + push to `main` | Spins up a MySQL service container in the runner, applies migrations, runs the Vitest suite (unit + integration tests from §16) |
| **Migration check** | Every PR touching `db/migrations` | Runs migrations 01→20 against the same throwaway MySQL service container to catch SQL errors before merge |
| **Vercel** | Push to `main`/PR | Handled automatically by Vercel's own Git integration — no custom workflow needed, but can add a required "Vercel Preview" check on PRs |

**Summary:** with Inngest removing the separate-worker requirement, CI/CD now only needs to cover code quality gates + the automated test suite. No Docker build/push/deploy job is needed at all — everything ships through Vercel's native Git integration.

---

## 13. Concurrency & Race-Condition Handling

Three hotspots, each with a primary DB-level defense and an optional Redis-level defense:

1. **Train capacity booking** (`place_order`)
   - Primary: `SELECT ... FOR UPDATE` on the trip row inside the procedure's transaction; `chk_tt_not_overbook` as a hard backstop
   - Optional: Redis lock on `trip_id` before calling the procedure, to fail fast under contention
2. **Driver/assistant/truck scheduling conflicts** (`schedule_truck_delivery`)
   - Primary: transaction + row lock while checking overlap/roster rules before insert; `trg_fn_validate_truck_schedule` as backstop
   - Optional: Redis lock on `driver_id`/`assistant_id`/`truck_id` for the duration of the check
3. **Duplicate order submissions** (double-click / retry)
   - Idempotency key from client, checked against a short-TTL Redis key before calling `place_order`

General principles:
- Keep locked/transactional sections small — lock, check, write, unlock.
- All multi-step operations (order placement, truck scheduling) run inside a single DB transaction so a failure at any step rolls back cleanly (per REQ-NF-006).
- Redis locks always carry a TTL so a crashed process can't hold a lock forever.

---

## 14. Error Handling Strategy

- API routes return a consistent JSON error shape: `{ error: { code, message, field? } }`.
- DB `SIGNAL SQLSTATE '45000'` errors from triggers/procedures are caught and mapped to user-facing messages (per REQ-NF-007's requirement for meaningful error text).
- Distinguish 4xx (validation, business-rule violation) from 5xx (unexpected/system) at the API boundary.

---

## 15. Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Aiven MySQL connection (`ssl-mode=REQUIRED`) |
| `JWT_SECRET` | Sign/verify auth tokens |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Caching, rate limiting, distributed locks |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest client + function auth |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 — storing generated PDFs |
| `NODE_ENV` | Environment flag |

All secrets stored in Vercel's environment variables — never committed (per REQ-NF-011). Since everything runs on Vercel now, there's a single secret store instead of two.

---

## 16. Testing Strategy — Time-Boxed

Limited time budget → **prioritize highest-risk business logic, skip UI/e2e entirely.**

| Priority | What | Type | Library |
|---|---|---|---|
| 1 | 7-day lead-time check, train space calculation, driver/assistant weekly-hour math | Unit (pure functions, no DB) | **Vitest** |
| 2 | `place_order()` — capacity check + overflow-to-next-trip behavior | Integration, against a real throwaway MySQL instance | **Vitest** + `mysql2` |
| 3 | `schedule_truck_delivery()` — overlap rejection + roster rule rejection | Integration | Vitest + `mysql2` |
| 4 | `POST /auth/login` — correct password succeeds, wrong password rejected | API route test | Vitest, invoking the route handler directly (no Supertest needed) |

**Explicitly out of scope given time constraints:** UI component tests, e2e (Playwright/Cypress), CSV/PDF output content tests.

**Manual checklist (not automated):** the 10-step Deployment Checklist in Schema v4 §10 (place_order, receive_goods_at_store, complete_delivery, audit_log, active-delivery trigger) — run once manually after deploy.

**CI enforcement:** the GitHub Actions test job (§12) runs the full Vitest suite against a MySQL service container on every PR and on merge to `main` — failing tests block the merge.

---

## 17. Data Seeding Strategy

Per SRS §6.5 minimum test data, seeded via `20_seed.sql` (must run after `users`/`user_profiles` per v4 §11):
- 10+ products, 20+ customers across all 6 cities, 10+ routes (1+ per city)
- Valid train schedule, 2+ trips per city, defined capacities
- 8+ drivers, 8+ assistants, 6+ trucks
- 40+ orders across ≥2 quarters, with some completed deliveries and ≥5 pending deliveries

---

## 18. Non-Functional Targets (from SRS §5.1–5.4)

- Order placement (incl. capacity check + booking): < 3s under 20 concurrent users
- Truck schedule creation with validation: < 2s
- Reports: < 10s against up to 10,000 orders
- 99% uptime during business hours (06:00–22:00, Mon–Sat)
- Schema/SQL kept portable across MySQL 8.0 (current) — avoid MySQL-only syntax where reasonably possible, per SRS §5.4 Portability note
