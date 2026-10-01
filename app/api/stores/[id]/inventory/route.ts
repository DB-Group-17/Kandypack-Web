/**
 * @file app/api/stores/[id]/inventory/route.ts
 * @description API route handler for retrieving store inventory stock levels.
 * 
 * Endpoints:
 * - GET /api/stores/:id/inventory: Retrieves all product stock records for a specific store.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §2.2, Docs/05_api-and-pages.md §A6
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { query, queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Route parameter context for Next.js 15+ / 16 dynamic route segment.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Raw database row interface for store existence verification.
 */
interface StoreCheckRow extends RowDataPacket {
  store_id: number;
  is_deleted: number;
}

/**
 * Raw database row interface for inventory stock item join.
 */
interface StoreInventoryRow extends RowDataPacket {
  product_id: number;
  product_name: string;
  quantity_on_hand: number | string;
  updated_at: Date | string;
}

/**
 * Handles GET requests to /api/stores/:id/inventory.
 * Retrieves the current inventory stock on hand for the requested store.
 * 
 * Access control:
 * - store_manager: Allowed only for their own assigned home store (store_id from JWT).
 * - system_administrator, logistics_manager: Allowed to read inventory for all stores.
 * 
 * @param req - Incoming HTTP request
 * @param context - Dynamic route parameters containing target store ID Promise
 * @returns JSON response containing items array of inventory stock or structured error details
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
            field: 'id'
          }
        },
        { status: 400 }
      );
    }

    // 2. Authenticate session
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

    // 3. RBAC permission check on store_inventory resource
    if (!hasPermission(session.role, 'store_inventory', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view store inventory.`
          }
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
              message: 'Store managers may only access inventory for their assigned store.'
            }
          },
          { status: 403 }
        );
      }
    }

    // 5. Verify the requested store exists and is active
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

    // 6. Retrieve stock items for the store joined with active product catalog details
    const sql = `
      SELECT 
        si.product_id,
        p.product_name,
        CAST(si.quantity_on_hand AS DOUBLE) AS quantity_on_hand,
        si.updated_at
      FROM store_inventory si
      JOIN products p ON si.product_id = p.product_id
      WHERE si.store_id = ? AND p.is_deleted = 0
      ORDER BY si.product_id ASC
    `;

    const rows = await query<StoreInventoryRow[]>(sql, [storeId]);

    // 7. Format response payload matching API contract: items: [{ product_id, product_name, quantity_on_hand, updated_at }]
    const items = rows.map((row) => ({
      product_id: Number(row.product_id),
      product_name: row.product_name,
      quantity_on_hand: Number(row.quantity_on_hand),
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString()
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching store inventory:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve store inventory. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
