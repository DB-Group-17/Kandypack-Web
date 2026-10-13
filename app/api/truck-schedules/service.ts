import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';
import type { TruckScheduleItem } from '@/types/fleet';

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

/**
 * Formats a schedule DATETIME as the naive wall-clock string 'YYYY-MM-DD HH:MM:SS'.
 *
 * The pool reads DATETIME as UTC (`timezone: 'Z'` in lib/db.ts), so the Date's UTC fields
 * ARE the stored wall-clock fields. The getUTC* getters therefore reproduce exactly what is
 * in the database on any server timezone; the local getters would shift the time by the
 * server's UTC offset (e.g. 08:00 would show as 13:30 on an Asia/Colombo machine).
 *
 * @param value - Date from mysql2, or an already-formatted string
 * @returns 'YYYY-MM-DD HH:MM:SS', or the original text if it cannot be parsed
 */
function formatDatetime(value: Date | string): string {
  // An already-formatted naive string is returned untouched (re-parsing it would apply the
  // server's local offset).
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export async function fetchTruckSchedulesFromDB(filters: {
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  truckId?: string | null;
}): Promise<TruckScheduleItem[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.dateFrom) {
    conditions.push('ts.start_time >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    conditions.push('ts.start_time <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }
  if (filters.status) {
    conditions.push('ts.status = ?');
    params.push(filters.status);
  }
  if (filters.driverId) {
    conditions.push('ts.driver_id = ?');
    params.push(Number(filters.driverId));
  } else if (filters.driverName) {
    conditions.push('de.full_name LIKE ?');
    params.push(`%${filters.driverName}%`);
  }
  if (filters.truckId) {
    conditions.push('ts.truck_id = ?');
    params.push(Number(filters.truckId));
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

  return rows.map((row) => ({
    schedule_id:    Number(row.schedule_id),
    truck_plate:    row.truck_plate,
    driver_name:    row.driver_name,
    assistant_name: row.assistant_name,
    route_name:     row.route_name,
    start_time:     formatDatetime(row.start_time),
    end_time:       formatDatetime(row.end_time),
    status:         row.status,
  }));
}

// ─── Order assignment (G1) ───────────────────────────────────────────────────

/** Upper bound on orders attached to a single schedule, so one request cannot lock an unbounded set of rows. */
export const MAX_ORDERS_PER_SCHEDULE = 50;

/**
 * Error raised inside the creation transaction when an order cannot be attached to the schedule.
 * The handler rolls the whole transaction back (so no schedule is left behind) and answers 400
 * with the message, which names the order and the rule it broke.
 */
export class OrderAssignmentError extends Error {}

/**
 * Attaches orders to a freshly created schedule by inserting one `Scheduled` delivery per order.
 * Must run inside the caller's open transaction.
 *
 * Re-validates every order under a row lock (`FOR UPDATE`) so the rules hold even if the order
 * changed after the form's list was loaded or another supervisor is attaching it at the same time:
 *   - the order exists,
 *   - its status is `At Store`,
 *   - its route is the schedule's route, and
 *   - it has no active (Scheduled or In Progress) delivery.
 * `trg_check_active_delivery_on_insert` remains the database-level backstop for the last rule.
 *
 * @param conn - Connection with an open transaction and the caller's user context
 * @param scheduleId - The schedule just created by schedule_truck_delivery()
 * @param routeId - The schedule's route, which every order must share
 * @param orderIds - Distinct, validated order IDs to attach (non-empty)
 * @returns The new delivery IDs, in the same order as `orderIds`
 * @throws OrderAssignmentError when any order breaks a rule (nothing is inserted for any order)
 */
export async function attachOrdersToSchedule(
  conn: PoolConnection,
  scheduleId: number,
  routeId: number,
  orderIds: number[]
): Promise<number[]> {
  const placeholders = orderIds.map(() => '?').join(', ');
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT o.order_id, o.status, o.route_id,
            (SELECT COUNT(*) FROM deliveries d
              WHERE d.order_id = o.order_id AND d.status IN ('Scheduled', 'In Progress')) AS active_deliveries
       FROM orders o
      WHERE o.order_id IN (${placeholders})
        FOR UPDATE`,
    orderIds
  );
  const byId = new Map(rows.map((row) => [Number(row.order_id), row]));

  // Check every order before inserting anything, reporting the first problem found.
  for (const orderId of orderIds) {
    const order = byId.get(orderId);
    if (!order) {
      throw new OrderAssignmentError(`Order #${orderId} was not found.`);
    }
    if (order.status !== 'At Store') {
      throw new OrderAssignmentError(
        `Order #${orderId} is ${order.status}; only orders that are At Store can be assigned to a delivery.`
      );
    }
    if (Number(order.route_id) !== routeId) {
      throw new OrderAssignmentError(
        `Order #${orderId} is on a different delivery route than this schedule.`
      );
    }
    if (Number(order.active_deliveries) > 0) {
      throw new OrderAssignmentError(`Order #${orderId} already has an active delivery.`);
    }
  }

  const deliveryIds: number[] = [];
  for (const orderId of orderIds) {
    const [inserted] = await conn.execute<ResultSetHeader>(
      `INSERT INTO deliveries (order_id, truck_schedule_id, status) VALUES (?, ?, 'Scheduled')`,
      [orderId, scheduleId]
    );
    deliveryIds.push(inserted.insertId);
  }
  return deliveryIds;
}
