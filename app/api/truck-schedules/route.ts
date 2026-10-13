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
 *   - date_from    YYYY-MM-DD  — schedules with start_time >= this date
 *   - date_to      YYYY-MM-DD  — schedules with start_time <= this date (end of day)
 *   - status       string      — Scheduled | In Progress | Completed | Cancelled
 *   - driver_id    number
 *   - driver_name  string      — partial name match on the driver's employee.full_name (LIKE %value%)
 *   - truck_id     number
 * Response 200: { items: TruckScheduleItem[], total: number }
 *
 * ── POST /api/truck-schedules ─────────────────────────────────────────────────
 * Auth: fleet_supervisor, system_administrator only.
 * Request body: { truck_id, driver_id, assistant_id, route_id, start_time, order_ids? }
 *   NOTE: end_time is NOT accepted — the procedure derives it from
 *         routes.max_delivery_time_hours (see db/migrations/18_proc_remaining.sql).
 *   `order_ids` (optional) attaches orders to the new schedule: one `Scheduled` delivery is created
 *   per order, in the SAME transaction as the schedule, so either everything is saved or nothing is
 *   (smoke-test gap G1, Docs/14_smoke-test-guide.md §3). Each order must be `At Store`, on this
 *   route, and have no active delivery. Without `order_ids` the schedule is created on its own.
 * Response 201: { schedule_id: number, delivery_ids: number[] }
 * Response 400: business-rule violation from trigger/procedure (SIGNAL SQLSTATE '45000'),
 *               or an order that cannot be attached (code INVALID_ORDER)
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
import { withUserContext } from '@/lib/db';
import { withLock, REDIS_KEYS } from '@/lib/redis';

// ─── Types ───────────────────────────────────────────────────────────────────

import {
  fetchTruckSchedulesFromDB,
  attachOrdersToSchedule,
  OrderAssignmentError,
  MAX_ORDERS_PER_SCHEDULE,
} from './service';

// ─── Helpers ─────────────────────────────────────────────────────────────────



/**
 * Returns true when the thrown error is a MySQL SIGNAL raised intentionally by a
 * stored procedure or trigger (SQLSTATE '45000').
 * Only these errors carry a user-safe message; all other DB errors should be
 * treated as unexpected and must not expose raw MySQL internals to the client.
 *
 * @param err - Any thrown error value
 * @returns true if the error originated from a SIGNAL SQLSTATE '45000' statement
 */
function isSqlSignal(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return e.sqlState === '45000';
  }
  return false;
}

/**
 * Extracts the user-facing message from a MySQL SIGNAL SQLSTATE '45000' error.
 * Call this ONLY after confirming isSqlSignal(err) === true.
 * mysql2 surfaces the message in err.sqlMessage (preferred) or err.message.
 *
 * @param err - A confirmed SIGNAL error value
 * @returns User-safe message string from the procedure or trigger
 */
function extractSqlSignalMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.sqlMessage === 'string') return e.sqlMessage;
    if (typeof e.message === 'string') return e.message;
  }
  return 'A business rule violation occurred.';
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
    const dateFrom   = searchParams.get('date_from');   // YYYY-MM-DD
    const dateTo     = searchParams.get('date_to');     // YYYY-MM-DD
    const status     = searchParams.get('status');
    const driverId   = searchParams.get('driver_id');
    const driverName = searchParams.get('driver_name'); // partial name LIKE match
    const truckId    = searchParams.get('truck_id');

    const items = await fetchTruckSchedulesFromDB({
      dateFrom,
      dateTo,
      status,
      driverId,
      driverName,
      truckId,
    });

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
 *   start_time:   string  // 'YYYY-MM-DD HH:MM[:SS]'
 *   order_ids?:   number[] // optional: attach these At Store orders as Scheduled deliveries
 * }
 *
 * NOTE: end_time is NOT accepted. The procedure derives it from
 *       routes.max_delivery_time_hours internally.
 *
 * When `order_ids` is non-empty the procedure call and the delivery inserts run in ONE explicit
 * transaction, so a rejected order leaves no schedule behind. Without it the behaviour is unchanged.
 *
 * @param request - Incoming Next.js request
 * @returns 201 { schedule_id: number, delivery_ids: number[] } on success
 * @returns 400 on validation error, an order that cannot be attached, or a business-rule
 *          violation from the DB trigger
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

    const { truck_id, driver_id, assistant_id, route_id, start_time, order_ids } =
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

    // Issue 14: Accept only YYYY-MM-DD HH:MM[:SS] to prevent timezone offset bugs
    const mysqlDatetimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
    if (!mysqlDatetimeRegex.test(startTimeStr)) {
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

    // Optional order_ids: must be an array of distinct positive integers, bounded in size.
    // Duplicates are collapsed so the same order is never attached twice in one request.
    let orderIds: number[] = [];
    if (order_ids !== undefined && order_ids !== null) {
      if (
        !Array.isArray(order_ids) ||
        order_ids.length > MAX_ORDERS_PER_SCHEDULE ||
        order_ids.some((v) => !Number.isInteger(Number(v)) || Number(v) <= 0)
      ) {
        return NextResponse.json(
          {
            error: {
              code: 'BAD_REQUEST',
              message: `order_ids must be an array of at most ${MAX_ORDERS_PER_SCHEDULE} positive integers.`,
              field: 'order_ids',
            },
          },
          { status: 400 }
        );
      }
      orderIds = [...new Set(order_ids.map((v) => Number(v)))];
    }

    // Step 3 — Acquire Redis locks on truck, driver, and assistant via withLock.
    // Nested withLock calls guarantee that every lock is released in its own
    // finally block, so a Redis throw or a DB error mid-way can never leak a lock.
    // Lock TTL = 15s (enough for the procedure plus round trips).
    // Architecture §13: belt-and-braces alongside the BEFORE INSERT trigger.
    //
    // Nesting order: truck → driver → assistant (consistent order prevents
    // deadlocks if two concurrent requests happen to target the same resources).
    let scheduleId: number;
    let deliveryIds: number[] = [];
    try {
      scheduleId = await withLock(
        REDIS_KEYS.LOCK_TRUCK_SCHEDULE(truckIdN),
        () =>
          withLock(
            REDIS_KEYS.LOCK_DRIVER_SCHEDULE(driverIdN),
            () =>
              withLock(
                REDIS_KEYS.LOCK_ASSISTANT_SCHEDULE(assistantIdN),
                async () => {
                  // Step 4 — Call schedule_truck_delivery() inside a user-context connection.
                  // @current_app_role is required by the procedure's role guard and audit trigger.
                  return withUserContext(
                    session.user_id,
                    session.role,
                    async (conn) => {
                      // When orders are attached, the schedule and its deliveries must succeed or
                      // fail together, so they share one explicit transaction. Without orders the
                      // single INSERT inside the procedure stays autocommit, exactly as before.
                      const attachOrders = orderIds.length > 0;
                      if (attachOrders) await conn.beginTransaction();
                      try {
                        // Pass the validated datetime string straight through
                        await conn.execute(
                          'CALL schedule_truck_delivery(?, ?, ?, ?, ?, @out_schedule_id)',
                          [truckIdN, driverIdN, assistantIdN, routeIdN, startTimeStr] as Parameters<typeof conn.execute>[1]
                        );

                        // Retrieve the OUT parameter value from the session variable.
                        const [resultRows] = await conn.execute('SELECT @out_schedule_id AS schedule_id') as unknown as [Array<{ schedule_id: number | string | null }>];
                        const newScheduleId = Number(resultRows[0]?.schedule_id ?? 0);

                        if (attachOrders) {
                          if (!newScheduleId) {
                            throw new Error('schedule_truck_delivery() returned no schedule id.');
                          }
                          deliveryIds = await attachOrdersToSchedule(conn, newScheduleId, routeIdN, orderIds);
                          await conn.commit();
                        }
                        return newScheduleId;
                      } catch (txError) {
                        // Undo the schedule too, so a rejected order never leaves one behind.
                        if (attachOrders) await conn.rollback();
                        throw txError;
                      }
                    }
                  );
                },
                { ttlSeconds: 15 }
              ),
            { ttlSeconds: 15 }
          ),
        { ttlSeconds: 15 }
      );
    } catch (dbErr) {
      // ── 423: Redis lock contention ─────────────────────────────────────────
      // withLock throws a plain Error with this prefix when it cannot acquire.
      const lockMsg = dbErr instanceof Error ? dbErr.message : '';
      if (lockMsg.startsWith('Resource is currently locked')) {
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

      // ── 400: an order that cannot be attached (already rolled back above) ──
      if (dbErr instanceof OrderAssignmentError) {
        return NextResponse.json(
          { error: { code: 'INVALID_ORDER', message: dbErr.message, field: 'order_ids' } },
          { status: 400 }
        );
      }

      // ── 400: Intentional business-rule violation from the procedure/trigger ─
      // Only SIGNAL SQLSTATE '45000' errors carry a user-safe message.
      if (isSqlSignal(dbErr)) {
        return NextResponse.json(
          { error: { code: 'BUSINESS_RULE_VIOLATION', message: extractSqlSignalMessage(dbErr) } },
          { status: 400 }
        );
      }

      // ── 500: Unexpected DB error (dropped connection, syntax error, etc.) ───
      // Log the raw error server-side; never expose MySQL internals to the client.
      console.error('[POST /api/truck-schedules] Unexpected DB error:', dbErr);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
        { status: 500 }
      );
    }

    if (!scheduleId || scheduleId === 0) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate a valid schedule ID.' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ schedule_id: scheduleId, delivery_ids: deliveryIds }, { status: 201 });
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
