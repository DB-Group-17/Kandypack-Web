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

/**
 * Maximum number of data rows allowed in a single CSV export response.
 * Enforced by the CSV route to prevent runaway memory usage.
 * Authority: Docs/03_architecture.md §11, §13 (reporting rules).
 */
export const CSV_ROW_CAP = 5000;

/**
 * Shared filter validation result returned by validateReportFilters().
 */
export interface FilterValidationResult {
  valid: boolean;
  /** Human-readable error message when valid === false. */
  error?: string;
  /** The HTTP status code to return when valid === false (typically 400). */
  status?: number;
}

/**
 * Validates query-string filter parameters for a given report type.
 * Reused by both the JSON endpoints and the CSV export route to ensure
 * consistent error responses (reviewer issue #5).
 *
 * @param type - The report slug (e.g. "quarterly-sales").
 * @param params - URLSearchParams from the incoming request.
 * @returns { valid, error?, status? }
 */
export function validateReportFilters(
  type: string,
  params: URLSearchParams
): FilterValidationResult {
  const yearRaw = params.get('year');
  const quarterRaw = params.get('quarter');
  const monthRaw = params.get('month');
  const customerIdRaw = params.get('customer_id');
  const weekStartRaw = params.get('week_start');

  /** Simple ISO date check (YYYY-MM-DD) */
  const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  /** Positive integer check */
  const isPosInt = (s: string) => /^\d+$/.test(s) && Number(s) > 0;
  /** Year within a reasonable range */
  const isValidYear = (s: string) => isPosInt(s) && Number(s) >= 2000 && Number(s) <= 2100;
  /** Quarter 1–4 */
  const isValidQuarter = (s: string) => ['1', '2', '3', '4'].includes(s);
  /** Month 1–12 */
  const isValidMonth = (s: string) => isPosInt(s) && Number(s) >= 1 && Number(s) <= 12;

  switch (type) {
    case 'quarterly-sales':
      if (yearRaw && !isValidYear(yearRaw))
        return { valid: false, error: "'year' must be a 4-digit year (e.g. 2026).", status: 400 };
      if (quarterRaw && !isValidQuarter(quarterRaw))
        return { valid: false, error: "'quarter' must be 1, 2, 3, or 4.", status: 400 };
      break;

    case 'most-ordered-items':
      if (!yearRaw || !quarterRaw)
        return { valid: false, error: "Both 'year' and 'quarter' are required for this report.", status: 400 };
      if (!isValidYear(yearRaw))
        return { valid: false, error: "'year' must be a 4-digit year (e.g. 2026).", status: 400 };
      if (!isValidQuarter(quarterRaw))
        return { valid: false, error: "'quarter' must be 1, 2, 3, or 4.", status: 400 };
      break;

    case 'city-route-sales': {
      const dateFrom = params.get('date_from');
      const dateTo = params.get('date_to');
      if (dateFrom && !isValidDate(dateFrom))
        return { valid: false, error: "'date_from' must be YYYY-MM-DD.", status: 400 };
      if (dateTo && !isValidDate(dateTo))
        return { valid: false, error: "'date_to' must be YYYY-MM-DD.", status: 400 };
      break;
    }

    case 'driver-assistant-hours':
      if (!weekStartRaw)
        return { valid: false, error: "'week_start' (YYYY-MM-DD) is required for this report.", status: 400 };
      if (!isValidDate(weekStartRaw))
        return { valid: false, error: "'week_start' must be YYYY-MM-DD.", status: 400 };
      break;

    case 'truck-usage':
      if (yearRaw && !isValidYear(yearRaw))
        return { valid: false, error: "'year' must be a 4-digit year.", status: 400 };
      if (monthRaw && !isValidMonth(monthRaw))
        return { valid: false, error: "'month' must be between 1 and 12.", status: 400 };
      break;

    case 'customer-history':
      if (!customerIdRaw)
        return { valid: false, error: "'customer_id' is required for this report.", status: 400 };
      if (!isPosInt(customerIdRaw))
        return { valid: false, error: "'customer_id' must be a positive integer.", status: 400 };
      break;
  }

  return { valid: true };
}


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

/**
 * Escapes and quotes a single CSV field value according to RFC 4180 rules.
 * 
 * @param value - Cell value to format
 * @returns Escaped CSV field string
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a valid RFC 4180 CSV string from headers and data rows.
 * 
 * @param headers - Column title headers
 * @param rows - 2D matrix of cell values
 * @returns Serialized CSV string with CRLF line endings
 */
export function generateCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((r) => r.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n') + '\r\n';
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

/* =========================================================================
   DATA ACCESS FUNCTIONS (REPORTS 4, 5, 6)
   ========================================================================= */

/**
 * Filters for Driver and Assistant Working Hours report.
 */
export interface DriverAssistantHoursFilters {
  week_start?: string;
  role?: 'driver' | 'assistant';
}

/**
 * Fetches weekly working hours for drivers and assistants against statutory limits.
 * 
 * @param filters - Optional week_start (YYYY-MM-DD) and role filters
 * @returns Array of driver and assistant working hour records
 */
export async function fetchDriverAssistantHours(
  filters: DriverAssistantHoursFilters = {}
): Promise<DriverAssistantHoursRow[]> {
  const { week_start, role } = filters;
  const conditions: string[] = [];
  const params: QueryParam[] = [];

  if (week_start) {
    // Snap the input date to that week's Monday using WEEKDAY().
    // v_driver_assistant_hours always stores week_start as a Monday.
    // Without snapping, any non-Monday input returns 0 rows (reviewer issue #3).
    // WEEKDAY(?) returns 0 for Monday … 6 for Sunday, so subtracting it gives the Monday.
    conditions.push('DATE(week_start) = DATE(? - INTERVAL WEEKDAY(?) DAY)');
    params.push(week_start, week_start);
  }

  if (role) {
    conditions.push('person_role = ?');
    params.push(role);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      person_role,
      CAST(person_id AS SIGNED) AS person_id,
      full_name,
      DATE_FORMAT(week_start, '%Y-%m-%d') AS week_start,
      CAST(total_hours AS DOUBLE) AS total_hours,
      CAST(weekly_limit_hours AS DOUBLE) AS weekly_limit_hours,
      CAST(remaining_hours AS DOUBLE) AS remaining_hours
    FROM v_driver_assistant_hours
    ${whereClause}
    ORDER BY person_role ASC, full_name ASC
  `;

  const rows = await query<DriverAssistantHoursRow[]>(sql, params);
  return rows.map((r) => ({
    person_role: r.person_role,
    person_id: Number(r.person_id),
    full_name: String(r.full_name),
    week_start: String(r.week_start),
    total_hours: Number(r.total_hours || 0),
    weekly_limit_hours: Number(r.weekly_limit_hours || 0),
    remaining_hours: Number(r.remaining_hours || 0),
  }));
}

/**
 * Fetches driver and assistant hours with Redis cache layer.
 * 
 * @param filters - Week start and role filters
 * @returns Cached or freshly queried driver and assistant hours rows
 */
export async function getCachedDriverAssistantHours(
  filters: DriverAssistantHoursFilters = {}
): Promise<DriverAssistantHoursRow[]> {
  const hash = generateFilterHash(filters as Record<string, unknown>);
  const cacheKey = REDIS_KEYS.CACHE_REPORT('driver-assistant-hours', hash);

  return getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
    return fetchDriverAssistantHours(filters);
  });
}

/**
 * Filters for Monthly Truck Usage report.
 */
export interface TruckUsageFilters {
  year?: number;
  month?: number;
}

/**
 * Fetches monthly vehicle utilization statistics from v_truck_usage_monthly.
 * 
 * @param filters - Optional calendar year and month filters
 * @returns Array of truck usage records
 */
export async function fetchTruckUsageMonthly(
  filters: TruckUsageFilters = {}
): Promise<TruckUsageMonthlyRow[]> {
  const { year, month } = filters;
  const conditions: string[] = [];
  const params: QueryParam[] = [];

  if (year !== undefined && !Number.isNaN(year)) {
    conditions.push('YEAR(usage_month) = ?');
    params.push(year);
  }

  if (month !== undefined && !Number.isNaN(month)) {
    conditions.push('MONTH(usage_month) = ?');
    params.push(month);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT 
      CAST(truck_id AS SIGNED) AS truck_id,
      plate_number,
      DATE_FORMAT(usage_month, '%Y-%m-%d') AS usage_month,
      CAST(num_schedules AS SIGNED) AS num_schedules,
      CAST(total_hours AS DOUBLE) AS total_hours,
      CAST(distinct_routes_covered AS SIGNED) AS distinct_routes_covered
    FROM v_truck_usage_monthly
    ${whereClause}
    ORDER BY usage_month DESC, plate_number ASC
  `;

  const rows = await query<TruckUsageMonthlyRow[]>(sql, params);
  return rows.map((r) => ({
    truck_id: Number(r.truck_id),
    plate_number: String(r.plate_number),
    usage_month: String(r.usage_month),
    num_schedules: Number(r.num_schedules),
    total_hours: Number(r.total_hours || 0),
    distinct_routes_covered: Number(r.distinct_routes_covered),
  }));
}

/**
 * Fetches monthly truck usage with Redis cache layer.
 * 
 * @param filters - Year and month filters
 * @returns Cached or freshly queried truck usage rows
 */
export async function getCachedTruckUsageMonthly(
  filters: TruckUsageFilters = {}
): Promise<TruckUsageMonthlyRow[]> {
  const hash = generateFilterHash(filters as Record<string, unknown>);
  const cacheKey = REDIS_KEYS.CACHE_REPORT('truck-usage', hash);

  return getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
    return fetchTruckUsageMonthly(filters);
  });
}

/**
 * Filters for Customer Order History report.
 */
export interface CustomerOrderHistoryFilters {
  status?: string;
  date_from?: string;
  date_to?: string;
}

/**
 * Fetches order progression, logistics path, and delivery status for a specific customer.
 * 
 * @param customerId - Customer identifier (mandatory)
 * @param filters - Optional status and date range filters
 * @returns Array of customer order history records
 */
export async function fetchCustomerOrderHistory(
  customerId: number,
  filters: CustomerOrderHistoryFilters = {}
): Promise<CustomerOrderHistoryRow[]> {
  const { status, date_from, date_to } = filters;
  const conditions: string[] = ['customer_id = ?'];
  const params: QueryParam[] = [customerId];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (date_from) {
    conditions.push('DATE(order_placed_at) >= ?');
    params.push(date_from);
  }

  if (date_to) {
    conditions.push('DATE(order_placed_at) <= ?');
    params.push(date_to);
  }

  const sql = `
    SELECT 
      CAST(order_id AS SIGNED) AS order_id,
      CAST(customer_id AS SIGNED) AS customer_id,
      customer_name,
      -- Format DATETIME columns as ISO 8601 strings so mysql2 returns plain strings,
      -- not JS Date objects whose String() conversion is locale-dependent (Docs/05_api-and-pages.md §A9).
      DATE_FORMAT(order_placed_at, '%Y-%m-%dT%H:%i:%s.000Z') AS order_placed_at,
      -- expected_delivery_date is a DATE column; format as YYYY-MM-DD only.
      DATE_FORMAT(expected_delivery_date, '%Y-%m-%d') AS expected_delivery_date,
      status,
      delivery_address,
      delivery_area,
      destination_city,
      route_name,
      CAST(total_value AS DOUBLE) AS total_value,
      CAST(total_space_required AS DOUBLE) AS total_space_required,
      CAST(delivery_id AS SIGNED) AS delivery_id,
      delivery_status,
      -- delivered_at is nullable DATETIME; NULL passes through as null in mysql2.
      DATE_FORMAT(delivered_at, '%Y-%m-%dT%H:%i:%s.000Z') AS delivered_at,
      driver_name,
      assistant_name,
      truck_plate
    FROM v_customer_order_history
    WHERE ${conditions.join(' AND ')}
    ORDER BY order_placed_at DESC
  `;

  const rows = await query<CustomerOrderHistoryRow[]>(sql, params);
  return rows.map((r) => ({
    order_id: Number(r.order_id),
    customer_id: Number(r.customer_id),
    customer_name: String(r.customer_name),
    order_placed_at: String(r.order_placed_at),
    expected_delivery_date: String(r.expected_delivery_date),
    status: String(r.status),
    delivery_address: String(r.delivery_address),
    delivery_area: String(r.delivery_area),
    destination_city: String(r.destination_city),
    route_name: r.route_name !== null ? String(r.route_name) : null,
    total_value: Number(r.total_value || 0),
    total_space_required: Number(r.total_space_required || 0),
    delivery_id: r.delivery_id !== null ? Number(r.delivery_id) : null,
    delivery_status: r.delivery_status !== null ? String(r.delivery_status) : null,
    delivered_at: r.delivered_at !== null ? String(r.delivered_at) : null,
    driver_name: r.driver_name !== null ? String(r.driver_name) : null,
    assistant_name: r.assistant_name !== null ? String(r.assistant_name) : null,
    truck_plate: r.truck_plate !== null ? String(r.truck_plate) : null,
  }));
}

/**
 * Fetches customer order history with Redis cache layer.
 * 
 * @param customerId - Customer identifier (mandatory)
 * @param filters - Optional status and date range filters
 * @returns Cached or freshly queried customer order history rows
 */
export async function getCachedCustomerOrderHistory(
  customerId: number,
  filters: CustomerOrderHistoryFilters = {}
): Promise<CustomerOrderHistoryRow[]> {
  const hash = generateFilterHash({ customerId, ...filters });
  const cacheKey = REDIS_KEYS.CACHE_REPORT('customer-history', hash);

  return getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
    return fetchCustomerOrderHistory(customerId, filters);
  });
}

