# Kandypack: rail and road supply chain distribution system

Kandypack is a database-driven logistics platform for a mid-sized FMCG manufacturer in Kandy, Sri Lanka. It replaces Excel tracking for the full flow of goods: orders are placed at least 7 days ahead, booked onto train trips with limited cargo capacity, received at stores near railway stations, and delivered to customers by truck on predefined routes with driver and assistant rosters. Management reports cover sales, top products, city and route breakdowns, working hours, truck usage and customer history.

This is a 3rd semester university database project (Group 17).

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
  - Planned (summary cards with Redis caching) but not built yet, so `/dashboard` does not exist and login currently lands on a not-found page.

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

## Running locally

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL, Redis and JWT settings
npm run db:migrate       # apply db/migrations
npm run db:seed          # master data and the first admin
npm run dev              # http://localhost:3000
```


## Documentation

Start with [`Docs/00_documentation-index.md`](Docs/00_documentation-index.md), which lists every document and its authority. Key files:

- [`Docs/01_project-description.md`](Docs/01_project-description.md): the original brief.
- [`Docs/02_srs.md`](Docs/02_srs.md): requirements.
- [`Docs/03_architecture.md`](Docs/03_architecture.md): architecture, security and deployment decisions.
- [`Docs/04_database-schema-v4.md`](Docs/04_database-schema-v4.md): schema, procedures and triggers.
- [`Docs/05_api-and-pages.md`](Docs/05_api-and-pages.md): API routes and page flows.
- [`Docs/13_system-operation-guide.md`](Docs/13_system-operation-guide.md): how to operate the system.
