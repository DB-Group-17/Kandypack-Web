/**
 * @file app/api/stores/[id]/receive-goods/route.ts
 * @description API route handler for receiving train booking cargo at a physical destination store.
 * 
 * Endpoints:
 * - POST /api/stores/:id/receive-goods: Receives cargo from an arrived train trip for a specified booking,
 *   invoking the stored procedure receive_goods_at_store() which creates receive transactions in
 *   inventory_transactions, increments store_inventory via triggers, and advances order status to 'At Store'
 *   once all associated bookings for the order have arrived.
 * 
 * Authority: Docs/03_architecture.md §4 & §6, Docs/04_database-schema-v4.md §2.7 & §5.3, Docs/05_api-and-pages.md §A6
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { queryOne, withUserContext } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Route parameter context for Next.js 15+ / 16 dynamic route segment.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Expected request body contract for receiving goods.
 */
interface ReceiveGoodsRequestBody {
  train_booking_id: number;
}

/**
 * Database row interface for store active verification.
 */
interface StoreCheckRow extends RowDataPacket {
  store_id: number;
  is_deleted: number;
}

/**
 * Database row interface for train booking verification.
 */
interface BookingVerificationRow extends RowDataPacket {
  booking_id: number;
  trip_id: number;
  order_id: number;
  trip_status: string;
  destination_store_id: number;
}

/**
 * Database row interface for duplicate receipt check.
 */
interface DuplicateReceiptRow extends RowDataPacket {
  transaction_id: number;
}

/**
 * Database row interface for product count calculation.
 */
interface ProductCountRow extends RowDataPacket {
  updated_count: number;
}

/**
 * Type guard to safely identify custom MySQL SIGNAL errors (SQLSTATE '45000').
 *
 * @param error - The error caught in the execution block
 * @returns True if error is a MySQL SIGNAL exception
 */
function isSqlSignalError(
  error: unknown
): error is { sqlState: string; sqlMessage?: string; message?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'sqlState' in error &&
    (error as { sqlState: unknown }).sqlState === '45000'
  );
}

/**
 * Handles POST requests to /api/stores/:id/receive-goods.
 * Receives cargo from an arrived train trip booking into the destination store inventory.
 * 
 * Workflow:
 * 1. Validate route parameter `:id` is a valid positive integer.
 * 2. Parse and validate JSON request body containing `train_booking_id`.
 * 3. Authenticate user session via getSession().
 * 4. Verify RBAC permissions: only store_manager and system_administrator are authorized.
 * 5. Apply multi-tenant store isolation: store_manager may only operate on their assigned home store.
 * 6. Verify target store exists and is not soft-deleted.
 * 7. Verify train booking exists, belongs to target store, and belongs to an 'Arrived' train trip.
 * 8. Prevent duplicate receipts for bookings that have already been recorded.
 * 9. Within a transactional database connection under user session context, execute
 *    stored procedure `receive_goods_at_store(bookingId, userId)` and query the number
 *    of distinct products received.
 * 10. Return standard success payload `{ "updated_products": number }` with HTTP 200.
 * 
 * @param req - Incoming HTTP request
 * @param context - Dynamic route segment parameters Promise
 * @returns JSON response with updated product count or structured API error
 */
export async function POST(
  req: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. Resolve and validate dynamic route parameter
    const { id } = await context.params;
    const storeId = parseInt(id, 10);

    if (isNaN(storeId) || storeId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'A valid positive numeric store ID is required.',
            field: 'id'
          }
        },
        { status: 400 }
      );
    }

    // 2. Parse and validate JSON body
    let body: ReceiveGoodsRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST_BODY',
            message: 'A valid JSON request body is required.'
          }
        },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST_BODY',
            message: 'Request body must be a valid JSON object.'
          }
        },
        { status: 400 }
      );
    }

    const { train_booking_id: bookingId } = body;
    if (bookingId === undefined || bookingId === null) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: "Field 'train_booking_id' is required.",
            field: 'train_booking_id'
          }
        },
        { status: 400 }
      );
    }

    if (typeof bookingId !== 'number' || !Number.isInteger(bookingId) || bookingId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: "Field 'train_booking_id' must be a positive integer.",
            field: 'train_booking_id'
          }
        },
        { status: 400 }
      );
    }

    // 3. Authenticate user session
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

    // 4. RBAC check: only store_manager and system_administrator have receive_goods permissions
    if (!hasPermission(session.role, 'inventory_transactions', 'receive_goods')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to receive goods.`
          }
        },
        { status: 403 }
      );
    }

    // 5. Multi-tenant store scoping for store_manager accounts
    if (session.role === 'store_manager') {
      if (session.store_id === null || session.store_id === undefined) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Store manager account is not assigned to any store.'
            }
          },
          { status: 403 }
        );
      }

      if (Number(session.store_id) !== storeId) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Store managers may only receive goods for their assigned store.'
            }
          },
          { status: 403 }
        );
      }
    }

    // 6. Verify target store exists and is active (not soft-deleted)
    const store = await queryOne<StoreCheckRow>(
      'SELECT store_id, is_deleted FROM stores WHERE store_id = ? AND is_deleted = 0',
      [storeId]
    );

    if (!store) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Store with ID #${storeId} was not found.`
          }
        },
        { status: 404 }
      );
    }

    // 7. Verify referenced train booking exists, join destination store, and inspect trip status
    const booking = await queryOne<BookingVerificationRow>(
      `SELECT 
         b.booking_id,
         b.trip_id,
         b.order_id,
         t.status AS trip_status,
         s.store_id AS destination_store_id
       FROM train_bookings b
       JOIN train_trips t ON t.trip_id = b.trip_id
       JOIN stores s ON s.city_id = t.destination_city_id
       WHERE b.booking_id = ?`,
      [bookingId]
    );

    if (!booking) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Train booking #${bookingId} was not found.`
          }
        },
        { status: 404 }
      );
    }

    // Verify booking destination matches target store route parameter
    if (Number(booking.destination_store_id) !== storeId) {
      return NextResponse.json(
        {
          error: {
            code: 'STORE_MISMATCH',
            message: `Train booking #${bookingId} is destined for store #${booking.destination_store_id}, not store #${storeId}.`
          }
        },
        { status: 400 }
      );
    }

    // Verify train trip has Arrived
    if (booking.trip_status !== 'Arrived') {
      return NextResponse.json(
        {
          error: {
            code: 'BUSINESS_RULE_VIOLATION',
            message: `Trip for booking #${bookingId} has not arrived yet (current status: ${booking.trip_status}).`
          }
        },
        { status: 400 }
      );
    }

    // 8. Prevent duplicate receipts: check if booking has already been recorded in inventory_transactions
    const existingReceipt = await queryOne<DuplicateReceiptRow>(
      `SELECT transaction_id 
       FROM inventory_transactions 
       WHERE train_booking_id = ? AND transaction_type = 'receive'
       LIMIT 1`,
      [bookingId]
    );

    if (existingReceipt) {
      return NextResponse.json(
        {
          error: {
            code: 'BUSINESS_RULE_VIOLATION',
            message: `Train booking #${bookingId} has already been received.`
          }
        },
        { status: 400 }
      );
    }

    // 9. Execute stored procedure receive_goods_at_store inside a user-context transaction
    const updatedProductsCount = await withUserContext(
      session.user_id,
      session.role,
      async (connection) => {
        await connection.beginTransaction();
        try {
          // Execute procedure to record inventory transactions, trigger stock updates, and update order status
          await connection.execute('CALL receive_goods_at_store(?, ?)', [
            bookingId,
            session.user_id
          ]);

          // Query distinct products impacted by this train booking
          const [productRows] = await connection.execute<ProductCountRow[]>(
            `SELECT COUNT(DISTINCT oi.product_id) AS updated_count
             FROM train_booking_items bi
             JOIN order_items oi ON oi.order_item_id = bi.order_item_id
             WHERE bi.booking_id = ?`,
            [bookingId]
          );

          const count = Number(productRows[0]?.updated_count ?? 0);

          await connection.commit();
          return count;
        } catch (procError) {
          await connection.rollback();
          throw procError;
        }
      }
    );

    // 10. Return exact documented response shape: { "updated_products": number }
    return NextResponse.json(
      { updated_products: updatedProductsCount },
      { status: 200 }
    );
  } catch (error: unknown) {
    // Surface database business rule signal violations cleanly
    if (isSqlSignalError(error)) {
      const cleanMessage =
        error.sqlMessage || error.message || 'Business rule violation occurred.';
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

    console.error('Error receiving goods at store:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to process receive goods request. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
