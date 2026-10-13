/**
 * @file app/api/dashboard/summary/route.ts
 * @description API route handler for the dashboard summary cards.
 *
 * Endpoints:
 * - GET /api/dashboard/summary: Returns the four dashboard aggregates (pending orders,
 *   today's train departures, active truck schedules, low-stock alerts), cached in Redis.
 *
 * Data flow:
 *   1. Verify the session (401 if missing).
 *   2. Check RBAC: every authenticated role may read the dashboard.
 *   3. Resolve the store scope. Only `store_manager` is scoped; they see their own store's
 *      inventory, their store's routes' truck schedules, and orders/trips for their store's city.
 *   4. Read the cache-aside entry `REDIS_KEYS.CACHE_DASHBOARD_SUMMARY(role, store_id|'global')`
 *      (30 s TTL); on a miss, run four lightweight aggregate queries in parallel and cache them.
 *
 * Authority: Docs/03_architecture.md §10, Docs/05_api-and-pages.md §A2, Docs/07_content-copy.md `/dashboard`.
 * Owner: Member 5 (Desandu)
 */

import { NextResponse } from 'next/server';
import { query, type QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getStoreScope, ROUTE_PERMISSIONS, ForbiddenError } from '@/lib/rbac';
import { getOrSetCache, REDIS_KEYS } from '@/lib/redis';
import { LOW_STOCK_THRESHOLD } from '@/lib/business-rules';

/** Cache lifetime for the summary; the spec allows 30-60 seconds. */
const DASHBOARD_CACHE_TTL_SECONDS = 30;

/** Upper bound on listed low-stock rows so the payload and the cache entry stay small. */
const LOW_STOCK_ROW_LIMIT = 100;

/** Shape of the JSON body returned by this endpoint (Docs/05 §A2). */
export interface DashboardSummary {
  pending_orders: number;
  todays_departures: Array<{
    trip_id: number;
    destination_city: string;
    departure_datetime: string;
  }>;
  active_truck_schedules: number;
  low_stock_alerts: Array<{
    store_id: number;
    store_name: string;
    product_name: string;
    quantity_on_hand: number;
  }>;
}

interface CountRow {
  total: number | string;
}

interface DepartureRow {
  trip_id: number | string;
  destination_city: string;
  departure_datetime: Date | string;
}

interface LowStockRow {
  store_id: number | string;
  store_name: string;
  product_name: string;
  quantity_on_hand: number | string;
}

/**
 * Converts a MySQL DATETIME value (Date because the pool uses timezone 'Z', or string) to ISO 8601.
 *
 * @param value - The raw DATETIME value from mysql2
 * @returns ISO 8601 timestamp string
 */
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Runs the four aggregate queries and assembles the response body.
 * The queries are independent, so they run concurrently. `storeId` is null for global roles.
 *
 * @param storeId - The store to scope to (store_manager), or null for system-wide data
 * @returns The complete dashboard summary payload (JSON-serialisable so it can be cached)
 */
async function buildDashboardSummary(storeId: number | null): Promise<DashboardSummary> {
  const scoped = storeId !== null;
  const storeParam: QueryParam[] = scoped ? [storeId] : [];

  // Pending orders: a store is reached through its city, because orders carry destination_city_id
  const pendingSql = scoped
    ? `SELECT COUNT(*) AS total
         FROM orders o
         JOIN stores s ON s.city_id = o.destination_city_id
        WHERE o.status = 'Pending' AND s.store_id = ?`
    : `SELECT COUNT(*) AS total FROM orders WHERE status = 'Pending'`;

  // Today's departures: cancelled trips are not departing, so they are excluded
  const departuresSql = `
    SELECT t.trip_id, c.city_name AS destination_city, t.departure_datetime
      FROM train_trips t
      JOIN cities c ON c.city_id = t.destination_city_id
     ${scoped ? 'JOIN stores s ON s.city_id = t.destination_city_id' : ''}
     WHERE DATE(t.departure_datetime) = CURDATE()
       AND t.status <> 'Cancelled'
       ${scoped ? 'AND s.store_id = ?' : ''}
     ORDER BY t.departure_datetime ASC`;

  // Active truck schedules: a store owns schedules through the routes it serves
  const activeSchedulesSql = scoped
    ? `SELECT COUNT(*) AS total
         FROM truck_schedules ts
         JOIN routes r ON r.route_id = ts.route_id
        WHERE ts.status IN ('Scheduled', 'In Progress') AND r.store_id = ?`
    : `SELECT COUNT(*) AS total FROM truck_schedules WHERE status IN ('Scheduled', 'In Progress')`;

  // Low stock: lowest quantity first so the most urgent rows lead the dashboard list
  const lowStockSql = `
    SELECT si.store_id, s.store_name, p.product_name, si.quantity_on_hand
      FROM store_inventory si
      JOIN stores s ON s.store_id = si.store_id
      JOIN products p ON p.product_id = si.product_id
     WHERE si.quantity_on_hand < ?
       AND s.is_deleted = 0
       AND p.is_deleted = 0
       ${scoped ? 'AND si.store_id = ?' : ''}
     ORDER BY si.quantity_on_hand ASC, s.store_name ASC, p.product_name ASC
     LIMIT ${LOW_STOCK_ROW_LIMIT}`;

  const [pendingRows, departureRows, scheduleRows, lowStockRows] = await Promise.all([
    query<CountRow[]>(pendingSql, storeParam),
    query<DepartureRow[]>(departuresSql, storeParam),
    query<CountRow[]>(activeSchedulesSql, storeParam),
    query<LowStockRow[]>(lowStockSql, [LOW_STOCK_THRESHOLD, ...storeParam]),
  ]);

  return {
    pending_orders: Number(pendingRows[0]?.total ?? 0),
    todays_departures: departureRows.map((row) => ({
      trip_id: Number(row.trip_id),
      destination_city: row.destination_city,
      departure_datetime: toIsoString(row.departure_datetime),
    })),
    active_truck_schedules: Number(scheduleRows[0]?.total ?? 0),
    low_stock_alerts: lowStockRows.map((row) => ({
      store_id: Number(row.store_id),
      store_name: row.store_name,
      product_name: row.product_name,
      quantity_on_hand: Number(row.quantity_on_hand),
    })),
  };
}

/**
 * Handles GET requests to /api/dashboard/summary.
 *
 * @returns 200 with the DashboardSummary body, 401 when unauthenticated, 403 when the role is
 *          not allowed (or a store manager has no assigned store), 500 on unexpected failure
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required. Please log in.' } },
        { status: 401 }
      );
    }

    // RBAC: the dashboard page is open to every staff role (single source: ROUTE_PERMISSIONS)
    if (!ROUTE_PERMISSIONS['/dashboard'].includes(session.role)) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view the dashboard.`,
          },
        },
        { status: 403 }
      );
    }

    // Only store managers are scoped; getStoreScope throws if one has no assigned store
    const { store_id: scopedStoreId } = getStoreScope(session);

    const summary = await getOrSetCache<DashboardSummary>(
      REDIS_KEYS.CACHE_DASHBOARD_SUMMARY(session.role, scopedStoreId ?? 'global'),
      DASHBOARD_CACHE_TTL_SECONDS,
      () => buildDashboardSummary(scopedStoreId)
    );

    return NextResponse.json(summary, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }

    console.error('Error fetching dashboard summary:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: "Couldn't load dashboard data. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
