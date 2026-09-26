/**
 * @file app/api/orders/route.ts
 * @description API route handler for Kandypack orders management.
 * 
 * Endpoints:
 * - POST /api/orders: Places a new customer order, validates route coverage, 
 *   calculates space, reserves train capacity, and handles multi-trip overflow.
 * 
 * Flow:
 * 1. Authenticate user session via getSession() and check RBAC permissions ('orders:place_order').
 * 2. Validate request payload (customer_id, delivery_address, delivery_area, destination_city_id, expected_delivery_date, items).
 * 3. Validate client-side 7-day advance lead time rule.
 * 4. Acquire an Upstash Redis distributed lock scoped to the destination corridor to prevent race conditions.
 * 5. Set session variables (@current_user_id, @current_app_role) via withUserContext.
 * 6. Inside one transaction, execute MySQL stored procedure `place_order(...)` with OUT param
 *    `@out_order_id`, then retrieve the created order row. Commit on success (still holding the
 *    lock); roll back on any failure so no half-placed order is ever left behind.
 * 7. Return 201 Created with order summary.
 * 8. Catch and surface SQLSTATE '45000' business violations cleanly as HTTP 400.
 * 9. Always release the Redis lock in a finally block.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §2 & §5, Docs/05_api-and-pages.md §A4
 * Owner: Member 1 (Dineth)
 */

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { withUserContext, query, queryOne, QueryParam } from '@/lib/db';
import { withLock, REDIS_KEYS } from '@/lib/redis';
import { applyRateLimit, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';

/**
 * Line item shape expected in the order creation payload.
 */
interface OrderItemPayload {
  product_id: number;
  quantity: number;
}

/**
 * Request body shape for POST /api/orders.
 */
interface CreateOrderRequest {
  customer_id: number;
  delivery_address: string;
  delivery_area: string;
  destination_city_id: number;
  expected_delivery_date: string;
  items: OrderItemPayload[];
}

/**
 * Created order row returned by the database after procedure execution.
 */
interface OrderSummaryRow extends RowDataPacket {
  order_id: number;
  customer_id: number;
  delivery_address: string;
  delivery_area: string;
  destination_city_id: number;
  route_id: number | null;
  order_placed_at: string | Date;
  expected_delivery_date: string | Date;
  status: string;
  total_value: string;
  total_space_required: string;
}

/**
 * Enriched order row returned by the GET /api/orders listing query.
 */
interface OrderListItemRow extends RowDataPacket {
  order_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  destination_city_id: number;
  destination_city: string;
  delivery_area: string;
  delivery_address: string;
  route_id: number | null;
  order_placed_at: string | Date;
  expected_delivery_date: string | Date;
  status: string;
  total_value: string;
  total_space_required: string;
}

/**
 * Count query result interface.
 */
interface CountResult extends RowDataPacket {
  total: number;
}

/**
 * Store city lookup result for store_manager role scoping.
 */
interface StoreCityRow extends RowDataPacket {
  city_id: number;
}

/**
 * Helper to validate a date string in YYYY-MM-DD format.
 */
function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = new Date(dateStr);
  return !isNaN(parsed.getTime());
}

/**
 * Computes calendar day difference between target date and today.
 */
function getDayDifferenceFromToday(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffMs = targetDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Handles POST requests to /api/orders.
 * Creates an order and reserves train trip capacity via stored procedure.
 * 
 * @param {Request} req - Incoming HTTP Request with JSON payload
 * @returns {Promise<NextResponse>} JSON response with created order or error details
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    // 1. Authenticate user session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.'
          }
        },
        { status: 401 }
      );
    }

    // 2. Rate-limit order creation: 20 per minute per authenticated user
    const rateLimited = await applyRateLimit(req, RATE_LIMIT_PROFILES.ORDER_CREATE, session.user_id);
    if (rateLimited) return rateLimited;

    // 3. Enforce RBAC permission for order creation
    const canPlaceOrder = hasPermission(session.role, 'orders', 'place_order');
    if (!canPlaceOrder) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to place customer orders.'
          }
        },
        { status: 403 }
      );
    }

    // 4. Parse and validate request JSON body
    let body: CreateOrderRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid JSON request body.'
          }
        },
        { status: 400 }
      );
    }

    const {
      customer_id,
      delivery_address,
      delivery_area,
      destination_city_id,
      expected_delivery_date,
      items
    } = body;

    // Field presence and type checks
    if (!customer_id || typeof customer_id !== 'number' || customer_id <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid positive customer_id is required.',
            field: 'customer_id'
          }
        },
        { status: 400 }
      );
    }

    if (!delivery_address || typeof delivery_address !== 'string' || !delivery_address.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Delivery address is required.',
            field: 'delivery_address'
          }
        },
        { status: 400 }
      );
    }

    if (!delivery_area || typeof delivery_area !== 'string' || !delivery_area.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Delivery area is required.',
            field: 'delivery_area'
          }
        },
        { status: 400 }
      );
    }

    if (!destination_city_id || typeof destination_city_id !== 'number' || destination_city_id <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid positive destination_city_id is required.',
            field: 'destination_city_id'
          }
        },
        { status: 400 }
      );
    }

    if (!expected_delivery_date || typeof expected_delivery_date !== 'string' || !isValidDateString(expected_delivery_date)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid expected_delivery_date in YYYY-MM-DD format is required.',
            field: 'expected_delivery_date'
          }
        },
        { status: 400 }
      );
    }

    // Enforce 7-day minimum lead time rule (fast pre-check)
    const daysUntilDelivery = getDayDifferenceFromToday(expected_delivery_date);
    if (daysUntilDelivery < 7) {
      return NextResponse.json(
        {
          error: {
            code: 'LEAD_TIME_VIOLATION',
            message: 'expected_delivery_date must be >= 7 days after order date.',
            field: 'expected_delivery_date'
          }
        },
        { status: 400 }
      );
    }

    // Line items validation
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Order rejected: at least one item required.',
            field: 'items'
          }
        },
        { status: 400 }
      );
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item.product_id !== 'number' || item.product_id <= 0) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: `Item at index ${i} contains an invalid product_id.`,
              field: `items[${i}].product_id`
            }
          },
          { status: 400 }
        );
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: `Item at index ${i} must have a quantity greater than 0.`,
              field: `items[${i}].quantity`
            }
          },
          { status: 400 }
        );
      }
    }

    // 4. Serialize items for MySQL JSON_TABLE
    const serializedItems = JSON.stringify(
      items.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity
      }))
    );

    // 5. Execute stored procedure inside distributed lock & user session context
    const lockKey = REDIS_KEYS.LOCK_ORDER_DESTINATION(destination_city_id);

    const createdOrder = await withLock(
      lockKey,
      async () => {
        return await withUserContext(
          session.user_id,
          session.role,
          async (conn) => {
            // place_order is only atomic if the caller opens a transaction (migration 22 removed the
            // procedure's own implicit COMMIT, but autocommit would still save each statement separately).
            // Without this, a failure after the order INSERT (e.g. no trip with capacity) leaves a
            // committed order with no train booking. The transaction is committed *inside* the Redis
            // lock so the next caller sees this order's booked_space before it can take the lock.
            await conn.beginTransaction();
            try {
              // Call place_order procedure
              await conn.execute(
                `CALL place_order(?, ?, ?, ?, ?, ?, ?, NOW(), @out_order_id)`,
                [
                  customer_id,
                  delivery_address.trim(),
                  delivery_area.trim(),
                  destination_city_id,
                  expected_delivery_date,
                  serializedItems,
                  session.user_id
                ]
              );

              // Retrieve the generated order_id from session OUT variable
              const [outRows] = await conn.execute<RowDataPacket[]>(
                'SELECT @out_order_id AS order_id'
              );

              const newOrderId = outRows[0]?.order_id;
              if (!newOrderId) {
                throw new Error('Failed to retrieve newly generated order_id from place_order().');
              }

              // Fetch inserted order record to return trigger-calculated summary
              const [orderRows] = await conn.execute<OrderSummaryRow[]>(
                `SELECT 
                   order_id, 
                   customer_id, 
                   delivery_address, 
                   delivery_area, 
                   destination_city_id, 
                   route_id, 
                   order_placed_at, 
                   expected_delivery_date, 
                   status, 
                   total_value, 
                   total_space_required 
                 FROM orders 
                 WHERE order_id = ?`,
                [newOrderId]
              );

              const orderSummary = orderRows[0];
              if (!orderSummary) {
                throw new Error(`Order #${newOrderId} was placed, but failed to retrieve its record from the database.`);
              }

              await conn.commit();
              return orderSummary;
            } catch (error) {
              // Every failure path, including the post-INSERT read-back errors above, must undo the order.
              // The pooled connection must never be returned with a transaction still open.
              await conn.rollback();
              throw error;
            }
          }
        );
      },
      { ttlSeconds: 10, maxRetries: 1, retryDelayMs: 250 }
    );

    // 6. Return 201 Created with order summary
    return NextResponse.json(
      {
        order: createdOrder,
        message: 'Order successfully placed and train capacity booked.'
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    const err = error as { sqlState?: string; sqlMessage?: string; message?: string; code?: string };

    // Check for distributed lock contention error from withLock
    if (err.message && err.message.includes('currently locked')) {
      return NextResponse.json(
        {
          error: {
            code: 'LOCK_CONTENTION',
            message: 'Another order for this destination is currently reserving capacity. Please retry in a moment.'
          }
        },
        { status: 409 }
      );
    }

    // Check for MySQL 45000 custom SIGNAL errors from stored procedures/triggers
    if (err.sqlState === '45000') {
      const cleanMessage = err.sqlMessage || err.message || 'Business rule violation occurred.';
      return NextResponse.json(
        {
          error: {
            code: 'BUSINESS_RULE_VIOLATION',
            message: cleanMessage
          }
        },
        { status: 400 }
      );
    }

    // Check for foreign key violations (e.g. invalid customer_id or city_id)
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return NextResponse.json(
        {
          error: {
            code: 'FOREIGN_KEY_VIOLATION',
            message: 'Referenced customer or destination city does not exist.'
          }
        },
        { status: 400 }
      );
    }

    console.error('[POST /api/orders] Unexpected error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred while processing the order.'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handles GET requests to /api/orders.
 * Fetches a paginated, filterable list of orders joined with customer and city details.
 * 
 * Query Parameters:
 * - status: 'Pending' | 'In Transit' | 'At Store' | 'Out for Delivery' | 'Delivered' | 'Cancelled'
 * - customer_id: number
 * - city_id: number (overridden if caller is a store_manager)
 * - date_from: 'YYYY-MM-DD'
 * - date_to: 'YYYY-MM-DD'
 * - search: string (matches customer name, delivery address, or numeric order ID)
 * - page: number (default 1)
 * - page_size: number (default 10, max 100)
 * 
 * Role Scoping:
 * - store_manager accounts are forcefully scoped to their assigned store's city_id.
 * - system_administrator, logistics_manager, and order_entry_clerk have global visibility.
 * 
 * @param {Request} req - Incoming HTTP Request with query parameters
 * @returns {Promise<NextResponse>} JSON response containing items array and pagination metadata
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    // 1. Authenticate user session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.'
          }
        },
        { status: 401 }
      );
    }

    // 2. Enforce RBAC permission for reading orders
    const canReadOrders = hasPermission(session.role, 'orders', 'read');
    if (!canReadOrders) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to view customer orders.'
          }
        },
        { status: 403 }
      );
    }

    // 3. Parse and sanitize query parameters
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status')?.trim() || null;
    const customerIdParam = searchParams.get('customer_id');
    const cityIdParam = searchParams.get('city_id');
    const dateFromParam = searchParams.get('date_from')?.trim() || null;
    const dateToParam = searchParams.get('date_to')?.trim() || null;
    const searchParam = searchParams.get('search')?.trim() || null;
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('page_size') || '10', 10);

    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const pageSize = isNaN(pageSizeParam) || pageSizeParam < 1 ? 10 : Math.min(pageSizeParam, 100);
    const offset = (page - 1) * pageSize;

    // 4. Enforce store manager destination isolation
    let enforcedCityId: number | null = null;
    if (session.role === 'store_manager') {
      if (!session.store_id) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Store manager account is not assigned to any regional warehouse store.'
            }
          },
          { status: 403 }
        );
      }

      // Lookup the city_id associated with this store
      const store = await queryOne<StoreCityRow>(
        'SELECT city_id FROM stores WHERE store_id = ? AND is_deleted = 0',
        [session.store_id]
      );

      if (!store) {
        return NextResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Assigned store was not found or has been deactivated.'
            }
          },
          { status: 404 }
        );
      }

      enforcedCityId = store.city_id;
    }

    // 5. Construct parameterized dynamic SQL conditions
    const whereConditions: string[] = [];
    const whereParams: QueryParam[] = [];

    // Apply destination city filter (enforced for store_manager, optional for others)
    if (enforcedCityId !== null) {
      whereConditions.push('o.destination_city_id = ?');
      whereParams.push(enforcedCityId);
    } else if (cityIdParam) {
      const parsedCityId = parseInt(cityIdParam, 10);
      if (!isNaN(parsedCityId) && parsedCityId > 0) {
        whereConditions.push('o.destination_city_id = ?');
        whereParams.push(parsedCityId);
      }
    }

    // Apply status filter (accepts canonical names, ignores 'all')
    if (statusParam && statusParam.toLowerCase() !== 'all') {
      const validStatuses = [
        'Pending',
        'In Transit',
        'At Store',
        'Out for Delivery',
        'Delivered',
        'Cancelled'
      ];
      const matched = validStatuses.find(
        (s) => s.toLowerCase() === statusParam.toLowerCase()
      );
      if (matched) {
        whereConditions.push('o.status = ?');
        whereParams.push(matched);
      }
    }

    // Apply customer_id filter
    if (customerIdParam) {
      const parsedCustomerId = parseInt(customerIdParam, 10);
      if (!isNaN(parsedCustomerId) && parsedCustomerId > 0) {
        whereConditions.push('o.customer_id = ?');
        whereParams.push(parsedCustomerId);
      }
    }

    // Apply placed date range filters
    if (dateFromParam && isValidDateString(dateFromParam)) {
      whereConditions.push('o.order_placed_at >= ?');
      whereParams.push(`${dateFromParam} 00:00:00`);
    }

    if (dateToParam && isValidDateString(dateToParam)) {
      whereConditions.push('o.order_placed_at <= ?');
      whereParams.push(`${dateToParam} 23:59:59`);
    }

    // Apply omni-search filter (customer name, delivery address, or order ID)
    if (searchParam) {
      const cleanSearch = searchParam.replace(/^#?ORD-?/i, '');
      const numericOrderId = parseInt(cleanSearch, 10);

      if (!isNaN(numericOrderId) && numericOrderId > 0) {
        whereConditions.push(
          '(c.customer_name LIKE ? OR o.delivery_address LIKE ? OR o.order_id = ?)'
        );
        whereParams.push(`%${searchParam}%`, `%${searchParam}%`, numericOrderId);
      } else {
        whereConditions.push(
          '(c.customer_name LIKE ? OR o.delivery_address LIKE ?)'
        );
        whereParams.push(`%${searchParam}%`, `%${searchParam}%`);
      }
    }

    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 6. Define Count and Data SQL queries
    const countSql = `
      SELECT COUNT(*) AS total
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      JOIN cities dest ON o.destination_city_id = dest.city_id
      ${whereClause}
    `;

    const dataSql = `
      SELECT 
        o.order_id,
        o.customer_id,
        c.customer_name,
        c.phone AS customer_phone,
        o.destination_city_id,
        dest.city_name AS destination_city,
        o.delivery_area,
        o.delivery_address,
        o.route_id,
        o.order_placed_at,
        o.expected_delivery_date,
        o.status,
        o.total_value,
        o.total_space_required
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      JOIN cities dest ON o.destination_city_id = dest.city_id
      ${whereClause}
      ORDER BY o.order_placed_at DESC, o.order_id DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams: QueryParam[] = [...whereParams, pageSize, offset];

    // 7. Execute both queries in parallel via Promise.all to minimize latency
    const [countRow, items] = await Promise.all([
      queryOne<CountResult>(countSql, whereParams),
      query<OrderListItemRow[]>(dataSql, dataParams)
    ]);

    const total = countRow ? Number(countRow.total) : 0;
    const totalPages = Math.ceil(total / pageSize);

    // 8. Return 200 OK with items and pagination metadata
    return NextResponse.json({
      items,
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages
    });

  } catch (error: unknown) {
    console.error('[GET /api/orders] Unexpected error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred while retrieving customer orders.'
        }
      },
      { status: 500 }
    );
  }
}
