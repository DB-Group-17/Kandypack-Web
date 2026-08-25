# Kandypack UI Design System

## 1. Theme & Mood

Kandypack is a modern corporate logistics workspace: calm, high-trust, and operationally dense without feeling industrial or harsh. The visual language combines a light lavender canvas, deep violet navigation, generous white surfaces, rounded geometry, and restrained pastel status colors. The system is designed for dashboards, tables, forms, schedules, inventory, orders, and reporting workflows.

This system was initialized from the 13 complete Stitch page pairs in `UI/` (HTML plus screenshot), with the existing `UI/*/DESIGN.md` references used as supporting context.

## 2. Colors

### Brand and surfaces

| Token | Value | Use |
|---|---|---|
| `primary` | `#4132C7` | Primary actions, links, active controls |
| `primary-container` | `#5A4FE0` | Sidebar, high-emphasis surfaces |
| `secondary` | `#5B3CDD` | Secondary emphasis and active navigation |
| `secondary-container` | `#7459F7` | Selected controls and accents |
| `background` | `#F5F5FA` | Main application canvas |
| `surface` | `#F9F9FF` | Tinted page and input surfaces |
| `surface-card` | `#FFFFFF` | Cards, tables, forms, modals |
| `surface-container-low` | `#F0F3FF` | Search fields and low-contrast controls |
| `surface-container-high` | `#DEE8FF` | Selected/raised tonal surfaces |
| `on-surface` | `#121C2C` | Default text |
| `on-surface-variant` | `#474554` | Secondary and muted text |
| `outline` | `#777586` | Form borders and low-emphasis outlines |
| `outline-variant` | `#C8C4D7` | Dividers and subtle borders |
| `on-primary` | `#FFFFFF` | Text and icons on violet |

### Semantic colors

Use semantic colors consistently for status communication. Prefer a pale background with the full-strength text color.

| Meaning | Background | Text |
|---|---|---|
| Success / active / completed | `#E6F6F4` | `#00B69B` |
| Warning / delayed / low stock / in transit | `#FFF9E6` | `#FFB800` |
| Error / critical / cancelled | `#FFF0F0` | `#F93C65` |
| Informational / selected | `#E0F2FF` | `#0047CC` |
| Neutral / inactive | `#F1F1F5` | `#474554` |

## 3. Typography

- **Font family:** Plus Jakarta Sans for all interface text.
- **Display / page title:** 30px, 700, 38px line-height, `-0.02em` tracking.
- **Heading large:** 24px, 600, 32px line-height.
- **Heading medium:** 20px, 600, 28px line-height.
- **Title:** 18px, 600, 24px line-height.
- **Body large:** 16px, 400, 24px line-height.
- **Body:** 14px, 400, 20px line-height.
- **Label:** 12px, 600–700, 16px line-height, up to `0.05em` tracking.
- **Caption / table label:** 11px, 600, 14px line-height.

Use sentence case for interface copy. Preserve domain acronyms such as SKU, API, and ID. Use a monospace face only for identifiers or technical values where character-level comparison matters.

## 4. Spacing

- **Base unit:** 8px.
- **Core scale:** 8, 16, 24, 32, 48, 64px.
- **Desktop content gutter:** 24px minimum; 32px for spacious page headers.
- **Mobile content gutter:** 16px.
- **Sidebar width:** 260px.
- **Card padding:** 24px for primary cards; 16px for compact data surfaces.
- **Common component gap:** 16px.
- **Section rhythm:** 24–32px between page sections.
- **Table row minimum:** 56px where the row contains multiple lines or actions.

## 5. Shape, Elevation & Motion

- **Input radius:** 8px.
- **Card and modal radius:** 16px.
- **Button and status radius:** 9999px (pill).
- **Icon container radius:** 8px.
- **Avatar radius:** 9999px.
- **Card shadow:** `0 4px 20px rgba(0, 0, 0, 0.03–0.05)`.
- **Floating/modal shadow:** `0 8px 30px rgba(0, 0, 0, 0.08)`.
- **Interaction:** 150–200ms ease transitions; use small elevation or translate changes on hover, never large movement.

## 6. Layout Model

- Use a fixed left sidebar on desktop and a fluid content workspace.
- Use a 12-column grid for dashboards and report layouts.
- Reflow dense grids to one column on narrow mobile screens.
- Hide or collapse the sidebar below the desktop breakpoint; preserve access to all navigation items through a compact menu.
- Keep tables readable with horizontal overflow or a deliberate card-stack transformation on mobile.
- Use sticky/fixed navigation only where it supports long operational pages; avoid layering content under the top bar.

## 7. Resolved Reference Variants

The following reference differences are intentional and resolved:

1. `UI/train_schedule` uses a separate steel/amber token set, 4px spacing baseline, 240–260px sidebar geometry, 2xl radii, and rectangular controls. Use the main Kandypack violet theme as canonical; the steel/amber styling must not be carried into the implementation.
2. `UI/reports` and `UI/audit_log` use the deeper `#251297`/`#3D33AD` violet variant. This is a sanctioned page-specific accent; shared component geometry and interaction rules remain unchanged.
3. Some references use `#F9F9FF` as the page background while others explicitly render `#F5F5FA`. Use `#F5F5FA` for the application canvas and reserve `#F9F9FF` for tinted surfaces.
4. On narrow screens, dense tables use deliberate card-layout transformations rather than horizontal scrolling.
