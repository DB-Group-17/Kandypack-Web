# Kandypack Documentation Final Report

> Status: Active baseline
> Authority: Documentation approval record
> Primary source: `Docs/00_documentation-index.md`
> Baseline date: 2026-08-25

## Purpose

This report records the approved documentation decisions made before application development begins. It is the final conflict–solution summary for the current project baseline.

## Authority order

When documents disagree, use this order:

`AGENTS.md` → `DESIGN.md` → `Docs/03_architecture.md` → other active `Docs/` files → `Docs/02_srs.md` → `Archive/`

The SRS remains unchanged as the original business-requirements reference. The architecture document controls technical implementation decisions and records intentional deviations.

## Conflict–solution table

| Conflict | Approved solution | Primary document |
|---|---|---|
| MySQL versus PostgreSQL | Use MySQL 8.0 on Aiven for the current implementation. | `03_architecture.md` |
| Self-hosted deployment versus cloud deployment | Use Vercel-compatible hosting with Aiven MySQL and optional Upstash Redis. Self-hosting remains a future option. | `03_architecture.md` |
| Admin versus logistics-manager train-schedule access | Both roles may manage schedules; permissions differ by role. | `03_architecture.md`, `05_api-and-pages.md` |
| Order lifecycle differences | Use `Pending`, `In Transit`, `At Store`, `Out for Delivery`, and `Delivered`, with controlled `Cancelled` handling. | `03_architecture.md`, `04_database-schema-v4.md` |
| Delivery lifecycle differences | Use `Scheduled`, `In Progress`, `Completed`, `Failed`, and `Cancelled`. | `03_architecture.md`, `04_database-schema-v4.md` |
| Monday–Saturday operations versus Monday–Sunday calculations | Schedule normal delivery operations Monday–Saturday; use Monday–Sunday for calendar calculations. | `03_architecture.md` |
| Address parsing versus delivery-area matching | Use explicit delivery-area assignment in version one. | `03_architecture.md`, `06_seed-data-spec.md` |
| Overflow order handling | Split allocations across future trips while preserving one customer order. | `03_architecture.md`, `04_database-schema-v4.md` |
| Assistant route continuity | Preserve consecutive route assignment until completion or authorized reassignment; audit the change. | `03_architecture.md` |
| CSV/PDF reporting architecture | Generate CSV and PDF synchronously and return files directly. | `03_architecture.md`, `05_api-and-pages.md` |
| PDF persistence | Do not create `report_jobs`, polling endpoints, or report-file storage in version one. | `03_architecture.md`, `04_database-schema-v4.md` |
| Missing truck-schedule page | Use the confirmed `UI/truck-schedule-new/` reference for `/truck-schedule/new`. | `05_api-and-pages.md`, `11_ui-rules.md` |
| Old document filenames | Use the numbered active filenames and correct stale references. | `00_documentation-index.md` |
| Archived schemas versus active schema | Keep archived schemas for history; use `04_database-schema-v4.md` for implementation. | `00_documentation-index.md` |
| Package-manager ambiguity | Use npm and the repository's `package-lock.json`; do not mix package managers. | `03_architecture.md`, `10_local-setup.md` |
| Train-schedule visual variant | Use the main Kandypack violet theme; do not carry over the steel/amber reference palette. | `DESIGN.md`, `11_ui-rules.md` |
| Reports and audit-log accent | Allow the deeper violet accent as a sanctioned page-specific variant. | `DESIGN.md`, `11_ui-rules.md` |
| Narrow-screen table behavior | Transform dense tables into card layouts. | `DESIGN.md`, `11_ui-rules.md` |
| Migration sequence & Seed runner | Migrations structured as `01→20` (`20_delivery_status_cancelled.sql`); seed execution decoupled via `npm run db:seed` (`scripts/seed.ts`). | `03_architecture.md`, `04_database-schema-v4.md` |

## Approved documentation changes

- Added `Docs/00_documentation-index.md` as the documentation entry point.
- Added authority, status, and review metadata to active documentation where applicable.
- Updated `03_architecture.md` with authority rules, application boundaries, synchronous exports, migration rules, implementation order, and decision log.
- Updated dependent documents to remove obsolete background-reporting assumptions.
- Updated `AGENTS.md` to require the index, design system, and active documentation to be read before work begins.
- Confirmed the `/truck-schedule/new` UI reference.
- Retained the SRS and archived documents without rewriting or deleting them.

## Deferred decisions

- Asynchronous PDF generation may be reconsidered only if performance testing shows that synchronous exports exceed hosting limits.
- Intelligent address parsing is outside version one.
- Broad UI component and browser end-to-end testing remains deferred; export, API, integration, and business-rule tests are required.
- Self-hosted production deployment remains a future option.

## Implementation readiness checklist

- [x] Documentation index exists.
- [x] Authority order is documented.
- [x] SRS remains unchanged as a requirements reference.
- [x] Architecture is the technical source of truth.
- [x] PDF output does not require a new table for version one.
- [x] Stale report-job, Inngest, and R2 setup instructions were removed from active implementation guidance.
- [x] Active documents use the numbered file names.
- [x] `/truck-schedule/new` reference is present.
- [x] Agent startup and commenting rules are documented in `AGENTS.md`.
- [x] UI theme, deeper-violet accent, and mobile card-layout decisions are resolved.
- [ ] Application implementation has begun — intentionally not started during documentation finalization.

## Baseline status

The documentation baseline is approved and ready to guide implementation. Future technical changes must be recorded in the architecture decision log and reflected in affected supporting documents.
