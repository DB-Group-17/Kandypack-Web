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
 * 6. Execute MySQL stored procedure `place_order(...)` with OUT param `@out_order_id`.
 * 7. Retrieve created order row and return 201 Created with order summary.
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
import { withUserContext } from '@/lib/db';
import { withLock, REDIS_KEYS } from '@/lib/redis';

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
 * Created order row returned by the database.
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

    // 2. Enforce RBAC permission for order creation
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

    // 3. Parse and validate request JSON body
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

            return orderSummary;
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
