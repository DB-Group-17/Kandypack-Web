<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kandypack Project Instructions

## Startup context

At the start of every new chat or task, before planning or changing code:

1. Read [`DESIGN.md`](DESIGN.md) completely and treat it as the source of truth for the shared visual system.
2. Read every file in [`Docs/`](Docs/) completely, including newly added files and nested files. Do not rely only on filenames or a previous chat summary.
3. Check the current repository state and inspect the relevant existing page, component, route, and data files before making an edit.
4. Follow the rules in `Docs/11_ui-rules.md` for shared components, layout, colors, spacing, typography, status styles, and responsive behavior.

If a requested change conflicts with `DESIGN.md` or a documented rule, identify the conflict before implementing it. Update the relevant documentation when a new project-wide decision is confirmed.

## Implementation and commenting rules

- Reuse existing components, styles, tokens, layouts, and patterns before creating parallel implementations.
- Keep changes scoped to the requested pages/components and preserve unrelated work.
- Every page must include clear comments describing its main structure, data flow, user interactions, and page-specific logic.
- Add inline comments beside non-obvious conditions, transformations, state transitions, event handlers, accessibility workarounds, and integration logic.
- Add full function comments for every function, handler, helper, hook, loader, action, and other logic-bearing function. Describe its purpose, inputs, outputs/side effects, and important assumptions. Use JSDoc where appropriate.
- Comments must explain intent and logic, not restate obvious syntax. Keep comments accurate when code changes.
- Apply the same commenting standard to shared components and utilities, not only route/page files.
- Preserve sentence case in user-facing text and preserve domain acronyms.

## Project skills

Project-specific skills are stored in `.agents/skills/`

## Completion summary

After building or changing anything, provide a short handoff summary containing:

- What was built or changed.
- Which pages, routes, and components changed.
- Any new components, shared tokens, data behavior, or documentation added.
- Validation performed, including relevant checks or limitations.
- Any useful project rule, unresolved design conflict, follow-up, or manual QA still needed.

Keep the summary concise, but make it specific enough for the next task to continue without re-discovering the scope of the work.
