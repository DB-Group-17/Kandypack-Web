/**
 * @file app/api/deliveries/service.ts
 * @description Data-access layer for the deliveries API.
 *
 * Provides `fetchDeliveriesFromDB()` which builds and executes a filtered
 * SELECT query joining deliveries → orders → customers (for customer_name),
 * and deliveries → truck_schedules → trucks (for plate_number) →
 * drivers → employees (for driver_name).
 *
 * Owner: Member 3 (Fleet & Deliveries)
 *
 * References:
 *   - Docs/05_api-and-pages.md §A8 (Deliveries response shape)
 *   - db/migrations/08_fleet.sql (deliveries table)
 *   - db/migrations/05_orders.sql (orders → customers FK)
 *   - types/fleet.ts DeliveryItem
 */

import { query } from '@/lib/db';
import type { DeliveryItem, DeliveryStatus } from '@/types/fleet';

// ─── Internal row type ──────────────────────────────────────────────────────

/**
 * Raw row shape returned by the deliveries JOIN query.
 * MySQL datetime columns come back as Date objects or strings depending
 * on the mysql2 driver configuration; we handle both.
 */
interface DeliveryJoinRow {
  delivery_id: string | number;
  order_id: string | number;
  customer_name: string;
  truck_plate: string;
  driver_name: string;
  status: DeliveryStatus;
  delivered_at: Date | string | null;
  notes: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Serialises a DATETIME value as an ISO 8601 string, as Docs/05_api-and-pages.md
 * requires ("Timestamps are ISO 8601 strings over the wire"). Uses toISOString()
 * like the orders routes, so every API formats datetimes the same way and the
 * team-wide timezone fix (mysql2 `timezone: 'Z'` in lib/db.ts) corrects them together.
 * Returns null for null/undefined inputs and the raw text for unparseable values.
 *
 * @param value - A Date object, date string, or null
 * @returns ISO 8601 string or null
 */
function formatDatetime(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Filter parameters accepted by fetchDeliveriesFromDB.
 * All fields are optional — omitting a filter means no restriction on that column.
 */
export interface DeliveryFilters {
  /** Delivery lifecycle status (Scheduled | In Progress | Completed | Failed | Cancelled) */
  status?: string | null;
  /** Earliest date (inclusive) for delivered_at / created_at — YYYY-MM-DD */
  dateFrom?: string | null;
  /** Latest date (inclusive) for delivered_at / created_at — YYYY-MM-DD */
  dateTo?: string | null;
}

/**
 * Fetches deliveries from the database with optional filters, returning
 * denormalized rows that match the DeliveryItem DTO shape from doc A8.
 *
 * Join chain:
 *   deliveries d
 *     → orders o          (d.order_id = o.order_id)
 *     → customers c       (o.customer_id = c.customer_id)
 *     → truck_schedules ts (d.truck_schedule_id = ts.schedule_id)
 *     → trucks t          (ts.truck_id = t.truck_id)
 *     → drivers dr        (ts.driver_id = dr.driver_id)
 *     → employees de      (dr.employee_id = de.employee_id)  ← driver's full_name
 *
 * @param filters - Optional filter criteria (status, dateFrom, dateTo)
 * @returns Array of DeliveryItem DTOs ordered by most recent first
 */
export async function fetchDeliveriesFromDB(
  filters: DeliveryFilters
): Promise<DeliveryItem[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // ── Status filter ──────────────────────────────────────────────────────
  if (filters.status) {
    conditions.push('d.status = ?');
    params.push(filters.status);
  }

  // ── Date-range filter on created_at (when the delivery was created) ───
  // Using d.created_at for range because delivered_at is null for pending ones
  if (filters.dateFrom) {
    conditions.push('d.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    conditions.push('d.created_at <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const rows = await query<DeliveryJoinRow[]>(
    `SELECT
       d.delivery_id,
       d.order_id,
       c.customer_name,
       t.plate_number       AS truck_plate,
       de.full_name         AS driver_name,
       d.status,
       d.delivered_at,
       d.notes
     FROM deliveries d
     JOIN orders          o   ON o.order_id      = d.order_id
     JOIN customers       c   ON c.customer_id   = o.customer_id
     JOIN truck_schedules ts  ON ts.schedule_id   = d.truck_schedule_id
     JOIN trucks          t   ON t.truck_id       = ts.truck_id
     JOIN drivers         dr  ON dr.driver_id     = ts.driver_id
     JOIN employees       de  ON de.employee_id   = dr.employee_id
     ${whereClause}
     ORDER BY d.created_at DESC`,
    params
  );

  // Map raw DB rows to the canonical DeliveryItem DTO shape
  return rows.map((row) => ({
    delivery_id:  Number(row.delivery_id),
    order_id:     Number(row.order_id),
    customer_name: row.customer_name,
    truck_plate:   row.truck_plate,
    driver_name:   row.driver_name,
    status:        row.status,
    delivered_at:  formatDatetime(row.delivered_at),
    notes:         row.notes ?? undefined,
  }));
}
