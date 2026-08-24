# UI Component & Layout Rules

## 1. Scope and Source Inventory

This document is the shared implementation contract for the `UI/` references. The initialization pass found 13 complete page pairs:

`audit_log`, `dashboard`, `deliveries`, `login`, `master_data`, `new_order`, `order_detail`, `orders_list`, `reports`, `store_inventory`, `train_schedule`, `truck_schedules`, and `user_accounts`.

The folders `image.png_1`, `logo`, `kandypack_logistics_system`, `steel_signal`, and `violet_saas_logistics` are supporting visual/design references rather than complete page pairs.

Visual tokens live in the root [`DESIGN.md`](../DESIGN.md). Component decisions belong here.

## 2. Buttons

- **Primary:** `#4132C7` background, white text, pill radius, 48px minimum height for page-level actions and 40px for compact actions.
- **Secondary:** white or transparent background, 1px primary border, primary text, pill radius.
- **Tonal:** pale violet or tinted surface background with primary text; use for export/filter actions and low-emphasis toolbar controls.
- **Ghost:** transparent with no border; primary or muted text; provide a clear hover surface.
- **Warning:** semantic warning color only for an action that genuinely changes or acknowledges a warning state.
- **Disabled:** muted surface and muted text; retain readable contrast and remove hover behavior.
- **Padding:** 16px horizontal minimum for compact buttons; 24px for prominent actions.
- **Icon buttons:** 40px square, circular when utility-only; provide an accessible label or tooltip.
- **Interaction:** 150–200ms transition; optional `translateY(-1px)` or shadow lift on hover.

## 3. Cards and Surfaces

- Use white cards on the `#F5F5FA` canvas.
- Use a 16px radius for cards, modals, dashboard widgets, table containers, and form sections.
- Use 24px card padding by default; use 16px for dense table/tool surfaces.
- Use a soft ambient shadow (`0 4px 20px rgba(0, 0, 0, 0.03–0.05)`) rather than heavy borders.
- Use tonal surfaces for icon containers, filter trays, and secondary groupings.
- Keep card hierarchy flat and clear: page canvas → card → optional tonal sub-surface.

## 4. Forms and Inputs

- Place persistent labels above fields; do not use floating labels.
- Use 8px input radius, 1px `outline-variant` border, white or `surface` fill, and 48px minimum height for primary fields.
- Use 40px minimum height for compact toolbar inputs.
- Focus state: primary border plus a restrained 1–2px primary focus ring.
- Keep helper text and validation messages directly below the field.
- Search fields may use pill radius when they are global or toolbar-level search controls.
- Selects, date fields, text fields, and filters share the same border/focus vocabulary.
- Group related fields in a responsive 2-column grid that collapses to one column on mobile.

## 5. Status Badges and Icon Containers

- Status badges are always compact pills with 11–12px semibold text.
- Use the semantic background/text pairs in `DESIGN.md`; do not invent one-off status colors.
- Keep badge text in sentence case except established all-caps codes.
- Icon containers are generally 32–40px squares with an 8px radius and a 10–15% tinted fill.
- Use a consistent 2px line-weight icon set; Material Symbols are the current reference in the HTML mockups.

## 6. Tables and Data-Dense Views

- Wrap tables in a white 16px-radius card.
- Use a lightly tinted header row with 11–12px semibold labels.
- Use 1px horizontal dividers; avoid arbitrary zebra colors unless density makes them necessary.
- Preserve generous row height: 56px minimum for multi-value rows and 48px for compact rows.
- Align numeric values and actions consistently; use monospace only for identifiers where it improves scanning.
- Provide search, filter, export, and pagination in a dedicated toolbar/footer rather than mixing them into the header row.
- On mobile, allow horizontal scrolling or transform to stacked records; preserve the key identifier visibly.

## 7. Navigation and Shell

- Desktop sidebar width is 260px, fixed/sticky on long pages, with deep violet background and white/light-violet content.
- Group navigation items under clear sentence-case section labels such as Main, Reports, and Admin.
- Navigation item height is typically 44–48px with 12–16px horizontal padding and an 8px radius.
- Active navigation uses a stronger violet or translucent white surface and high-contrast text/icon.
- The top bar is a white or very lightly tinted surface with a bottom divider; it contains global search, utility actions, and user context.
- Keep the primary page title and action area below the top bar with a 24–32px vertical offset.
- On mobile, collapse the sidebar and retain the same information hierarchy in the menu.

## 8. Layout Patterns

- Use the fixed-sidebar + fluid-content model for authenticated application pages.
- Use a 12-column grid for dashboard/report compositions; common patterns are 4 equal KPI columns, then 6/6 content cards or 8/4 chart/detail splits.
- Use a max-width fluid workspace with 24–32px desktop gutters and 16px mobile gutters.
- Use 16px gaps inside repeated grids and 24px gaps between major sections.
- Detail pages may use a 2-column content/detail layout; collapse the right rail beneath the main content on mobile.
- Login and other unauthenticated pages use a centered responsive shell with a 16px radius and no application sidebar.
- Never let a page-specific screenshot override tokens already established in `DESIGN.md` without recording the decision below.

## 9. Accessibility and Content Rules

- Every icon-only control needs an accessible name.
- Preserve visible focus states and sufficient contrast for muted text and status labels.
- Do not rely on color alone for status; pair it with text or an icon.
- Use semantic headings in page order and persistent form labels.
- Use sentence case for labels, headings, buttons, and navigation; preserve domain acronyms.
- Keep destructive or irreversible actions visually distinct and require an explicit confirmation pattern where appropriate.

## 10. Decision Log

| Date | Page / source | Decision | Now documented in |
|---|---|---|---|
| 2026-08-24 | 13-page UI init | Adopted the dominant Kandypack violet theme as the shared baseline. | `DESIGN.md`, sections 2–6 |
| 2026-08-24 | All page pairs | Standardized 260px desktop sidebar, 8px spacing base, 16px cards, and pill actions/statuses. | `DESIGN.md`, sections 4–6 |
| 2026-08-24 | `train_schedule`, `reports`, `audit_log` | Preserved divergent palettes and geometry as explicit open conflicts for page-level confirmation. | `DESIGN.md`, section 7 |

## 11. Open Implementation Questions

1. Confirm whether `train_schedule` is intentionally a separate steel/amber operational mode or should be migrated to the shared violet palette.
2. Confirm whether the deeper violet used by `reports` and `audit_log` is a sanctioned accent variant.
3. Choose the responsive table behavior per page: horizontal scroll or card-stack transformation.

