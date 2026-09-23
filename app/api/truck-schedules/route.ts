/**
 * @file app/api/truck-schedules/route.ts
 * @description GET /api/truck-schedules — filterable list of truck delivery schedules.
 *              POST /api/truck-schedules — creates a new truck schedule by calling
 *              the stored procedure schedule_truck_delivery() under a Redis distributed
 *              lock that guards against concurrent race conditions.
 *
 * Owner: Member 3 (Fleet & Deliveries)
 *
 * ── GET /api/truck-schedules ──────────────────────────────────────────────────
 * Auth: Any authenticated role (fleet_supervisor / system_administrator per matrix;
 *       all other roles are read-visible from the PERMISSION_MATRIX).
 * Query params (all optional):
 *   - date_from  YYYY-MM-DD  — schedules with start_time >= this date
 *   - date_to    YYYY-MM-DD  — schedules with start_time <= this date (end of day)
 *   - status     string      — Scheduled | In Progress | Completed | Cancelled
 *   - driver_id  number
 *   - truck_id   number
 * Response 200: { items: TruckScheduleItem[], total: number }
 *
 * ── POST /api/truck-schedules ─────────────────────────────────────────────────
 * Auth: fleet_supervisor, system_administrator only.
 * Request body: { truck_id, driver_id, assistant_id, route_id, start_time }
 *   NOTE: end_time is NOT accepted — the procedure derives it from
 *         routes.max_delivery_time_hours (see db/migrations/18_proc_remaining.sql).
 * Response 201: { schedule_id: number }
 * Response 400: business-rule violation from trigger/procedure (SIGNAL SQLSTATE '45000')
 * Response 423: Redis lock could not be acquired — another concurrent request is in progress
 *
 * Concurrency strategy (Docs/03_architecture.md §13):
 *   Acquire Redis locks on truck_id, driver_id, and assistant_id before calling the
 *   procedure. The trigger trg_validate_truck_schedule is the DB-level backstop.
 *   Lock TTL = 15s (enough for the procedure plus round trips).
 *
 * References:
 *   - Docs/05_api-and-pages.md §A7
 *   - Docs/03_architecture.md §7, §10, §13
 *   - db/migrations/18_proc_remaining.sql schedule_truck_delivery()
 *   - db/migrations/13_trg_truck_schedule.sql trg_validate_truck_schedule
 *   - lib/redis.ts acquireLock, releaseLock, REDIS_KEYS
 *   - types/fleet.ts TruckScheduleItem
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query, withUserContext } from '@/lib/db';
import { acquireLock, releaseLock, REDIS_KEYS } from '@/lib/redis';
import type { TruckScheduleItem } from '@/types/fleet';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Raw JOIN row returned by the GET list query.
 * Includes denormalized names from the joined trucks/drivers/assistants/routes tables.
 */
interface ScheduleJoinRow {
  schedule_id: string | number;
  truck_plate: string;
  driver_name: string;
  assistant_name: string;
  route_name: string;
  start_time: Date | string;
  end_time: Date | string;
  status: TruckScheduleItem['status'];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats a Date or ISO datetime string as a MySQL-compatible 'YYYY-MM-DD HH:MM:SS' string.
 * Used to normalise date values from mysql2 (which may return Date objects) before JSON
 * serialisation so the frontend always sees consistent ISO-style strings.
 *
 * @param value - Date object or string from the database row
 * @returns Formatted datetime string
 */
function formatDatetime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Extracts the human-readable message from a MySQL SIGNAL SQLSTATE error.
 * mysql2 surfaces the message in err.sqlMessage or err.message.
 *
 * @param err - Any thrown error value
 * @returns Human-readable message string from the procedure/trigger
 */
function extractSqlMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.sqlMessage === 'string') return e.sqlMessage;
    if (typeof e.message === 'string') return e.message;
  }
  return 'An unexpected database error occurred.';
}

// ─── GET ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/truck-schedules
 *
 * Returns a filterable list of truck delivery schedules with denormalized display
 * names for truck, driver, assistant, and route.
 *
 * @param request - Incoming Next.js request (used to read query params)
 * @returns 200 { items: TruckScheduleItem[], total: number }
 * @returns 401/403 on auth failure
 * @returns 500 on unexpected error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();
    // All authenticated roles may read truck schedules (proxy guards unauthenticated access)
    requirePermission(session, 'truck_schedules', 'read');

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');   // YYYY-MM-DD
    const dateTo   = searchParams.get('date_to');     // YYYY-MM-DD
    const status   = searchParams.get('status');
    const driverId = searchParams.get('driver_id');
    const truckId  = searchParams.get('truck_id');

    // Build WHERE clause dynamically; always exclude nothing (all statuses visible)
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (dateFrom) {
      conditions.push('ts.start_time >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      conditions.push('ts.start_time <= ?');
      params.push(`${dateTo} 23:59:59`);
    }
    if (status) {
      conditions.push('ts.status = ?');
      params.push(status);
    }
    if (driverId) {
      conditions.push('ts.driver_id = ?');
      params.push(Number(driverId));
    }
    if (truckId) {
      conditions.push('ts.truck_id = ?');
      params.push(Number(truckId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query<ScheduleJoinRow[]>(
      `SELECT
         ts.schedule_id,
         t.plate_number       AS truck_plate,
         de.full_name         AS driver_name,
         ae.full_name         AS assistant_name,
         r.route_name,
         ts.start_time,
         ts.end_time,
         ts.status
       FROM truck_schedules ts
       JOIN trucks      t   ON t.truck_id         = ts.truck_id
       JOIN drivers     d   ON d.driver_id         = ts.driver_id
       JOIN employees   de  ON de.employee_id      = d.employee_id
       JOIN assistants  a   ON a.assistant_id      = ts.assistant_id
       JOIN employees   ae  ON ae.employee_id      = a.employee_id
       JOIN routes      r   ON r.route_id          = ts.route_id
       ${whereClause}
       ORDER BY ts.start_time DESC`,
      params
    );

    // Normalise mysql2 Date objects to strings for consistent JSON output
    const items: TruckScheduleItem[] = rows.map((row) => ({
      schedule_id:    Number(row.schedule_id),
      truck_plate:    row.truck_plate,
      driver_name:    row.driver_name,
      assistant_name: row.assistant_name,
      route_name:     row.route_name,
      start_time:     formatDatetime(row.start_time),
      end_time:       formatDatetime(row.end_time),
      status:         row.status,
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: (err as { status: number }).status }
      );
    }
    console.error('[GET /api/truck-schedules]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

/**
 * POST /api/truck-schedules
 *
 * Creates a new truck delivery schedule via CALL schedule_truck_delivery().
 * Acquires Redis locks on truck_id, driver_id, and assistant_id before the
 * procedure call to guard against race conditions in concurrent submissions.
 *
 * Request body:
 * {
 *   truck_id:     number,
 *   driver_id:    number,
 *   assistant_id: number,
 *   route_id:     number,
 *   start_time:   string  // ISO 8601 or 'YYYY-MM-DD HH:MM'
 * }
 *
 * NOTE: end_time is NOT accepted. The procedure derives it from
 *       routes.max_delivery_time_hours internally.
 *
 * @param request - Incoming Next.js request
 * @returns 201 { schedule_id: number } on success
 * @returns 400 on validation error or business-rule violation from the DB trigger
 * @returns 401/403 on auth failure
 * @returns 423 if a Redis lock could not be acquired (concurrent request in progress)
 * @returns 500 on unexpected error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1 — Auth: fleet_supervisor or system_administrator only
    const session = await getSession();
    requirePermission(session, 'truck_schedules', 'create');

    // Step 2 — Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Request body must be valid JSON.' } },
        { status: 400 }
      );
    }

    const { truck_id, driver_id, assistant_id, route_id, start_time } =
      body as Record<string, unknown>;

    // Required field validation
    if (!truck_id || !driver_id || !assistant_id || !route_id || !start_time) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'truck_id, driver_id, assistant_id, route_id, and start_time are required.',
          },
        },
        { status: 400 }
      );
    }

    const truckIdN     = Number(truck_id);
    const driverIdN    = Number(driver_id);
    const assistantIdN = Number(assistant_id);
    const routeIdN     = Number(route_id);
    const startTimeStr = String(start_time);

    if (
      !Number.isFinite(truckIdN)     || truckIdN     <= 0 ||
      !Number.isFinite(driverIdN)    || driverIdN    <= 0 ||
      !Number.isFinite(assistantIdN) || assistantIdN <= 0 ||
      !Number.isFinite(routeIdN)     || routeIdN     <= 0
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'truck_id, driver_id, assistant_id, and route_id must be positive integers.',
          },
        },
        { status: 400 }
      );
    }

    // Validate start_time parses to a real date
    const startDate = new Date(startTimeStr);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'start_time must be a valid date-time string.',
            field: 'start_time',
          },
        },
        { status: 400 }
      );
    }

    // Step 3 — Acquire Redis locks on truck, driver, and assistant.
    // Lock TTL = 15s; any lock acquisition failure returns 423 immediately.
    // Belt-and-braces alongside the BEFORE INSERT trigger in the DB (architecture §13).
    const lockTruckKey     = REDIS_KEYS.LOCK_TRUCK_SCHEDULE(truckIdN);
    const lockDriverKey    = REDIS_KEYS.LOCK_DRIVER_SCHEDULE(driverIdN);
    const lockAssistantKey = REDIS_KEYS.LOCK_ASSISTANT_SCHEDULE(assistantIdN);

    const lockTruck     = await acquireLock(lockTruckKey, 15);
    const lockDriver    = await acquireLock(lockDriverKey, 15);
    const lockAssistant = await acquireLock(lockAssistantKey, 15);

    // If any lock acquisition failed, release what we hold and reject
    if (!lockTruck.acquired || !lockDriver.acquired || !lockAssistant.acquired) {
      if (lockTruck.acquired)     await releaseLock(lockTruckKey, lockTruck.lockToken);
      if (lockDriver.acquired)    await releaseLock(lockDriverKey, lockDriver.lockToken);
      if (lockAssistant.acquired) await releaseLock(lockAssistantKey, lockAssistant.lockToken);

      return NextResponse.json(
        {
          error: {
            code: 'LOCK_CONTENTION',
            message:
              'Another schedule creation is in progress for the same truck, driver, or assistant. Please try again shortly.',
          },
        },
        { status: 423 }
      );
    }

    // Step 4 — Call schedule_truck_delivery() inside a user-context connection.
    // @current_app_role is required by the procedure's role guard and the audit trigger.
    let scheduleId: number;
    try {
      scheduleId = await withUserContext(
        session.user_id,
        session.role,
        async (conn) => {
          // Format start_time as MySQL DATETIME string
          const pad = (n: number) => String(n).padStart(2, '0');
          const mysqlDatetime =
            `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())} ` +
            `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}:${pad(startDate.getSeconds())}`;

          // Call the procedure; OUT parameter is retrieved via a second SELECT.
          // Cast params as unknown[] — mysql2's execute() accepts (string, unknown[])
          // but its type declarations (not installed) require a narrower type here.
          await conn.execute(
            'CALL schedule_truck_delivery(?, ?, ?, ?, ?, @out_schedule_id)',
            [truckIdN, driverIdN, assistantIdN, routeIdN, mysqlDatetime] as unknown[]
          );

          // Retrieve the OUT parameter value from the session variable.
          // Cast via unknown to avoid the no-explicit-any rule while still
          // extracting the scalar OUT param (mysql2 types not installed).
          const [resultRows] = await conn.execute('SELECT @out_schedule_id AS schedule_id') as unknown as [Array<{ schedule_id: number | string | null }>];
          return Number(resultRows[0]?.schedule_id ?? 0);
        }
      );
    } catch (dbErr) {
      // Map SIGNAL SQLSTATE '45000' to a 400 with the procedure/trigger message
      const sqlMessage = extractSqlMessage(dbErr);
      return NextResponse.json(
        { error: { code: 'BUSINESS_RULE_VIOLATION', message: sqlMessage } },
        { status: 400 }
      );
    } finally {
      // Step 5 — Always release Redis locks regardless of outcome
      await releaseLock(lockTruckKey, lockTruck.lockToken);
      await releaseLock(lockDriverKey, lockDriver.lockToken);
      await releaseLock(lockAssistantKey, lockAssistant.lockToken);
    }

    return NextResponse.json({ schedule_id: scheduleId }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: (err as { status: number }).status }
      );
    }
    console.error('[POST /api/truck-schedules]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
