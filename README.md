# Kandypack: rail and road supply chain distribution system

Kandypack is a database-driven logistics platform for a mid-sized FMCG manufacturer in Kandy, Sri Lanka. It replaces Excel tracking for the full flow of goods: orders are placed at least 7 days ahead, booked onto train trips with limited cargo capacity, received at stores near railway stations, and delivered to customers by truck on predefined routes with driver and assistant rosters. Management reports cover sales, top products, city and route breakdowns, working hours, truck usage and customer history.

**Live site:** https://dinethnimsara.dpdns.org

## Key features

- Order placement with the 7-day rule, route matching, train space calculation and overflow to the next trip (`place_order` stored procedure).
- Train schedule with per-trip capacity, plus manual trip status (Scheduled, Departed, Arrived).
- Truck scheduling with driver and assistant conflict checks, consecutive-route and weekly-hour limits, and orders attached at creation.
- Store inventory, goods receiving and delivery completion.
- Master data, user administration and an audit log.
- Six management reports with CSV and PDF export.
- Role-based access control for five roles, with no public sign-up.

## Technologies

| Area | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Proxy), React 19, TypeScript |
| Styling | Tailwind CSS 4 (shared design system in `DESIGN.md`) |
| Database | MySQL on Aiven: tables, foreign keys, indexes, stored procedures, functions and triggers (`db/migrations/`) |
| Cache, locks, rate limiting | Upstash Redis |
| Authentication | bcrypt password hashing, JWT session cookie, role map in `lib/rbac.ts` |
| Testing | Vitest (unit, API route and integration tests against a real database) |
| CI/CD | GitHub Actions (lint, typecheck, tests, migration check, deploy) |
| Containers | Docker (Node 22 standalone image), Caddy reverse proxy |

## Hosting

Production runs on a single **AWS EC2** instance (Ubuntu, Elastic IP) with two containers: the Next.js app and **Caddy**, which serves HTTPS for `dinethnimsara.dpdns.org` with automatic Let's Encrypt certificates. Every merge to `main` that passes CI builds an image, pushes it to GitHub Container Registry, deploys over SSH, health-checks it and rolls back automatically if it is unhealthy. The database is hosted on Aiven and the cache on Upstash. Details are in [`Docs/03_architecture.md`](Docs/03_architecture.md) section 12 and [`Docs/10_local-setup.md`](Docs/10_local-setup.md).

## Team and contributions

The planned split is in [`Docs/08_workload-division.md`](Docs/08_workload-division.md). Each member built both the backend and the frontend of their own modules.

### Dineth Nimsara: foundation, authentication, orders and deployment

- **Foundation**
  - Backend: Next.js scaffold, all migrations in `db/migrations/` and the schema, `lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`, `lib/password.ts`, `proxy.ts`, seed scripts in `scripts/seed/`.
  - Frontend: auth context and `useAuth()` in `context/`.
- **Authentication**
  - Backend: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
  - Frontend: `/login`.
- **Orders**
  - Backend: `/api/orders`, `/api/orders/[id]`, `/api/orders/[id]/status` (calls the `place_order` procedure).
  - Frontend: `/orders` (list), `/orders/new` (place order), `/orders/[orderId]` (detail).
- **Train trip status**
  - Backend: `/api/train-trips/[id]` (Scheduled, Departed, Arrived; departure moves orders to In Transit).
  - Frontend: "Mark departed" and "Mark arrived" actions on `/train-schedule`.
- **Truck schedule order attachment**
  - Backend: `/api/truck-schedules/eligible-orders`, and `order_ids` support in `/api/truck-schedules`.
  - Frontend: "Orders to deliver" checklist on `/truck-schedule/new`.
- **Deployment**
  - `Dockerfile`, `docker-compose.prod.yml`, `Caddyfile`, `.github/workflows/deploy.yml`, production runbook and docs.
- **Tests:** order placement (including train capacity), trip status and delivery assignment, login.

### Linari: train scheduling and reports

- **Train scheduling**
  - Backend: `/api/train-trips` (list and add trip), `/api/train-trips/[id]/capacity`.
  - Frontend: `/train-schedule` (calendar, booked and remaining capacity, add-trip form).
- **Reports**
  - Backend: `/api/reports/quarterly-sales`, `most-ordered-items`, `city-route-sales`, `driver-assistant-hours`, `truck-usage`, `customer-history`, and `/api/reports/[type]/export/csv`; query logic in `lib/reports.ts`.
  - Frontend: `/reports` (filters, results tables, CSV export and PDF button).

### Monishka: truck scheduling, roster and deliveries

- **Fleet and roster data**
  - Backend: `/api/trucks`, `/api/drivers`, `/api/assistants` (with weekly hours).
- **Truck scheduling**
  - Backend: `/api/truck-schedules` (list and create via `schedule_truck_delivery`), `/api/truck-schedules/conflicts` (live pre-check).
  - Frontend: `/truck-schedule` (list), `/truck-schedule/new` (with live conflict and roster warnings).
- **Deliveries**
  - Backend: `/api/deliveries`, `/api/deliveries/[id]/complete` (calls `complete_delivery`).
  - Frontend: `/deliveries` (mark complete, add notes).

### Vidura: inventory, master data and administration

- **Store inventory**
  - Backend: `/api/stores`, `/api/stores/[id]/inventory`, `/api/stores/[id]/arrived-bookings`, `/api/stores/[id]/receive-goods`, `/api/inventory/transactions`.
  - Frontend: `/inventory`.
- **Master data**
  - Backend: `/api/products`, `/api/products/[id]`, `/api/cities`, `/api/routes`, `/api/customers`, `/api/employees`.
  - Frontend: `/admin/master-data`.
- **User administration**
  - Backend: `/api/users`, `/api/users/[id]` (create accounts, deactivate, assign roles).
  - Frontend: `/admin/users`.
- **Audit log**
  - Backend: `/api/audit-log`.
  - Frontend: `/admin/audit-log`.

### Desandu: Redis, testing, CI and exports

- **Redis infrastructure**
  - Backend: `lib/redis.ts` (distributed lock, cache) and `lib/rate-limit.ts` (login, orders, truck schedules and PDF export).
- **PDF export**
  - Backend: `/api/reports/[type]/export/pdf` and the export service in `lib/export.ts`.
- **Testing and CI**
  - `.github/workflows/ci.yml` (lint, typecheck, tests, migration check) and the unit, API and integration suites in `tests/`.
- **Dashboard**
  - Backend: `/api/dashboard/summary` (pending orders, today's departures, active truck schedules, low-stock alerts; scoped to the store for store managers and cached in Redis for 30 seconds).
  - Frontend: `/dashboard` (four summary cards and two lists).

## Test accounts for evaluators

Sign in at https://dinethnimsara.dpdns.org/login. Each account has a different role, so each sees a different sidebar and set of actions.

| Role | Email | Password |
|---|---|---|
| System administrator | `admin@kandypack.lk` | `Admin@Kandypack2026!` |
| Logistics manager | `logistics@kandypack.lk` | `example` |
| Order entry clerk | `clerk@kandypack.lk` | `example` |
| Store manager (Colombo) | `store.colombo@kandypack.lk` | `example` |
| Fleet supervisor | `fleet@kandypack.lk` | `example` |

Notes:

- Login is limited to 5 attempts per 15 minutes per IP address, so avoid repeated wrong passwords.

## Roles and access

| Role | Pages |
|---|---|
| System administrator | All pages, including Users, Master data and Audit log |
| Logistics manager | Dashboard, Orders, Train schedule, Inventory (read), Reports (with CSV and PDF export) |
| Order entry clerk | Dashboard, Orders (place and view) |
| Store manager | Dashboard, Orders and Inventory for their own store and city only; receives goods |
| Fleet supervisor | Dashboard, Truck schedule, Deliveries, Reports (driver hours and truck usage) |

Access is enforced twice: by the Proxy and the role map in `lib/rbac.ts` for pages, and again inside every API route.

## How an order travels

1. **Order entry clerk** places the order on `/orders/new`. The `place_order` procedure matches the route and books train space. Status: **Pending**.
2. **Logistics manager** marks the train trip departed on `/train-schedule`. Status: **In Transit**. Marking it arrived changes only the trip.
3. **Store manager** receives the goods on `/inventory`. Stock goes up. Status: **At store**.
4. **Fleet supervisor** schedules a truck with the order on `/truck-schedule/new`. Conflicts and roster limits are checked.
5. **Fleet supervisor** marks the delivery complete on `/deliveries`. Stock goes down. Status: **Delivered**.

A logistics manager or administrator can set an order to **Cancelled** from its detail page.

## Database

The schema lives in `db/migrations/` as 26 numbered files that are applied once each and recorded; fixes are new migrations, never edits to old ones.

- **23 tables** with primary keys, foreign keys, check and unique constraints, and soft delete where needed.
- **About 35 indexes**, mostly composite, for example trip lookup by destination and departure, truck, driver and assistant overlap checks by time, and audit log lookups.
- **8 functions**, for example `calculate_order_space`, `get_available_capacity` and the weekly-hours functions.
- **Stored procedures:** `place_order`, `receive_goods_at_store`, `schedule_truck_delivery` and `complete_delivery`, each running as one transaction.
- **About 70 triggers** that enforce the 7-day rule, train capacity, truck and roster conflicts, stock before dispatch, order totals and price snapshots, and the audit log.
- **6 views** that back the management reports.

Full detail is in [`Docs/04_database-schema-v4.md`](Docs/04_database-schema-v4.md).

### Database objects by member

Each object is listed under the module that relies on it. All migrations are in `db/migrations/` and were applied through Dineth's migration runner.

**Dineth Nimsara: orders and accounts**

| Type | Objects | Purpose |
|---|---|---|
| Procedure | `place_order` (`17`, fixed in `21` and `22`) | Matches the route, saves the order and items, and books train space with overflow to the next trip, all in one transaction |
| Function | `calculate_order_space` | Train space an order needs (quantity times space rate) |
| Triggers | `trg_validate_order_date` | Rejects an order placed less than 7 days ahead |
| | `trg_snapshot_order_item_prices` | Copies price and space rate onto each item at order time |
| | `trg_maintain_order_totals_ins`, `_upd`, `_del` | Keep the order's total value and total space correct |
| | `trg_log_order_status_change` | Writes every status change to `order_status_history` |
| | `trg_audit_orders_*`, `trg_audit_order_items_*` | Audit trail for orders and items |
| | `trg_audit_users_*`, `trg_audit_user_profiles_*` (`25`) | Audit trail for accounts, without password hashes |
| | `trg_touch_updated_at_orders`, `trg_prevent_hard_delete_customers` | Timestamp upkeep and no hard delete (`11`) |

**Linari: train scheduling and reports**

| Type | Objects | Purpose |
|---|---|---|
| Function | `get_available_capacity` | Free cargo space left on a trip |
| Triggers | `trg_check_trip_capacity` | Rejects a booking that would exceed the trip's capacity |
| | `trg_update_trip_booked_space_ins`, `_upd`, `_del` | Keep each trip's booked space in step with its bookings |
| | `trg_audit_train_bookings_ins`, `_del`, `trg_touch_updated_at_train_trips` | Audit and timestamp upkeep |
| Views (`19`) | `v_quarterly_sales`, `v_most_ordered_items`, `v_city_route_sales`, `v_driver_assistant_hours`, `v_truck_usage_monthly`, `v_customer_order_history` | The six management reports |

**Monishka: truck scheduling and deliveries**

| Type | Objects | Purpose |
|---|---|---|
| Procedures | `schedule_truck_delivery` (fixed in `23`), `complete_delivery` (fixed in `26`) | Creates a schedule with conflict locking, and completes a delivery with its order and stock updates |
| Functions | `get_driver_weekly_hours`, `get_assistant_weekly_hours`, `fn_driver_chain_length`, `fn_assistant_chain_length`, `fn_week_start` | Weekly hour limits (40 and 60) and consecutive-trip rules |
| Triggers | `trg_validate_truck_schedule` (`13`, replaced in `23`) | Rejects truck, driver and assistant overlaps and roster breaches |
| | `trg_check_active_delivery_on_insert`, `trg_delivery_complete_order` (`14`) | One active delivery per order, and the order becomes Delivered when its delivery completes |
| | `trg_audit_truck_schedules_*`, `trg_audit_deliveries_*`, `trg_touch_updated_at_*` | Audit and timestamp upkeep |
| | `trg_validate_driver_subtype`, `trg_validate_assistant_subtype` (`16`) | Keep drivers and assistants consistent with their employee record |

**Vidura: inventory, master data and administration**

| Type | Objects | Purpose |
|---|---|---|
| Procedure | `receive_goods_at_store` | Receives an arrived train booking, adds stock and moves the order to At store |
| Function | `get_user_display_name` | Resolves an account's display name for the admin and audit pages |
| Triggers | `trg_check_inventory_before_dispatch` | Blocks a dispatch that would take stock below zero |
| | `trg_apply_inventory_transaction` (`14`, fixed in `24`) | Applies each Receive or Dispatch to `store_inventory` |
| | `trg_guard_employee_type_change` (`16`) | Blocks changing an employee's type while a driver or assistant record still exists |
| | `trg_audit_*` for customers, products, stores, employees, drivers, assistants, trucks and routes, and `trg_prevent_hard_delete_*` | Audit log and soft delete for master data |

**Desandu: Redis, exports and dashboard**

Desandu's work sits in the application layer, so he owns no stored objects. His features read the objects above: the PDF and CSV exports run on Linari's report views, and the dashboard uses plain aggregate queries on `orders`, `train_trips`, `truck_schedules` and `store_inventory`, cached in Redis. Redis locks wrap `place_order`, `schedule_truck_delivery` and `complete_delivery`.

## Project structure

| Path | Contents |
|---|---|
| `app/(dashboard)/` | Pages for each module |
| `app/api/` | API routes |
| `lib/` | Database pool, auth, role map, Redis, rate limiting, reports, export and shared formatting |
| `components/` | Shared components |
| `db/migrations/` | Schema, functions, triggers, procedures and views |
| `scripts/` | Migration runner and seed scripts |
| `tests/` | Unit, API and integration tests |
| `Docs/` | Requirements, architecture, schema and operation guides |

## Running locally

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL, Redis and JWT settings
npm run db:migrate       # apply db/migrations
npm run db:seed          # master data and the first admin
npm run dev              # http://localhost:3000
```

Checks:

```bash
npm run lint             # ESLint
npx tsc --noEmit         # type check
npm test                 # Vitest (unit, API and integration tests)
npm run build            # production build
```

The integration tests use the configured database and roll back their changes. Point `DATABASE_URL` at a disposable database rather than the shared one.

## Known limitations

- Trip departure and arrival are recorded by hand, and a delivery is marked complete by the fleet supervisor; there is no live rail feed or proof of delivery.
- There is no customer portal or public sign-up. Clerks enter orders for customers, and the administrator creates staff accounts.
- There is no password change or reset flow.
- Master data can add records, but only products can be edited.
- Reports are cached for up to an hour, so recent changes may appear after a delay.
- "Today" on the dashboard follows the database's UTC date.


## Documentation

Start with [`Docs/00_documentation-index.md`](Docs/00_documentation-index.md), which lists every document and its authority. Key files:

- [`Docs/01_project-description.md`](Docs/01_project-description.md): the original brief.
- [`Docs/02_srs.md`](Docs/02_srs.md): requirements.
- [`Docs/03_architecture.md`](Docs/03_architecture.md): architecture, security and deployment decisions.
- [`Docs/04_database-schema-v4.md`](Docs/04_database-schema-v4.md): schema, procedures and triggers.
- [`Docs/05_api-and-pages.md`](Docs/05_api-and-pages.md): API routes and page flows.
- [`Docs/13_system-operation-guide.md`](Docs/13_system-operation-guide.md): how to operate the system.
