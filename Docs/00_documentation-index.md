# Documentation Index

## Purpose

This file is the inventory and reading guide for the Kandypack project documentation. AI agents and developers must use it to understand which documents are current, supporting, or historical.

## Authority order

When documents disagree, use this order:

1. `AGENTS.md` — agent operating rules.
2. `DESIGN.md` — visual and interaction design rules.
3. `03_architecture.md` — technical implementation source of truth.
4. The remaining active documents in this folder — supporting specifications.
5. `02_srs.md` — original business and functional requirements reference.
6. `Archive/` — historical material only; never use it as the current implementation specification.

The SRS remains unchanged unless explicitly approved. Intentional implementation differences must be recorded in `03_architecture.md` and reflected in the affected supporting documents.

## Active documentation

| Number | File | Purpose | Status | Authority |
|---:|---|---|---|---|
| 00 | `00_documentation-index.md` | Documentation inventory, reading order, and authority rules | Active | Documentation governance |
| 01 | `01_project-description.md` | Project purpose, scope, and stakeholders | Active | Supporting |
| 02 | `02_srs.md` | Original software requirements | Active reference | Business requirements |
| 03 | `03_architecture.md` | System architecture and implementation decisions | Active | Technical source of truth |
| 04 | `04_database-schema-v4.md` | Database entities, relationships, and constraints | Active | Follows architecture |
| 05 | `05_api-and-pages.md` | API routes, pages, permissions, and page behavior | Active | Follows architecture |
| 06 | `06_seed-data-spec.md` | Development and demonstration seed data | Active | Supporting |
| 07 | `07_content-copy.md` | Approved interface text and labels | Active | Supporting |
| 08 | `08_workload-division.md` | Team responsibilities and work allocation | Active | Supporting |
| 09 | `09_task-tracker.md` | Implementation task sequence and progress | Active | Supporting |
| 10 | `10_local-setup.md` | Local development and environment setup | Active | Supporting |
| 11 | `11_ui-rules.md` | Reusable UI rules and component conventions | Active | Follows `DESIGN.md` |
| 12 | `12_documentation-final-report.md` | Final approved conflict–solution table and readiness baseline | Active | Documentation baseline |
| 13 | `13_system-operation-guide.md` | End-to-end system workflow, roles, permissions, and business rules | Active | Follows architecture |

## Other project guidance

| File | Purpose | Status |
|---|---|---|
| `../AGENTS.md` | Required instructions for AI agents working on the project | Active |
| `../DESIGN.md` | Project-wide visual design system | Active |
| `../UI/` | Screen references and visual implementation inputs | Active reference |
| `../Archive/` | Superseded documents and historical decisions | Historical |

## UI reference coverage

The `/truck-schedule/new` reference is now present at `UI/truck-schedule-new/` and is included in the project screen inventory. The final page list must still be checked against `05_api-and-pages.md` before implementation begins.

## Maintenance rules

- Every active document must have one clear purpose.
- References must use the current numbered filenames.
- Archived documents must be labelled historical and must not override active documents.
- Technical decisions that intentionally differ from the SRS must be recorded in `03_architecture.md`.
- Changes to authority, scope, or implementation decisions require an entry in the final documentation decision log.

## Approved decisions

### Documentation authority

Approved authority order:

`AGENTS.md` → `DESIGN.md` → `03_architecture.md` → other active `Docs/` files → `02_srs.md` → `Archive/`

The SRS remains unchanged as the original business-requirements reference. When it conflicts with an implementation decision, `03_architecture.md` is authoritative and must record the reason for the deviation.

### Document order and boundaries

The numbered order is approved and must remain:

`00` index → `01` project description → `02` SRS → `03` architecture → `04` database schema → `05` API and pages → `06` seed data → `07` content copy → `08` workload division → `09` task tracker → `10` local setup → `11` UI rules.

Each document must stay within its defined responsibility. Active documents should identify their status, authority level, review date, and primary source. `12_documentation-final-report.md` will be created only after all documentation sections are resolved.

### Approved cross-document decisions

- MySQL 8 is the implementation database.
- The architecture deployment model is authoritative for the current project.
- Both `admin` and `logistics_manager` may manage train schedules, with different permission scopes.
- The canonical order lifecycle is `Pending` → `In Transit` → `At Store` → `Out for Delivery` → `Delivered`, with controlled `Cancelled` handling.
- Delivery statuses are `Scheduled`, `In Progress`, `Completed`, `Failed`, and `Cancelled`.
- Delivery operations run Monday–Saturday; calendar calculations use Monday–Sunday.
- Version one uses explicit delivery-area assignment rather than intelligent address parsing.
- Overflow orders may be split across future trips while remaining one customer order.
- Assistant route continuity is an architecture rule and must be auditable.
- CSV and PDF reports are generated synchronously and returned directly; no `report_jobs` table or report-file storage is required for version one.
- Database schema migrations are structured as `01→20` sequential SQL files; database seeding is managed separately via `scripts/seed.ts` (`npm run db:seed`).
- `UI/truck-schedule-new/` is the confirmed reference for the new truck-schedule page.
- Canonical application layout is unified under `app/(dashboard)/layout.tsx` for all authenticated modules (`/inventory`, `/admin/*`, `/train-schedule`, `/truck-schedule`, `/deliveries`, `/reports`); redundant per-page shells are decommissioned.
- Phase 0 Foundation completed and verified on 2026-09-02; all Phase 0 Gate criteria locked for Phase 1 kickoff.

### Approved architecture finalization scope

`03_architecture.md` will be reorganized and corrected without being rewritten from scratch. The approved changes are:

- Add documentation status, authority order, and SRS-deviation rules.
- Clarify version-one scope, deployment environments, operational responsibilities, and application-layer boundaries.
- Make role and permission boundaries explicit.
- Document migration, seed-data, security, backup, audit, monitoring, and testing expectations.
- Replace asynchronous PDF generation, Inngest, `report_jobs`, polling, and R2 storage with synchronous direct PDF responses for version one.
- Add the approved dependency-based implementation order.
- Add an architecture decision log.
- Correct stale document and UI-reference filenames.

### Approved dependent-document alignment

Supporting documents will be updated after the architecture, in dependency order. Each rule will have one primary source rather than being duplicated across documents. Obsolete Inngest, R2, and `report_jobs` references will be removed from dependent documents. Active documents will receive status, authority, primary-source, and review-date metadata. `AGENTS.md` will require agents to read this index, `DESIGN.md`, and every active document before work begins.

### Approved archive and stale-reference rules

- Historical documents will be retained and clearly labelled as non-authoritative.
- `Docs/04_database-schema-v4.md` is the active schema reference.
- Stale filenames must be replaced with the current numbered filenames.
- Root `DESIGN.md` is the project-wide design authority.
- Nested UI design files are screen-specific references and cannot override root design rules.
- References to missing files must be labelled `Planned file` or `Not required for version one`.
- Archived documents must not be used as current implementation instructions without an explicit project decision.

### Approved final validation

Before development begins, documentation will be validated for file references, architecture consistency, requirement coverage, UI coverage, and development readiness. The validation will be read-only and will produce `Docs/12_documentation-final-report.md`, including the final conflict–solution table, approved authority order, deferred decisions, planned files, and implementation-readiness checklist.
