/**
 * @file app/api/stores/[id]/arrived-bookings/route.ts
 * @description API route handler for retrieving eligible arrived train bookings for goods receipt.
 *
 * Endpoints:
 * - GET /api/stores/:id/arrived-bookings: Retrieves all train bookings destined for the specified store
 *   whose train trip status is 'Arrived' and that have not yet been received into inventory.
 *
 * Supported route parameters:
 * - `:id`: Target store ID (must be positive integer).
 *
 * Response shape:
 * - 200: { items: [{ booking_id, train_booking_id, trip_id, order_id, arrival_datetime, items: [...] }] }
 *
 * Access control:
 * - store_manager: Allowed only for their assigned home store (store_id from JWT).
 * - system_administrator, logistics_manager: Allowed across all stores.
 * - Other roles: Rejected with 403 Forbidden.
 *
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §2.6 & §2.7, Docs/05_api-and-pages.md §A6
 * Review Reference: Member 4 Review Fix #4
 */

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { query, queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Route parameter context for Next.js dynamic route segments.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Raw database row interface for store verification.
 */
interface StoreCheckRow extends RowDataPacket {
  store_id: number;
  is_deleted: number;
}

/**
 * Raw database row interface returned by the joined arrived bookings query.
 */
interface RawArrivedBookingRow extends RowDataPacket {
  booking_id: number | string;
  trip_id: number | string;
  order_id: number | string;
  arrival_datetime: Date | string;
  booking_item_id: number | string | null;
  product_id: number | string | null;
  product_name: string | null;
  sku: string | null;
  quantity_shipped: number | string | null;
}

/**
 * Formatted booking line item shape.
 */
export interface ArrivedBookingItemPayload {
  booking_item_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  expected_quantity: number;
}

/**
 * Formatted arrived booking shape returned to client consumers.
 */
export interface ArrivedBookingPayload {
  booking_id: number;
  train_booking_id: number;
  trip_id: number;
  order_id: number;
  arrival_datetime: string;
  items: ArrivedBookingItemPayload[];
}

/**
 * Handles GET requests to /api/stores/:id/arrived-bookings.
 * Fetches arrived train bookings that have not yet been recorded in inventory_transactions.
 *
 * Data flow:
 * 1. Validate route parameter `:id` is a valid positive integer.
 * 2. Authenticate JWT session via getSession().
 * 3. Enforce RBAC read permission on store inventory.
 * 4. Apply multi-tenant store isolation: store_manager may only view their assigned home store.
 * 5. Verify target store exists and is not soft-deleted.
 * 6. Query train bookings where:
 *    - train_trips destination city matches store city_id
 *    - train_trips status is 'Arrived'
 *    - no 'receive' entry exists in inventory_transactions for the booking
 * 7. Group joined booking items by booking_id.
 * 8. Return 200 OK with formatted list.
 *
 * @param req - Incoming HTTP request
 * @param context - Dynamic route parameters containing target store ID Promise
 * @returns JSON response containing items array or structured error details
 */
export async function GET(
  req: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. Resolve and validate route parameter
    const { id } = await context.params;
    const storeId = parseInt(id, 10);

    if (isNaN(storeId) || storeId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'A valid positive numeric store ID is required.',
            field: 'id',
          },
        },
        { status: 400 }
      );
    }

    // 2. Authenticate user session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.',
          },
        },
        { status: 401 }
      );
    }

    // 3. RBAC permission check on store inventory resource
    if (!hasPermission(session.role, 'store_inventory', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view store inventory or arrived bookings.`,
          },
        },
        { status: 403 }
      );
    }

    // 4. Multi-tenant store scoping: store_manager can only inspect their own assigned store
    if (session.role === 'store_manager') {
      if (session.store_id === null || session.store_id === undefined) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Store manager account is not assigned to any store.',
            },
          },
          { status: 403 }
        );
      }

      if (Number(session.store_id) !== storeId) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Store managers may only view arrived bookings for their assigned store.',
            },
          },
          { status: 403 }
        );
      }
    }

    // 5. Verify target store exists and is active (not soft-deleted)
    const store = await queryOne<StoreCheckRow>(
      'SELECT store_id, is_deleted FROM stores WHERE store_id = ? AND is_deleted = 0',
      [storeId]
    );

    if (!store) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Store with ID #${storeId} was not found.`,
          },
        },
        { status: 404 }
      );
    }

    // 6. Query arrived bookings that have not yet been received into inventory
    const sql = `
      SELECT 
        b.booking_id,
        b.trip_id,
        b.order_id,
        t.arrival_datetime,
        bi.booking_item_id,
        oi.product_id,
        p.product_name,
        p.sku,
        CAST(bi.quantity_shipped AS DOUBLE) AS quantity_shipped
      FROM train_bookings b
      JOIN train_trips t ON t.trip_id = b.trip_id
      JOIN stores s ON s.city_id = t.destination_city_id
      LEFT JOIN train_booking_items bi ON bi.booking_id = b.booking_id
      LEFT JOIN order_items oi ON oi.order_item_id = bi.order_item_id
      LEFT JOIN products p ON p.product_id = oi.product_id
      WHERE s.store_id = ?
        AND s.is_deleted = 0
        AND t.status = 'Arrived'
        AND NOT EXISTS (
          SELECT 1 
          FROM inventory_transactions it 
          WHERE it.train_booking_id = b.booking_id 
            AND it.transaction_type = 'receive'
        )
      ORDER BY t.arrival_datetime DESC, b.booking_id DESC, bi.booking_item_id ASC
    `;

    const rows = await query<RawArrivedBookingRow[]>(sql, [storeId]);

    // 7. Group line items under their respective booking records
    const bookingsMap = new Map<number, ArrivedBookingPayload>();

    for (const row of rows) {
      const bookingId = Number(row.booking_id);

      if (!bookingsMap.has(bookingId)) {
        const arrivalIso =
          row.arrival_datetime instanceof Date
            ? row.arrival_datetime.toISOString()
            : new Date(row.arrival_datetime).toISOString();

        bookingsMap.set(bookingId, {
          booking_id: bookingId,
          train_booking_id: bookingId,
          trip_id: Number(row.trip_id),
          order_id: Number(row.order_id),
          arrival_datetime: arrivalIso,
          items: [],
        });
      }

      if (row.booking_item_id !== null && row.product_id !== null) {
        bookingsMap.get(bookingId)!.items.push({
          booking_item_id: Number(row.booking_item_id),
          product_id: Number(row.product_id),
          product_name: row.product_name ?? `Product #${row.product_id}`,
          sku: row.sku ?? `SKU-${row.product_id}`,
          expected_quantity: Number(row.quantity_shipped ?? 0),
        });
      }
    }

    const items = Array.from(bookingsMap.values());

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching arrived bookings:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve arrived bookings. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
