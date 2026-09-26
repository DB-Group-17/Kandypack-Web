/**
 * @file app/api/truck-schedules/conflicts/route.ts
 * @description GET /api/truck-schedules/conflicts — read-only pre-check that runs the
 *              same business-rule logic as the schedule_truck_delivery() trigger, but
 *              without acquiring any lock, writing any row, or touching the DB in a
 *              write path. Used by the /truck-schedule/new form for live conflict
 *              warnings as the user fills in the fields (debounced on the client).
 *
 * Owner: Member 3 (Fleet & Deliveries)
 *
 * Auth: fleet_supervisor, system_administrator.
 *
 * Query params (all required when called):
 *   - truck_id      number
 *   - driver_id     number
 *   - assistant_id  number
 *   - start_time    string  // ISO 8601 or 'YYYY-MM-DD HH:MM'
 *   - route_id      number  // needed to derive end_time via max_delivery_time_hours
 *
 * Response 200:
 *   { has_conflict: boolean, reasons: string[] }
 *
 * Business rules checked (mirrors trg_validate_truck_schedule in 13_trg_truck_schedule.sql):
 *   1. Truck overlap (same truck, overlapping time window)
 *   2. Driver overlap (same driver, overlapping time window)
 *   3. Assistant overlap (same assistant, overlapping time window)
 *   4. Driver consecutive-delivery rule: chain must be ≤ 1 delivery with < 2h gap (BR-004)
 *   5. Assistant max-two-consecutive rule: chain must be ≤ 2 deliveries (BR-005)
 *   6. Driver weekly 40h limit (BR-006)
 *   7. Assistant weekly 60h limit (BR-007)
 *   8. Operating hours 06:00–20:00 on the same calendar day (chk_ts_operating_hours)
 *
 * NOTE: This endpoint is read-only. The DB trigger is the authoritative enforcement
 *       layer; this endpoint exists purely for UX feedback before the user submits.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A7 GET /api/truck-schedules/:id/conflicts
 *   - db/migrations/13_trg_truck_schedule.sql
 *   - db/migrations/10_functions.sql fn_driver_chain_length, fn_assistant_chain_length
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { queryOne } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConflictCheckResponse {
  has_conflict: boolean;
  reasons: string[];
}

/** Overlap check row shape */
interface OverlapRow {
  schedule_id: string | number;
  start_time: Date | string;
  end_time: Date | string;
}

/** Weekly hours function result */
interface WeeklyHoursRow {
  hours: string | number;
}

/** Chain length function result */
interface ChainLengthRow {
  chain: string | number;
}

/** Route lookup result */
interface RouteRow {
  max_delivery_time_hours: string | number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the Monday 00:00:00 of the week containing the given date,
 * formatted as 'YYYY-MM-DD HH:MM:SS' for MySQL DATETIME parameters.
 * Mirrors fn_week_start() in 10_functions.sql.
 *
 * @param date - The date whose week start we want
 * @returns Monday 00:00:00 as a MySQL DATETIME string
 */
function getWeekStart(date: Date): string {
  const dayOfWeek = date.getDay(); // 0=Sun … 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())} 00:00:00`;
}

/**
 * Formats a Date or mysql2 datetime value as 'YYYY-MM-DD HH:MM:SS'.
 *
 * @param value - Date object or string
 * @returns Formatted MySQL DATETIME string
 */
function toMysqlDatetime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/truck-schedules/conflicts
 *
 * Read-only pre-check that mirrors all 7 roster/overlap rules enforced by the
 * trg_validate_truck_schedule trigger and schedule_truck_delivery() procedure.
 * Runs without acquiring a Redis lock or writing any database row.
 *
 * All 7 rule checks run even after a conflict is found, so the UI can display
 * every problem at once rather than surfacing them one at a time.
 *
 * @param request - Incoming Next.js request (query params: truck_id, driver_id,
 *                  assistant_id, route_id, start_time)
 * @returns 200 { has_conflict: boolean, reasons: string[] }
 * @returns 400 on missing or invalid query params
 * @returns 401/403 on auth failure
 * @returns 500 on unexpected error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1 — Authenticate the caller
    const session = await getSession();
    // fleet_supervisor and system_administrator can create schedules → also run pre-checks
    requirePermission(session, 'truck_schedules', 'create');

    // Step 2 — Parse and validate query params
    const { searchParams } = new URL(request.url);
    const truckIdParam     = searchParams.get('truck_id');
    const driverIdParam    = searchParams.get('driver_id');
    const assistantIdParam = searchParams.get('assistant_id');
    const routeIdParam     = searchParams.get('route_id');
    const startTimeParam   = searchParams.get('start_time');

    if (!truckIdParam || !driverIdParam || !assistantIdParam || !routeIdParam || !startTimeParam) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'truck_id, driver_id, assistant_id, route_id, and start_time are required query params.',
          },
        },
        { status: 400 }
      );
    }

    // Accept only a naive 'YYYY-MM-DD HH:MM[:SS]' wall-clock time, matching POST.
    // An ISO string with an offset would be shifted to the server's timezone by
    // new Date(), making the overlap and operating-hours checks disagree with the
    // procedure, which stores the value exactly as sent.
    const mysqlDatetimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
    if (!mysqlDatetimeRegex.test(startTimeParam)) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'start_time must be in YYYY-MM-DD HH:MM or YYYY-MM-DD HH:MM:SS format.',
            field: 'start_time',
          },
        },
        { status: 400 }
      );
    }

    const truckId     = Number(truckIdParam);
    const driverId    = Number(driverIdParam);
    const assistantId = Number(assistantIdParam);
    const routeId     = Number(routeIdParam);
    const startDate   = new Date(startTimeParam);

    if (
      !Number.isFinite(truckId) || truckId <= 0 ||
      !Number.isFinite(driverId) || driverId <= 0 ||
      !Number.isFinite(assistantId) || assistantId <= 0 ||
      !Number.isFinite(routeId) || routeId <= 0 ||
      isNaN(startDate.getTime())
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'All numeric IDs must be positive integers and start_time must be a valid datetime.',
          },
        },
        { status: 400 }
      );
    }

    // Step 3 — Derive end_time from route's max_delivery_time_hours
    // This mirrors what schedule_truck_delivery() does internally.
    const routeRow = await queryOne<RouteRow>(
      'SELECT max_delivery_time_hours FROM routes WHERE route_id = ? AND is_deleted = 0',
      [routeId]
    );
    if (!routeRow) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: `Route ${routeId} not found or inactive.`,
            field: 'route_id',
          },
        },
        { status: 400 }
      );
    }

    const routeHours = Number(routeRow.max_delivery_time_hours);
    const endDate = new Date(startDate.getTime() + routeHours * 3600 * 1000);
    const startStr  = toMysqlDatetime(startDate);
    const endStr    = toMysqlDatetime(endDate);
    const weekStart = getWeekStart(startDate);
    const newHours  = routeHours; // hours this schedule would add

    // Step 4 — Run all 7 checks in parallel (all read-only, no locking)
    const reasons: string[] = [];

    const [
      truckOverlapRow,
      driverOverlapRow,
      assistantOverlapRow,
      driverChainRow,
      assistantChainRow,
      driverWeeklyRow,
      assistantWeeklyRow,
    ] = await Promise.all([
      // Check 1 — Truck overlap (BR-008)
      queryOne<OverlapRow>(
        `SELECT schedule_id, start_time, end_time FROM truck_schedules
          WHERE truck_id = ? AND status <> 'Cancelled'
            AND start_time < ? AND end_time > ? LIMIT 1`,
        [truckId, endStr, startStr]
      ),

      // Check 2 — Driver overlap (BR-008)
      queryOne<OverlapRow>(
        `SELECT schedule_id, start_time, end_time FROM truck_schedules
          WHERE driver_id = ? AND status <> 'Cancelled'
            AND start_time < ? AND end_time > ? LIMIT 1`,
        [driverId, endStr, startStr]
      ),

      // Check 3 — Assistant overlap (BR-008)
      queryOne<OverlapRow>(
        `SELECT schedule_id, start_time, end_time FROM truck_schedules
          WHERE assistant_id = ? AND status <> 'Cancelled'
            AND start_time < ? AND end_time > ? LIMIT 1`,
        [assistantId, endStr, startStr]
      ),

      // Check 4 — Driver chain length (BR-004): must be ≤ 1
      queryOne<ChainLengthRow>(
        'SELECT fn_driver_chain_length(?, ?, ?) AS chain',
        [driverId, startStr, endStr]
      ),

      // Check 5 — Assistant chain length (BR-005): must be ≤ 2
      queryOne<ChainLengthRow>(
        'SELECT fn_assistant_chain_length(?, ?, ?) AS chain',
        [assistantId, startStr, endStr]
      ),

      // Check 6 — Driver weekly hours (BR-006): current + new must be ≤ 40
      queryOne<WeeklyHoursRow>(
        'SELECT get_driver_weekly_hours(?, ?) AS hours',
        [driverId, weekStart]
      ),

      // Check 7 — Assistant weekly hours (BR-007): current + new must be ≤ 60
      queryOne<WeeklyHoursRow>(
        'SELECT get_assistant_weekly_hours(?, ?) AS hours',
        [assistantId, weekStart]
      ),
    ]);

    // ── Evaluate results ─────────────────────────────────────────────────────

    // Check 1 — Truck overlap
    if (truckOverlapRow) {
      reasons.push(
        `Truck is already booked for schedule #${Number(truckOverlapRow.schedule_id)} ` +
        `(${toMysqlDatetime(truckOverlapRow.start_time)} – ${toMysqlDatetime(truckOverlapRow.end_time)}).`
      );
    }

    // Check 2 — Driver overlap
    if (driverOverlapRow) {
      reasons.push(
        `Driver is already booked for schedule #${Number(driverOverlapRow.schedule_id)} ` +
        `(${toMysqlDatetime(driverOverlapRow.start_time)} – ${toMysqlDatetime(driverOverlapRow.end_time)}).`
      );
    }

    // Check 3 — Assistant overlap
    if (assistantOverlapRow) {
      reasons.push(
        `Assistant is already booked for schedule #${Number(assistantOverlapRow.schedule_id)} ` +
        `(${toMysqlDatetime(assistantOverlapRow.start_time)} – ${toMysqlDatetime(assistantOverlapRow.end_time)}).`
      );
    }

    // Check 4 — Driver chain (> 1 means consecutive delivery without ≥ 2h break)
    if (driverChainRow && Number(driverChainRow.chain) > 1) {
      reasons.push(
        `Driver would have back-to-back deliveries without the required 2-hour break (BR-004).`
      );
    }

    // Check 5 — Assistant chain (> 2 means more than 2 consecutive routes)
    if (assistantChainRow && Number(assistantChainRow.chain) > 2) {
      reasons.push(
        `Assistant would exceed 2 consecutive deliveries (BR-005). ` +
        `Current chain length: ${Number(assistantChainRow.chain)}.`
      );
    }

    // Check 6 — Driver weekly hours
    if (driverWeeklyRow) {
      const driverCurrentHours = Number(driverWeeklyRow.hours) || 0;
      if (driverCurrentHours + newHours > 40) {
        reasons.push(
          `Driver would exceed the 40h weekly limit (BR-006). ` +
          `Current: ${driverCurrentHours.toFixed(1)}h + ${newHours.toFixed(1)}h = ` +
          `${(driverCurrentHours + newHours).toFixed(1)}h.`
        );
      }
    }

    // Check 7 — Assistant weekly hours
    if (assistantWeeklyRow) {
      const assistantCurrentHours = Number(assistantWeeklyRow.hours) || 0;
      if (assistantCurrentHours + newHours > 60) {
        reasons.push(
          `Assistant would exceed the 60h weekly limit (BR-007). ` +
          `Current: ${assistantCurrentHours.toFixed(1)}h + ${newHours.toFixed(1)}h = ` +
          `${(assistantCurrentHours + newHours).toFixed(1)}h.`
        );
      }
    }

    // Check 8 — Operating hours 06:00–20:00 same calendar day (chk_ts_operating_hours)
    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    const endHour   = endDate.getHours()   + endDate.getMinutes()   / 60;
    if (startHour < 6) {
      reasons.push('Start time is before the 06:00 operating window.');
    }
    if (endHour > 20) {
      reasons.push('End time (derived from route duration) would fall after the 20:00 operating window.');
    }
    if (
      startDate.getFullYear() !== endDate.getFullYear() ||
      startDate.getMonth()    !== endDate.getMonth()    ||
      startDate.getDate()     !== endDate.getDate()
    ) {
      reasons.push('Schedule must start and end on the same calendar day.');
    }

    const result: ConflictCheckResponse = {
      has_conflict: reasons.length > 0,
      reasons,
    };

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: (err as { status: number }).status }
      );
    }
    console.error('[GET /api/truck-schedules/conflicts]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
