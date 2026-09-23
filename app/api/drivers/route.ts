/**
 * @file app/api/drivers/route.ts
 * @description GET /api/drivers — returns all non-deleted driver records with live
 *              current-week roster hours calculated by the DB function
 *              get_driver_weekly_hours(driver_id, week_start).
 *
 * Owner: Member 3 (Fleet & Deliveries)
 * Auth: Any authenticated role can read drivers (fleet_supervisor and system_administrator
 *       per PERMISSION_MATRIX; all authenticated roles have read).
 *
 * Data flow:
 *   1. Extract and verify JWT session from cookie via getSession().
 *   2. Check the caller has read access on the 'drivers' resource.
 *   3. Query drivers JOIN employees to get names; compute the current Monday
 *      (week start) as a DATETIME string and pass it to get_driver_weekly_hours().
 *   4. Derive hours_remaining = max(0, 40 - current_week_hours).
 *   5. Return { items: DriverItem[] }.
 *
 * Business rules:
 *   - Driver weekly limit is 40 hours (BR-006 in Docs/04_database-schema-v4.md).
 *   - Week starts on Monday per fn_week_start() DB function (calendar: Mon–Sun).
 *   - Only drivers whose parent employee row is also not deleted are included.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A7 GET /api/drivers
 *   - Docs/03_architecture.md §7
 *   - db/migrations/10_functions.sql get_driver_weekly_hours()
 *   - types/fleet.ts DriverItem
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import type { DriverItem } from '@/types/fleet';

/** Weekly hour cap for drivers (BR-006). */
const DRIVER_WEEKLY_LIMIT = 40;

/**
 * Raw row shape coming back from MySQL for the drivers query.
 * mysql2 returns BIGINT as string and DECIMAL as string; we coerce on output.
 */
interface DriverRow {
  driver_id: string | number;
  full_name: string;
  current_week_hours: string | number;
}

/**
 * Returns the ISO datetime string for the most recent Monday 00:00:00 UTC.
 * Matches the logic used by fn_week_start() in the DB (Monday-anchored week).
 *
 * @returns YYYY-MM-DD HH:MM:SS formatted datetime for Monday 00:00:00 of the current week
 */
function getCurrentWeekStart(): string {
  const now = new Date();
  // getDay() → 0=Sun, 1=Mon, ..., 6=Sat; adjust so Monday = 0 offset
  const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  // Format as 'YYYY-MM-DD 00:00:00' to match MySQL DATETIME
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())} 00:00:00`;
}

/**
 * GET /api/drivers
 *
 * Returns all active drivers with their live current-week roster hours.
 * The hours_remaining field drives the availability indicator in the
 * /truck-schedule/new dropdown (shown inline next to the driver name).
 *
 * @returns 200 { items: DriverItem[] } on success
 * @returns 401 if the request carries no valid JWT session
 * @returns 403 if the authenticated role lacks read access on drivers
 * @returns 500 on unexpected database or server error
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Step 1 — Authenticate the caller
    const session = await getSession();
    requirePermission(session, 'drivers', 'read');

    // Step 2 — Compute current week start (Monday 00:00:00) to pass to the DB function
    const weekStart = getCurrentWeekStart();

    // Step 3 — Fetch drivers with live weekly hours using the DB function.
    // We call get_driver_weekly_hours() inline via SELECT to avoid N+1 round trips.
    // Only non-deleted driver rows whose parent employee row is also not deleted are returned.
    const rows = await query<DriverRow[]>(
      `SELECT
         d.driver_id,
         e.full_name,
         get_driver_weekly_hours(d.driver_id, ?) AS current_week_hours
       FROM drivers d
       JOIN employees e ON e.employee_id = d.employee_id
      WHERE d.is_deleted = 0
        AND e.is_deleted = 0
      ORDER BY e.full_name ASC`,
      [weekStart]
    );

    // Step 4 — Normalise types and compute hours_remaining
    const items: DriverItem[] = rows.map((row) => {
      const currentHours = Number(row.current_week_hours) || 0;
      return {
        driver_id: Number(row.driver_id),
        full_name: row.full_name,
        current_week_hours: currentHours,
        weekly_limit: DRIVER_WEEKLY_LIMIT,
        hours_remaining: Math.max(0, DRIVER_WEEKLY_LIMIT - currentHours),
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

    console.error('[GET /api/drivers]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
