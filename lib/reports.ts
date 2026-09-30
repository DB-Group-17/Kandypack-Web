/**
 * @file lib/reports.ts
 * @description Central query helpers, TypeScript interfaces, and caching utilities for Kandypack Management Reports.
 * 
 * Implements data layer abstractions for all 6 reports defined in:
 * - SRS §4.6.3 (REQ-FR-050 through REQ-FR-055)
 * - Docs/03_architecture.md §7 (API Routes), §10 (Redis Caching), §11 (Synchronous Exports)
 * - Docs/04_database-schema-v4.md §7 (Reporting Views 1 through 6)
 * - Docs/05_api-and-pages.md §A9 (Reports)
 * 
 * Reports:
 * 1. Quarterly sales (v_quarterly_sales)
 * 2. Most ordered items per quarter (v_most_ordered_items)
 * 3. City-wise and route-wise sales (v_city_route_sales)
 * 4. Driver and assistant working hours (v_driver_assistant_hours)
 * 5. Truck usage per month (v_truck_usage_monthly)
 * 6. Customer order history with delivery details (v_customer_order_history)
 * 
 * Owner: Member 2 (Linari)
 */

import { query, QueryParam } from '@/lib/db';
import { getOrSetCache, REDIS_KEYS } from '@/lib/redis';

/** Cache time-to-live for heavy aggregate reporting queries (1 hour = 3600 seconds) */
export const REPORT_CACHE_TTL_SECONDS = 3600;

/* =========================================================================
   TYPE DEFINITIONS FOR REPORTING DATA
   ========================================================================= */

/**
 * Report 1: Quarterly Sales Row.
 * Represents aggregate sales volume and revenue for delivered orders within a calendar quarter.
 */
export interface QuarterlySalesRow {
  sales_year: number;
  sales_quarter: number;
  num_orders: number;
  total_volume: number;
  total_value: number;
}

/**
 * Report 2: Most Ordered Items Row.
 * Represents product rankings by quantity sold for delivered orders in a given quarter.
 */
export interface MostOrderedItemRow {
  sales_year: number;
  sales_quarter: number;
  product_id: number;
  product_name: string;
  total_quantity: number;
  total_value: number;
  quantity_rank: number;
}

/**
 * Report 3: City and Route Sales Breakdown Row.
 * Represents sales distribution across destination cities and specific last-mile delivery routes.
 */
export interface CityRouteSalesRow {
  city_id: number;
  city_name: string;
  route_id: number | null;
  route_name: string | null;
  num_orders: number;
  total_volume: number;
  total_value: number;
}

/**
 * Report 4: Driver and Assistant Working Hours Row.
 * Tracks weekly shift hours against 40-hour (driver) and 60-hour (assistant) statutory limits.
 */
export interface DriverAssistantHoursRow {
  person_role: 'driver' | 'assistant';
  person_id: number;
  full_name: string;
  week_start: string;
  total_hours: number;
  weekly_limit_hours: number;
  remaining_hours: number;
}

/**
 * Report 5: Truck Usage Monthly Row.
 * Summarizes vehicle utilization, trip counts, active operational hours, and routes served.
 */
export interface TruckUsageMonthlyRow {
  truck_id: number;
  plate_number: string;
  usage_month: string;
  num_schedules: number;
  total_hours: number;
  distinct_routes_covered: number;
}

/**
 * Report 6: Customer Order History Row.
 * Full audit and delivery trail for orders placed by a specific commercial customer.
 */
export interface CustomerOrderHistoryRow {
  order_id: number;
  customer_id: number;
  customer_name: string;
  order_placed_at: string;
  expected_delivery_date: string;
  status: string;
  delivery_address: string;
  delivery_area: string;
  destination_city: string;
  route_name: string | null;
  total_value: number;
  total_space_required: number;
  delivery_id: number | null;
  delivery_status: string | null;
  delivered_at: string | null;
  driver_name: string | null;
  assistant_name: string | null;
  truck_plate: string | null;
}

/**
 * Standard envelope response for report API endpoints.
 */
export interface ReportResponse<T> {
  items: T[];
  generated_at: string;
}

/* =========================================================================
   UTILITY HELPERS
   ========================================================================= */

/**
 * Generates a normalized deterministic hash string from filter query parameters.
 * Used for building collision-resistant Redis cache keys.
 * 
 * @param params - Object containing query filter key-value pairs
 * @returns Deterministic serialized filter representation
 */
export function generateFilterHash(params: Record<string, unknown>): string {
  const sortedKeys = Object.keys(params).sort();
  const pairs = sortedKeys
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${k}=${String(params[k])}`);
  return pairs.length > 0 ? pairs.join('&') : 'all';
}

/* =========================================================================
   DATA ACCESS FUNCTIONS (REPORTS 1, 2, 3)
   ========================================================================= */

/**
 * Fetches quarterly sales summary data from v_quarterly_sales.
 * Optionally filters by year and quarter.
 * 
 * @param year - Optional 4-digit calendar year (e.g. 2026)
 * @param quarter - Optional quarter number (1-4)
 * @returns Array of quarterly sales aggregate records
 */
export async function fetchQuarterlySales(
  year?: number,
  quarter?: number
): Promise<QuarterlySalesRow[]> {
  const conditions: string[] = [];
  const params: QueryParam[] = [];

  if (year !== undefined && !Number.isNaN(year)) {
    conditions.push('sales_year = ?');
    params.push(year);
  }

  if (quarter !== undefined && !Number.isNaN(quarter)) {
    conditions.push('sales_quarter = ?');
    params.push(quarter);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      CAST(sales_year AS SIGNED) AS sales_year,
      CAST(sales_quarter AS SIGNED) AS sales_quarter,
      CAST(num_orders AS SIGNED) AS num_orders,
      CAST(total_volume AS DOUBLE) AS total_volume,
      CAST(total_value AS DOUBLE) AS total_value
    FROM v_quarterly_sales
    ${whereClause}
    ORDER BY sales_year DESC, sales_quarter DESC
  `;

  const rows = await query<QuarterlySalesRow[]>(sql, params);
  return rows.map((r) => ({
    sales_year: Number(r.sales_year),
    sales_quarter: Number(r.sales_quarter),
    num_orders: Number(r.num_orders),
    total_volume: Number(r.total_volume || 0),
    total_value: Number(r.total_value || 0),
  }));
}

/**
 * Fetches quarterly sales with Redis cache layer.
 * 
 * @param year - Optional calendar year
 * @param quarter - Optional quarter
 * @returns Cached or freshly queried quarterly sales rows
 */
export async function getCachedQuarterlySales(
  year?: number,
  quarter?: number
): Promise<QuarterlySalesRow[]> {
  const hash = generateFilterHash({ year, quarter });
  const cacheKey = REDIS_KEYS.CACHE_REPORT('quarterly-sales', hash);

  return getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
    return fetchQuarterlySales(year, quarter);
  });
}

/**
 * Fetches ranked top-selling products for a specified year and quarter from v_most_ordered_items.
 * 
 * @param year - 4-digit calendar year (required)
 * @param quarter - Quarter number 1-4 (required)
 * @returns Array of ranked product sales records
 */
export async function fetchMostOrderedItems(
  year: number,
  quarter: number
): Promise<MostOrderedItemRow[]> {
  const sql = `
    SELECT 
      CAST(sales_year AS SIGNED) AS sales_year,
      CAST(sales_quarter AS SIGNED) AS sales_quarter,
      CAST(product_id AS SIGNED) AS product_id,
      product_name,
      CAST(total_quantity AS DOUBLE) AS total_quantity,
      CAST(total_value AS DOUBLE) AS total_value,
      CAST(quantity_rank AS SIGNED) AS quantity_rank
    FROM v_most_ordered_items
    WHERE sales_year = ? AND sales_quarter = ?
    ORDER BY quantity_rank ASC, total_quantity DESC
  `;

  const rows = await query<MostOrderedItemRow[]>(sql, [year, quarter]);
  return rows.map((r) => ({
    sales_year: Number(r.sales_year),
    sales_quarter: Number(r.sales_quarter),
    product_id: Number(r.product_id),
    product_name: String(r.product_name),
    total_quantity: Number(r.total_quantity || 0),
    total_value: Number(r.total_value || 0),
    quantity_rank: Number(r.quantity_rank),
  }));
}

/**
 * Fetches ranked products with Redis cache layer.
 * 
 * @param year - Calendar year
 * @param quarter - Quarter number 1-4
 * @returns Cached or freshly queried most ordered items
 */
export async function getCachedMostOrderedItems(
  year: number,
  quarter: number
): Promise<MostOrderedItemRow[]> {
  const hash = generateFilterHash({ year, quarter });
  const cacheKey = REDIS_KEYS.CACHE_REPORT('most-ordered-items', hash);

  return getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
    return fetchMostOrderedItems(year, quarter);
  });
}

/**
 * Filters for City and Route Sales report.
 */
export interface CityRouteSalesFilters {
  date_from?: string;
  date_to?: string;
  city_id?: number;
}

/**
 * Fetches geographic sales breakdown across cities and delivery routes.
 * When date range filters are supplied, queries underlying orders directly to support accurate
 * time-bounded filtering while matching the v_city_route_sales calculation logic.
 * 
 * @param filters - Optional date range and city_id filters
 * @returns Array of geographic sales breakdown records
 */
export async function fetchCityRouteSales(
  filters: CityRouteSalesFilters = {}
): Promise<CityRouteSalesRow[]> {
  const { date_from, date_to, city_id } = filters;

  // If date bounds are provided, query base tables to filter by order placement date
  if (date_from || date_to) {
    const conditions: string[] = ["o.status = 'Delivered'"];
    const params: QueryParam[] = [];

    if (date_from) {
      conditions.push('DATE(o.order_placed_at) >= ?');
      params.push(date_from);
    }

    if (date_to) {
      conditions.push('DATE(o.order_placed_at) <= ?');
      params.push(date_to);
    }

    if (city_id !== undefined && !Number.isNaN(city_id)) {
      conditions.push('c.city_id = ?');
      params.push(city_id);
    }

    const sql = `
      SELECT 
        CAST(c.city_id AS SIGNED) AS city_id,
        c.city_name,
        CAST(r.route_id AS SIGNED) AS route_id,
        r.route_name,
        CAST(COUNT(DISTINCT o.order_id) AS SIGNED) AS num_orders,
        CAST(COALESCE(SUM(oi.quantity), 0) AS DOUBLE) AS total_volume,
        CAST(COALESCE(SUM(oi.line_value), 0) AS DOUBLE) AS total_value
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN cities c ON c.city_id = o.destination_city_id
      LEFT JOIN routes r ON r.route_id = o.route_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.city_id, c.city_name, r.route_id, r.route_name
      ORDER BY c.city_name ASC, r.route_name ASC
    `;

    const rows = await query<CityRouteSalesRow[]>(sql, params);
    return rows.map((r) => ({
      city_id: Number(r.city_id),
      city_name: String(r.city_name),
      route_id: r.route_id !== null ? Number(r.route_id) : null,
      route_name: r.route_name !== null ? String(r.route_name) : null,
      num_orders: Number(r.num_orders),
      total_volume: Number(r.total_volume || 0),
      total_value: Number(r.total_value || 0),
    }));
  }

  // When no date filter is applied, read directly from view v_city_route_sales
  const conditions: string[] = [];
  const params: QueryParam[] = [];

  if (city_id !== undefined && !Number.isNaN(city_id)) {
    conditions.push('city_id = ?');
    params.push(city_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      CAST(city_id AS SIGNED) AS city_id,
      city_name,
      CAST(route_id AS SIGNED) AS route_id,
      route_name,
      CAST(num_orders AS SIGNED) AS num_orders,
      CAST(total_volume AS DOUBLE) AS total_volume,
      CAST(total_value AS DOUBLE) AS total_value
    FROM v_city_route_sales
    ${whereClause}
    ORDER BY city_name ASC, route_name ASC
  `;

  const rows = await query<CityRouteSalesRow[]>(sql, params);
  return rows.map((r) => ({
    city_id: Number(r.city_id),
    city_name: String(r.city_name),
    route_id: r.route_id !== null ? Number(r.route_id) : null,
    route_name: r.route_name !== null ? String(r.route_name) : null,
    num_orders: Number(r.num_orders),
    total_volume: Number(r.total_volume || 0),
    total_value: Number(r.total_value || 0),
  }));
}

/**
 * Fetches city and route sales breakdown with Redis cache layer.
 * 
 * @param filters - Date range and city filters
 * @returns Cached or freshly queried city and route sales rows
 */
export async function getCachedCityRouteSales(
  filters: CityRouteSalesFilters = {}
): Promise<CityRouteSalesRow[]> {
  const hash = generateFilterHash(filters as Record<string, unknown>);
  const cacheKey = REDIS_KEYS.CACHE_REPORT('city-route-sales', hash);

  return getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
    return fetchCityRouteSales(filters);
  });
}
