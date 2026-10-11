/**
 * @file app/api/truck-schedules/eligible-orders/route.ts
 * @description GET /api/truck-schedules/eligible-orders — lists the orders a fleet supervisor may
 *              attach to a new truck schedule for a given route.
 *
 * Why this exists (smoke-test gap G1, Docs/14_smoke-test-guide.md §3): the schedule-creation page
 * needs to know which orders can ride on a run. An order is ELIGIBLE when ALL of these hold:
 *   - its status is `At Store` (the goods have been received at the store),
 *   - its delivery route (`orders.route_id`) is the route being scheduled, and
 *   - it has no active delivery (`Scheduled` or `In Progress`) already.
 * `POST /api/truck-schedules` re-checks the same rules inside its transaction, so this list is a
 * convenience for the form, never the source of truth.
 *
 * Auth: fleet_supervisor and system_administrator (the roles that may create truck schedules).
 * Query params: `route_id` (required, positive integer).
 * Response 200: { items: EligibleOrderItem[], total: number }
 *
 * Authority: Docs/05_api-and-pages.md §A7, Docs/13_system-operation-guide.md §7.
 * Owner: Member 1 (Dineth) for this endpoint; the surrounding module belongs to Member 3.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import type { EligibleOrderItem } from '@/types/fleet';

/** Row shape returned by the eligibility query. */
interface EligibleOrderRow extends RowDataPacket {
  order_id: number | string;
  customer_name: string;
  delivery_area: string;
  delivery_address: string;
  expected_delivery_date: Date | string;
  total_space_required: number | string;
}

/** Upper bound on rows returned, so the form list can never grow without limit. */
const MAX_ROWS = 200;

/**
 * Converts a MySQL DATE value to a `YYYY-MM-DD` string. The pool reads DATE columns as UTC
 * (`timezone: 'Z'` in lib/db.ts), so the UTC calendar date is the stored date.
 *
 * @param value - Date object or date string from the driver
 * @returns The calendar date as `YYYY-MM-DD`
 */
function toDateString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Handles GET /api/truck-schedules/eligible-orders?route_id=N.
 *
 * @param request - Incoming request carrying the `route_id` query parameter
 * @returns 200 `{ items, total }`; 400 for a missing or invalid `route_id`; 401/403 on auth
 *          failure; 500 on an unexpected error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Same roles that may create a schedule may see which orders can be attached to it.
    const session = await getSession();
    requirePermission(session, 'truck_schedules', 'create');

    // Validate the route filter
    const routeParam = new URL(request.url).searchParams.get('route_id');
    const routeId = Number(routeParam);
    if (!routeParam || !Number.isInteger(routeId) || routeId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'route_id is required and must be a positive integer.',
            field: 'route_id',
          },
        },
        { status: 400 }
      );
    }

    // At Store, on this route, and not already on an active delivery. NOT EXISTS mirrors the rule
    // enforced by trg_check_active_delivery_on_insert.
    const rows = await query<EligibleOrderRow[]>(
      `SELECT o.order_id, c.customer_name, o.delivery_area, o.delivery_address,
              o.expected_delivery_date, o.total_space_required
         FROM orders o
         JOIN customers c ON c.customer_id = o.customer_id
        WHERE o.status = 'At Store'
          AND o.route_id = ?
          AND NOT EXISTS (
                SELECT 1 FROM deliveries d
                 WHERE d.order_id = o.order_id
                   AND d.status IN ('Scheduled', 'In Progress')
              )
        ORDER BY o.expected_delivery_date ASC, o.order_id ASC
        LIMIT ${MAX_ROWS}`,
      [routeId]
    );

    const items: EligibleOrderItem[] = rows.map((row) => ({
      order_id: Number(row.order_id),
      customer_name: row.customer_name,
      delivery_area: row.delivery_area,
      delivery_address: row.delivery_address,
      expected_delivery_date: toDateString(row.expected_delivery_date),
      total_space_required: Number(row.total_space_required),
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    // requirePermission throws an Error carrying an HTTP status for 401/403.
    if (err instanceof Error && 'status' in err) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: (err as { status: number }).status }
      );
    }
    console.error('[GET /api/truck-schedules/eligible-orders]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
