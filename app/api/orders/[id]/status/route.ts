/**
 * @file app/api/orders/[id]/status/route.ts
 * @description Dynamic API route handler for updating order status.
 * 
 * Responsibilities:
 * 1. Validate route parameter format (positive integer order ID).
 * 2. Authenticate session and enforce RBAC permissions (`orders:update_status`).
 *    - Restricted to `system_administrator` and `logistics_manager`.
 * 3. Validate request payload and ensure target status belongs to the canonical status set.
 * 4. Verify order existence and enforce the logistics finite state machine:
 *    - Pending -> In Transit -> At Store -> Out for Delivery -> Delivered (or Cancelled).
 *    - Reject redundant transitions, illegal skips, and transitions from terminal states (Delivered, Cancelled).
 * 5. Execute status update inside `withUserContext` on a dedicated single connection so that:
 *    - Database trigger `trg_log_order_status_change` captures `@current_user_id` in `order_status_history`.
 *    - Optional transition notes are attached to the audit record.
 *    - If status is Cancelled, active truck deliveries are cancelled.
 * 6. Return the full updated order record and success message with HTTP 200.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §5, Docs/05_api-and-pages.md §A4
 * Owner: Member 1 (Dineth)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { queryOne, withUserContext } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

/**
 * Route context interface matching Next.js 15/16 async dynamic route parameters.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Expected JSON request body shape.
 */
interface UpdateOrderStatusRequest {
  status: string;
  notes?: string;
}

/**
 * Database row interface for orders table.
 */
interface OrderRecord extends RowDataPacket {
  order_id: number;
  customer_id: number;
  delivery_address: string;
  delivery_area: string;
  destination_city_id: number;
  route_id: number | null;
  order_placed_at: Date | string;
  expected_delivery_date: Date | string;
  status: string;
  total_value: number | string;
  total_space_required: number | string;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * Canonical order status enum values recognized by Schema v4.
 */
const VALID_ORDER_STATUSES = [
  'Pending',
  'In Transit',
  'At Store',
  'Out for Delivery',
  'Delivered',
  'Cancelled'
] as const;

type OrderStatus = typeof VALID_ORDER_STATUSES[number];

/**
 * Finite state machine transition map.
 * Enforces legal forward progressions and pre-delivery cancellation branches.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'Pending': ['In Transit', 'Cancelled'],
  'In Transit': ['At Store', 'Cancelled'],
  'At Store': ['Out for Delivery', 'Cancelled'],
  'Out for Delivery': ['Delivered', 'Cancelled'],
  'Delivered': [],
  'Cancelled': []
};

/**
 * Formats a Date object or MySQL timestamp string into a standardized ISO 8601 string.
 *
 * @param dateVal - Raw date representation from database driver
 * @returns ISO 8601 formatted date string
 */
function toIsoString(dateVal: Date | string | null | undefined): string | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal.toISOString();
  const parsed = new Date(dateVal);
  return isNaN(parsed.getTime()) ? String(dateVal) : parsed.toISOString();
}

/**
 * Formats a DATE column into a YYYY-MM-DD string.
 *
 * @param dateVal - Raw date representation from database driver
 * @returns YYYY-MM-DD string
 */
function toDateString(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    return dateVal.split('T')[0].split(' ')[0];
  }
  return dateVal.toISOString().split('T')[0];
}

/**
 * PATCH handler for transitioning an order's lifecycle status.
 * 
 * URL: PATCH /api/orders/[id]/status
 * Access Control: system_administrator, logistics_manager.
 * 
 * @param req - Incoming HTTP Request with JSON body { status: string, notes?: string }
 * @param context - Dynamic route context containing async params
 * @returns JSON response with full updated order object or structured error
 */
export async function PATCH(
  req: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. Resolve and validate route parameter
    const { id } = await context.params;
    const orderId = parseInt(id, 10);

    if (isNaN(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'A valid positive integer order ID is required.'
          }
        },
        { status: 400 }
      );
    }

    // 2. Authenticate session and check user permissions
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be authenticated to update order status.'
          }
        },
        { status: 401 }
      );
    }

    if (!hasPermission(session.role, 'orders', 'update_status')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Only Logistics Managers and System Administrators have permission to update order status.'
          }
        },
        { status: 403 }
      );
    }

    // 3. Parse and validate request JSON body
    let body: UpdateOrderStatusRequest;
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

    const { status: rawStatus, notes } = body;

    if (!rawStatus || typeof rawStatus !== 'string' || !rawStatus.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Target status is required.',
            field: 'status'
          }
        },
        { status: 400 }
      );
    }

    // Normalize and match target status against canonical list (case-insensitive tolerance)
    const targetStatus = VALID_ORDER_STATUSES.find(
      (s) => s.toLowerCase() === rawStatus.trim().toLowerCase()
    );

    if (!targetStatus) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid order status '${rawStatus}'. Valid statuses are: ${VALID_ORDER_STATUSES.join(', ')}.`,
            field: 'status'
          }
        },
        { status: 400 }
      );
    }

    // 4. Fetch the existing order from database
    const currentOrder = await queryOne<OrderRecord>(
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
        total_space_required,
        created_by,
        created_at,
        updated_at
      FROM orders
      WHERE order_id = ?`,
      [orderId]
    );

    if (!currentOrder) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Order #${orderId} was not found.`
          }
        },
        { status: 404 }
      );
    }

    const currentStatus = currentOrder.status as OrderStatus;

    // 5. Evaluate state machine business rules
    // Rule A: Redundant transition (order already has this status)
    if (currentStatus === targetStatus) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: `Order #${orderId} is already in '${currentStatus}' status.`
          }
        },
        { status: 400 }
      );
    }

    // Rule B: Terminal state transition attempt
    if (currentStatus === 'Delivered' || currentStatus === 'Cancelled') {
      return NextResponse.json(
        {
          error: {
            code: 'TERMINAL_STATE',
            message: `Cannot change status of order #${orderId} because it is in terminal state '${currentStatus}'.`
          }
        },
        { status: 400 }
      );
    }

    // Rule C: Illegal transition under state machine
    const legalNextStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!legalNextStatuses.includes(targetStatus)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TRANSITION',
            message: `Illegal status transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions from '${currentStatus}' are: ${legalNextStatuses.join(', ')}.`
          }
        },
        { status: 400 }
      );
    }

    // 6. Execute status change inside withUserContext
    // This ensures @current_user_id is set on the exact MySQL connection, enabling
    // trigger trg_log_order_status_change to log changed_by into order_status_history.
    await withUserContext(session.user_id, session.role, async (conn) => {
      // Step A: Update orders table
      await conn.execute(
        'UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
        [targetStatus, orderId]
      );

      // Step B: If notes were supplied, attach them to the newly generated history entry
      if (notes && typeof notes === 'string' && notes.trim()) {
        await conn.execute(
          `UPDATE order_status_history 
           SET notes = ? 
           WHERE order_id = ? AND new_status = ? 
           ORDER BY history_id DESC 
           LIMIT 1`,
          [notes.trim(), orderId, targetStatus]
        );
      }

      // Step C: If order was cancelled, synchronize linked active deliveries
      if (targetStatus === 'Cancelled') {
        await conn.execute(
          `UPDATE deliveries 
           SET status = 'Cancelled', updated_at = NOW() 
           WHERE order_id = ? AND status IN ('Scheduled', 'In Progress')`,
          [orderId]
        );
      }
    });

    // 7. Fetch the updated order record to return complete entity
    const updatedOrder = await queryOne<OrderRecord>(
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
        total_space_required,
        created_by,
        created_at,
        updated_at
      FROM orders
      WHERE order_id = ?`,
      [orderId]
    );

    if (!updatedOrder) {
      throw new Error(`Order #${orderId} was updated, but failed to retrieve updated record.`);
    }

    // 8. Return 200 OK with full updated order and user-facing confirmation message
    return NextResponse.json(
      {
        order: {
          order_id: updatedOrder.order_id,
          customer_id: updatedOrder.customer_id,
          delivery_address: updatedOrder.delivery_address,
          delivery_area: updatedOrder.delivery_area,
          destination_city_id: updatedOrder.destination_city_id,
          route_id: updatedOrder.route_id,
          order_placed_at: toIsoString(updatedOrder.order_placed_at),
          expected_delivery_date: toDateString(updatedOrder.expected_delivery_date),
          status: updatedOrder.status,
          total_value: Number(updatedOrder.total_value).toFixed(2),
          total_space_required: Number(updatedOrder.total_space_required).toFixed(2),
          created_by: updatedOrder.created_by,
          created_at: toIsoString(updatedOrder.created_at),
          updated_at: toIsoString(updatedOrder.updated_at)
        },
        message: `Order #${orderId} status successfully updated from '${currentStatus}' to '${targetStatus}'.`
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[PATCH /api/orders/[id]/status] Unexpected error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred while updating the order status.'
        }
      },
      { status: 500 }
    );
  }
}
