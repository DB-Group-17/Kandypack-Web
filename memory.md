# Memory — Member 2 (Linari) Phase 1 Train Scheduling

Last updated: 2026-09-05 10:53:00

## What was built

- Implemented backend API endpoints for Train Scheduling:
  - `app/api/train-trips/route.ts` — `GET` with dynamic filter support (`city_id`, `status`, `date_from`, `date_to`), calculation of `remaining_capacity`, and `POST` with validation of `arrival_datetime > departure_datetime` (mirrors `chk_tt_arrival`), `total_capacity > 0` (mirrors `chk_tt_capacity`), destination city verification, and parameterized database insertion.
  - `app/api/train-trips/[id]/capacity/route.ts` — `GET` returning `total_capacity`, `booked_space`, and calling `get_available_capacity(p_trip_id)` SQL function for real-time capacity utilization breakdown.
- Wired `/train-schedule` page to live data in `app/(dashboard)/train-schedule/page.tsx`:
  - Replaced static mock data with asynchronous fetch from `/api/train-trips`.
  - Added loading skeleton spinner per `Docs/07_content-copy.md` §427.
  - Added error state banner with "Retry" action button per `Docs/07_content-copy.md` §429.
  - Preserved empty state with "+ Add Trip" action button per `Docs/07_content-copy.md` §200.
  - Wired Add Trip modal form to `POST /api/train-trips`, providing dynamic submit button state ("Saving Trip…"), error banner for server constraints, and 4-second auto-dismiss success toast ("Trip to {destination_city} added.") per copy spec.
- Updated `Docs/09_task-tracker.md` checking off Member 2's Phase 1 tasks.

## Decisions made

- Strictly respected Member 2's module boundary (`train-schedule` and `app/api/train-trips`) on branch `member2` without modifying shared files owned by Member 1 (`lib/db.ts`, `lib/auth.ts`, `lib/rbac.ts`) or other members' pages.
- Followed Next.js 16 App Router standard where dynamic route params are a `Promise<{ id: string }>`.
- Followed `DESIGN.md` visual rules (violet palette, pill badges, card containers) and `Docs/07_content-copy.md` text.

---

# Memory — Member 4 Phase 0 Static Page Shells

Last updated: 2026-09-01 00:52:00

## What was built

- Completed the final static frontend shell for Member 4 Phase 0: `/admin/users` (User Accounts Management) in `app/admin/users/`:
  - `types.ts` — TypeScript interfaces for `AppRole`, `UserAccountItem`, `EmployeeOption`, `UserStats`, `NewUserPayload`, `UserFilterState`, and `PaginationState`.
  - `mockData.ts` — Seed-compliant dataset of 18 realistic user accounts across central HQ and all 6 destination stores (Colombo, Negombo, Galle, Matara, Jaffna, Trincomalee) covering all 5 application roles, plus employee lookup options and filter/stats calculation utilities.
  - `components/UserAccountsShell.tsx` — Fixed 260px deep-violet sidebar (`#5A4FE0`) with active navigation on **Users**, top global search input, administrator profile badge, and mobile drawer.
  - `components/UserStatsBento.tsx` — 4-card Bento overview grid displaying **Total Users**, **Active Now**, **Deactivated**, and **Admins** with semantic icon containers and one-click quick filtering.
  - `components/UserFilterBar.tsx` — Search and filtering toolbar supporting live search by name/email/department, role selection dropdown, status selection dropdown, and clear filters action.
  - `components/UsersTable.tsx` — Data table with 6 columns: `User` (avatar/initials, name, title), `Email`, `Role` (pill badge), `Status` (active dot badge), `Joined` (formatted date), and `Actions` (edit details, activate/deactivate toggle). Features responsive card reflow on mobile.
  - `components/UserPagination.tsx` — Pagination footer (`Showing X to Y of Z users`) with previous/next chevron buttons and numbered page indicators.
  - `components/AddUserModal.tsx` — Modal dialog for registering new user accounts with email validation, role select, employee roster linking, display name override, and temporary password generator with visibility toggle.
  - `components/TempPasswordBanner.tsx` — Dismissible high-visibility notice banner displaying the created user's temporary password with one-click clipboard copy.
  - `components/StatusToggleModal.tsx` — Confirmation dialog for deactivating or activating a user (*"Deactivate {email}? They won't be able to sign in until reactivated."*).
  - `components/EditUserModal.tsx` — Modal dialog for editing role and active status for an existing user account.
  - `page.tsx` — Master client orchestrator integrating shell, Bento KPIs, filter bar, table, modals, banner, pagination, and toast feedback.
- Completed all 4 assigned Member 4 frontend static shells:
  - `/inventory`
  - `/admin/audit-log`
  - `/admin/master-data`
  - `/admin/users`
- Verified with TypeScript typecheck (`npx tsc --noEmit`), ESLint (`npx eslint app/admin/users`), and Next.js production build (`npm run build`), all passing with 0 errors and 0 warnings.

## Decisions made

- Maintained strict zero-shared-file edit boundaries on the `member4` branch for Phase 0 (no modifications to `lib/`, `middleware.ts`, `app/layout.tsx`, `package.json`, or database files).
- Preserved exact field and validation copy from `Docs/07_content-copy.md` §332–359 and `Docs/05_api-and-pages.md` §380.
- Implemented temporary password one-time display banner with clipboard copy matching security requirements.

## Problems solved

- Avoided React hook state cascading renders in form modals and page filters by managing resets on user interaction handlers and component keys.
- Implemented dynamic bento KPI filtering allowing quick one-click filtering by user status or admin role.

## Current state

- All 4 Member 4 static page shells (`/inventory`, `/admin/audit-log`, `/admin/master-data`, `/admin/users`) are completely built, styled to `DESIGN.md`, and validated with production build.
- Ready for Phase 0 gate completion once Member 1 (foundation/auth) and Member 5 (Redis/CI) merge.

## Next session starts with

- Await Phase 0 gate merge of Member 1 (`lib/db.ts`, auth, migrations) and Member 5 (`lib/redis.ts`, CI).
- Proceed to Phase 1 backend routes for Master Data (`/api/products`, `/api/cities`, `/api/routes`, `/api/employees`, `/api/customers`) and wire `/admin/master-data` to real database queries.

## Open questions

- None. Implementation matches specification, copy documents, and UI screenshot reference.
# Memory — Kandypack Phase 0 Foundation (Steps 1–7 Complete)

Last updated: 2026-08-29

## What was built

- **Project Scaffolding & Dependencies:** Installed runtime dependencies (`mysql2`, `bcryptjs`, `jose`, `lucide-react`, `react-icons`) and dev tools (`@types/bcryptjs`, `tsx`, `dotenv`). Configured `package.json` scripts (`typecheck`, `db:migrate`, `db:seed`).
- **Database Migrations (`db/migrations/`):** Created all 19 sequential SQL migration files from `Docs/04_database-schema-v4.md`. Migrations were successfully executed against the Aiven MySQL database.
- **Migration Runner (`scripts/migrate.ts`):** Implemented an idempotent migration runner using `_schema_migrations` tracking table.
- **Database Helper (`lib/db.ts`):** Created the application-wide singleton MySQL connection pool with type-safe query helpers (`query`, `queryOne`, `execute`, `withTransaction`, `withUserContext`, `callProcedure`). Standalone scripts now correctly load `.env.local`.
- **Authentication System (`lib/auth.ts`):** Implemented bcrypt password hashing, JWT signing/verification, and header decoding helpers.
- **Auth API Routes:** 
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- **RBAC Helper (`lib/rbac.ts`):** Implemented role-based access control matrix checks (`canAccessRoute`, `hasPermission`), store-scoping (`getStoreScope`), and default-deny page routing.
- **Next.js Edge Proxy (`proxy.ts`):** Implemented JWT edge verification (via `jose`), route-level authentication checks, role-based authorization guard, and header injection for downstream components. Handles `/` root redirect and fail-fast `JWT_SECRET` verification.
- **Bootstrap Admin Seed (`scripts/seed.ts`):** Created and executed the script to insert the initial `admin@kandypack.lk` System Administrator account securely.
- **Code Quality:** Passed `npm run typecheck` (0 errors) and `npm run lint` (0 errors).

## Decisions made

- **Application-Layer Auth:** Manual authentication using `users` table + bcrypt + custom JWT in HttpOnly cookie (`auth_token`).
- **Edge Proxy:** Used `proxy.ts` (Next.js 16 convention) with the `jose` library for Edge-compatible JWT verification.
- **Security Hardening:** Implemented strict null-checks for `store_manager` scoping, deny-by-default for unknown routes in `canAccessRoute`, and fail-fast error handling for missing configuration (`JWT_SECRET`).

## Current state

- Phase 0 Foundation (Steps 1-7) is 100% complete and verified against the live Aiven database.
- The bootstrap admin account is active and verified working.
- Code is committed and ready for a Pull Request to `main`.

## Next session starts with

- **Phase 1: Critical Path (Orders Module):** 
  - Wait for Phase 0 PR and Member 5's Redis PR to merge to `main`.
  - Begin implementing `POST /orders` integrating `place_order()` procedure and Redis lock helper.
  - Implement `/orders` endpoints and UI.
