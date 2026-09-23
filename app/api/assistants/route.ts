/**
 * @file app/api/assistants/route.ts
 * @description GET /api/assistants — returns all non-deleted assistant records with live
 *              current-week roster hours calculated by the DB function
 *              get_assistant_weekly_hours(assistant_id, week_start).
 *
 * Owner: Member 3 (Fleet & Deliveries)
 * Auth: Any authenticated role can read assistants (fleet_supervisor and system_administrator
 *       per PERMISSION_MATRIX; all authenticated roles have read).
 *
 * Data flow:
 *   1. Extract and verify JWT session from cookie via getSession().
 *   2. Check the caller has read access on the 'assistants' resource.
 *   3. Query assistants JOIN employees; pass current Monday to get_assistant_weekly_hours().
 *   4. Derive hours_remaining = max(0, 60 - current_week_hours).
 *   5. Return { items: AssistantItem[] }.
 *
 * Business rules:
 *   - Assistant weekly limit is 60 hours (BR-007 in Docs/04_database-schema-v4.md).
 *   - Week starts on Monday per fn_week_start() DB function (calendar: Mon–Sun).
 *   - Only assistants whose parent employee row is also not deleted are included.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A7 GET /api/assistants
 *   - Docs/03_architecture.md §7
 *   - db/migrations/10_functions.sql get_assistant_weekly_hours()
 *   - types/fleet.ts AssistantItem
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import type { AssistantItem } from '@/types/fleet';

/** Weekly hour cap for assistants (BR-007). */
const ASSISTANT_WEEKLY_LIMIT = 60;

/**
 * Raw row shape returned by MySQL for the assistants query.
 * mysql2 returns BIGINT as string and function results as string.
 */
interface AssistantRow {
  assistant_id: string | number;
  full_name: string;
  current_week_hours: string | number;
}

/**
 * Returns the ISO datetime string for the most recent Monday 00:00:00.
 * Mirrors the logic in get_driver_weekly_hours / get_assistant_weekly_hours and
 * fn_week_start() in db/migrations/10_functions.sql (Monday-anchored week).
 *
 * @returns YYYY-MM-DD HH:MM:SS string representing the current week's Monday
 */
function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())} 00:00:00`;
}

/**
 * GET /api/assistants
 *
 * Returns all active assistants with their live current-week roster hours.
 * The hours_remaining field drives the availability indicator in the
 * /truck-schedule/new dropdown (shown inline next to the assistant name).
 *
 * @returns 200 { items: AssistantItem[] } on success
 * @returns 401 if the request carries no valid JWT session
 * @returns 403 if the authenticated role lacks read access on assistants
 * @returns 500 on unexpected database or server error
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Step 1 — Authenticate the caller
    const session = await getSession();
    requirePermission(session, 'assistants', 'read');

    // Step 2 — Compute current week start (Monday 00:00:00) to pass to the DB function
    const weekStart = getCurrentWeekStart();

    // Step 3 — Fetch assistants with live weekly hours using the DB scalar function.
    // Calling the function inline avoids N+1 round trips.
    // Only non-deleted assistant rows whose parent employee row is also not deleted.
    const rows = await query<AssistantRow[]>(
      `SELECT
         a.assistant_id,
         e.full_name,
         get_assistant_weekly_hours(a.assistant_id, ?) AS current_week_hours
       FROM assistants a
       JOIN employees e ON e.employee_id = a.employee_id
      WHERE a.is_deleted = 0
        AND e.is_deleted = 0
      ORDER BY e.full_name ASC`,
      [weekStart]
    );

    // Step 4 — Normalise types and compute hours_remaining
    const items: AssistantItem[] = rows.map((row) => {
      const currentHours = Number(row.current_week_hours) || 0;
      return {
        assistant_id: Number(row.assistant_id),
        full_name: row.full_name,
        current_week_hours: currentHours,
        weekly_limit: ASSISTANT_WEEKLY_LIMIT,
        hours_remaining: Math.max(0, ASSISTANT_WEEKLY_LIMIT - currentHours),
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      const status = (err as { status: number }).status;
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status }
      );
    }

    console.error('[GET /api/assistants]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
