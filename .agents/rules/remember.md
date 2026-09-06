# Workspace Rule — Session Memory & Task Tracker Synchronization

> Scope: This project only (`kandypack`)

## Session Memory Rules

1. **End-of-Session Memory (`/remember save`):**
   - Save the current session state into `memory.md` in the project root.
   - Extract what was built, decisions made, problems solved, current state, what comes next, and open questions.
   - **Security Boundary:** Never persist secrets, passwords, connection strings, or tokens.
   - **Task Tracker Synchronization (`Docs/09_task-tracker.md`):**
     - Mark completed tasks with `✅` (green checkmark).
     - Mark in-progress tasks with `⏳`.
     - Leave untouched tasks `[ ]`.
   - If `memory.md` already exists, confirm with the developer before overwriting.

2. **Start-of-Session Memory (`/remember restore`):**
   - Read `memory.md` and project context docs.
   - Summarize what was restored and confirm before building.

3. **Core Standard:**
   - Every session ends with `/remember save`.
   - Every session starts with `/remember restore`.
