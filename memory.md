# Memory — Kandypack Phase 0 Foundation (Steps 1–5 Complete)

Last updated: 2026-08-28 13:28:00 +05:30

## What was built

- **Project Scaffolding & Dependencies:** Installed runtime dependencies (`mysql2`, `bcryptjs`, `jsonwebtoken`, `lucide-react`, `react-icons`) and dev tools (`@types/bcryptjs`, `@types/jsonwebtoken`, `tsx`, `dotenv`). Configured `package.json` scripts (`typecheck`, `db:migrate`, `db:seed`).
- **Environment & Git Setup:** Created `.env.example` template and updated `.gitignore` with `!.env.example` exception.
- **Database Migrations (`db/migrations/`):** Created all 19 sequential SQL migration files (`01_auth.sql` through `19_reports.sql`) from `Docs/04_database-schema-v4.md` (tables, functions, triggers, procedures, views).
- **Migration Runner (`scripts/migrate.ts`):** Implemented an idempotent migration runner using `_schema_migrations` history tracking table, multipleStatements execution, and SSL support.
- **Database Helper (`lib/db.ts`):** Created the application-wide singleton MySQL connection pool (cached on `globalThis` in development), with type-safe query helpers (`query`, `queryOne`, `execute`, `withTransaction`, `withUserContext`, `callProcedure`).
- **Authentication System (`lib/auth.ts`):** Implemented bcrypt password hashing (cost factor 12), JWT signing and verification (8h expiration), and `getSession()` cookie session extractor.
- **Auth API Routes:**
  - `POST /api/auth/login` (`app/api/auth/login/route.ts`): Credential validation, active status check, employee profile join, and HttpOnly `auth_token` cookie issuance.
  - `POST /api/auth/logout` (`app/api/auth/logout/route.ts`): Session cookie deletion.
  - `GET /api/auth/me` (`app/api/auth/me/route.ts`): Active session user identity endpoint.
- **Code Quality:** Configured `eslint.config.mjs` to ignore `.agents/**`. Passed `npm run typecheck` (0 errors) and `npm run lint` (0 errors).

## Decisions made

- **Application-Layer Auth:** Manual authentication using `users` table + bcrypt + custom JWT in HttpOnly cookie (`auth_token`, SameSite=Lax, Secure in production) with 8-hour shift lifetime. No third-party auth provider (per `03_architecture.md §6`).
- **Plain SQL with `mysql2`:** No ORM. Parameterized queries for SQL injection safety, with session variables (`@current_user_id`, `@current_app_role`) set on connections for audit logging and stored procedure authorization.
- **Migration Idempotency:** Migrations tracked in `_schema_migrations` table so existing tables and data are never re-run or dropped.
- **Next.js Singleton Pool:** MySQL connection pool attached to `globalThis` in development to prevent connection leaks across Fast Refresh reloads.

## Problems solved

- Resolved ESLint `no-explicit-any` errors in `lib/db.ts` by defining strongly typed `QueryParam` union types.
- Fixed `.env.example` visibility in Git by adding `!.env.example` rule to `.gitignore`.
- Solved migration re-run collision risk by building automated migration history tracking into `scripts/migrate.ts`.

## Current state

- Phase 0 Steps 1, 2, 3, 4, and 5 are fully implemented, verified, and passing typecheck and linting.
- Database migration execution is deferred until Aiven MySQL database connection URI is set in `.env.local`.

## Next session starts with

- **Step 6:** Implement RBAC helper (`lib/rbac.ts`) and Route Middleware (`middleware.ts`) enforcing the Access Control Matrix from `Docs/04_database-schema-v4.md §9`.
- **Step 7:** Implement the Bootstrap Admin seed script (`scripts/seed.ts`).
- **Aiven Connection:** Configure `DATABASE_URL` in `.env.local` and run `npm run db:migrate`.

## Open questions

- None. Implementation is strictly aligned with `Docs/03_architecture.md`, `Docs/04_database-schema-v4.md`, `Docs/05_api-and-pages.md`, and `Docs/07_content-copy.md`.
