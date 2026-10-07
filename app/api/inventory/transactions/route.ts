/**
 * @file app/api/inventory/transactions/route.ts
 * @description API route handler for querying inventory movement transaction ledger history.
 * 
 * Endpoints:
 * - GET /api/inventory/transactions: Retrieves a filtered list of inventory transactions.
 * 
 * Supported query parameters:
 * - store_id?: Positive integer filter by store (enforced for store_manager)
 * - product_id?: Positive integer filter by product
 * - type?: Transaction type filter ('receive', 'dispatch', 'adjustment', or 'all')
 * - date_from?: Start date filter (YYYY-MM-DD or ISO 8601 string)
 * - date_to?: End date filter (YYYY-MM-DD or ISO 8601 string)
 * 
 * Response shape:
 * - 200: { items: [{ transaction_id, store_id, product_id, change_qty, transaction_type, train_booking_id, delivery_id, created_at }] }
 * 
 * Access control:
 * - store_manager: Allowed only for their own assigned store. Enforces store isolation from session JWT.
 * - system_administrator, logistics_manager: Global visibility across all warehouse stores.
 * - Other roles: Rejected with 403 Forbidden.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §2.7 & §9, Docs/05_api-and-pages.md §A6
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { query, QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Raw database row shape returned by the joined inventory transactions query.
 */
interface InventoryTransactionRow extends RowDataPacket {
  transaction_id: number | string;
  store_id: number | string;
  product_id: number | string;
  change_qty: number | string;
  transaction_type: string;
  train_booking_id: number | string | null;
  delivery_id: number | string | null;
  created_at: Date | string;
}

/**
 * Validates whether a provided string represents a valid calendar date.
 * Supports both YYYY-MM-DD calendar date strings and ISO 8601 timestamps.
 * 
 * @param dateStr - Raw date string candidate from URL query parameters
 * @returns true if the string can be parsed into a valid date, false otherwise
 */
function isValidDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }
  // Check canonical calendar format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }
  // Check generic ISO 8601 date string
  const timestamp = Date.parse(dateStr);
  return !isNaN(timestamp);
}

/**
 * Normalizes a validated date string into a MySQL DATETIME boundary string ('YYYY-MM-DD HH:MM:SS').
 * 
 * @param dateStr - Validated date string
 * @param isEndOfDay - If true, sets time boundary to 23:59:59; otherwise sets to 00:00:00
 * @returns Formatted MySQL DATETIME string
 */
function toMysqlDateTimeBoundary(dateStr: string, isEndOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return isEndOfDay ? `${dateStr} 23:59:59` : `${dateStr} 00:00:00`;
  }
  const dateObj = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
  const timePart = isEndOfDay ? '23:59:59' : '00:00:00';
  return `${datePart} ${timePart}`;
}

/**
 * Handles GET requests to /api/inventory/transactions.
 * Fetches transaction history for inventory movements with filtering and tenant store isolation.
 * 
 * Query parameters supported:
 * - `store_id`: Optional positive integer store filter (restricted for store_manager).
 * - `product_id`: Optional positive integer product catalog filter.
 * - `type`: Optional transaction type filter ('receive', 'dispatch', 'adjustment').
 * - `date_from`: Optional creation date lower bound (YYYY-MM-DD).
 * - `date_to`: Optional creation date upper bound (YYYY-MM-DD).
 * 
 * Data flow:
 * 1. Authenticate JWT session via getSession().
 * 2. Enforce RBAC read permission on 'inventory_transactions'.
 * 3. Enforce store manager isolation (store_id bound to session).
 * 4. Parse, sanitize, and validate all query parameters with standardized error payloads.
 * 5. Construct parameterized query joining inventory_transactions with active stores and products.
 * 6. Order results descending by creation timestamp and transaction ID.
 * 7. Return 200 OK with formatted items list.
 * 
 * @param req - Incoming HTTP request
 * @returns JSON response containing items array or standardized error object
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

    // 2. Enforce RBAC permission for reading inventory transactions
    if (!hasPermission(session.role, 'inventory_transactions', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view inventory transactions.`
          }
        },
        { status: 403 }
      );
    }

    // 3. Extract search parameters
    const { searchParams } = new URL(req.url);
    const storeIdParam = searchParams.get('store_id')?.trim() || null;
    const productIdParam = searchParams.get('product_id')?.trim() || null;
    const typeParam = searchParams.get('type')?.trim() || null;
    const dateFromParam = searchParams.get('date_from')?.trim() || null;
    const dateToParam = searchParams.get('date_to')?.trim() || null;

    const whereConditions: string[] = ['s.is_deleted = 0', 'p.is_deleted = 0'];
    const queryParams: QueryParam[] = [];

    // 4. Enforce store isolation and validate store_id parameter
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

      const assignedStoreId = Number(session.store_id);

      // If store_id query param was explicitly passed, ensure it matches assigned store
      if (storeIdParam) {
        const parsedStoreId = parseInt(storeIdParam, 10);
        if (isNaN(parsedStoreId) || parsedStoreId <= 0 || !/^\d+$/.test(storeIdParam)) {
          return NextResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'A valid positive numeric store ID is required.',
                field: 'store_id'
              }
            },
            { status: 400 }
          );
        }

        if (parsedStoreId !== assignedStoreId) {
          return NextResponse.json(
            {
              error: {
                code: 'FORBIDDEN',
                message: 'Store managers may only access inventory transactions for their assigned store.'
              }
            },
            { status: 403 }
          );
        }
      }

      // Enforce query restriction to the assigned store
      whereConditions.push('it.store_id = ?');
      queryParams.push(assignedStoreId);
    } else {
      // Global roles: system_administrator, logistics_manager
      if (storeIdParam) {
        const parsedStoreId = parseInt(storeIdParam, 10);
        if (isNaN(parsedStoreId) || parsedStoreId <= 0 || !/^\d+$/.test(storeIdParam)) {
          return NextResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'A valid positive numeric store ID is required.',
                field: 'store_id'
              }
            },
            { status: 400 }
          );
        }

        whereConditions.push('it.store_id = ?');
        queryParams.push(parsedStoreId);
      }
    }

    // 5. Validate and apply product_id filter
    if (productIdParam) {
      const parsedProductId = parseInt(productIdParam, 10);
      if (isNaN(parsedProductId) || parsedProductId <= 0 || !/^\d+$/.test(productIdParam)) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'A valid positive numeric product ID is required.',
              field: 'product_id'
            }
          },
          { status: 400 }
        );
      }

      whereConditions.push('it.product_id = ?');
      queryParams.push(parsedProductId);
    }

    // 6. Validate and apply transaction type filter
    if (typeParam && typeParam.toLowerCase() !== 'all') {
      const validTypes = ['receive', 'dispatch', 'adjustment'];
      const matchedType = validTypes.find((t) => t === typeParam.toLowerCase());

      if (!matchedType) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: "Invalid transaction type. Permitted values are 'receive', 'dispatch', 'adjustment'.",
              field: 'type'
            }
          },
          { status: 400 }
        );
      }

      whereConditions.push('it.transaction_type = ?');
      queryParams.push(matchedType);
    }

    // 7. Validate and apply date range filters
    let parsedDateFrom: Date | null = null;
    let parsedDateTo: Date | null = null;

    if (dateFromParam) {
      if (!isValidDateString(dateFromParam)) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Valid date_from in YYYY-MM-DD format is required.',
              field: 'date_from'
            }
          },
          { status: 400 }
        );
      }
      parsedDateFrom = new Date(dateFromParam);
    }

    if (dateToParam) {
      if (!isValidDateString(dateToParam)) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Valid date_to in YYYY-MM-DD format is required.',
              field: 'date_to'
            }
          },
          { status: 400 }
        );
      }
      parsedDateTo = new Date(dateToParam);
    }

    // Cross-validate that date_from is not after date_to
    if (parsedDateFrom && parsedDateTo && parsedDateFrom.getTime() > parsedDateTo.getTime()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'date_from cannot be after date_to.',
            field: 'date_from'
          }
        },
        { status: 400 }
      );
    }

    if (dateFromParam) {
      whereConditions.push('it.created_at >= ?');
      queryParams.push(toMysqlDateTimeBoundary(dateFromParam, false));
    }

    if (dateToParam) {
      whereConditions.push('it.created_at <= ?');
      queryParams.push(toMysqlDateTimeBoundary(dateToParam, true));
    }

    // 8. Construct single join query to avoid N+1 lookups
    const sql = `
      SELECT 
        it.transaction_id,
        it.store_id,
        it.product_id,
        CAST(it.change_qty AS DOUBLE) AS change_qty,
        it.transaction_type,
        it.train_booking_id,
        it.delivery_id,
        it.created_at
      FROM inventory_transactions it
      JOIN stores s ON it.store_id = s.store_id
      JOIN products p ON it.product_id = p.product_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY it.created_at DESC, it.transaction_id DESC
    `;

    const rows = await query<InventoryTransactionRow[]>(sql, queryParams);

    // 9. Format response payload conforming to documented contract shape and schema
    const items = rows.map((row) => ({
      transaction_id: Number(row.transaction_id),
      store_id: Number(row.store_id),
      product_id: Number(row.product_id),
      change_qty: Number(row.change_qty),
      transaction_type: row.transaction_type,
      train_booking_id:
        row.train_booking_id !== null && row.train_booking_id !== undefined
          ? Number(row.train_booking_id)
          : null,
      delivery_id:
        row.delivery_id !== null && row.delivery_id !== undefined
          ? Number(row.delivery_id)
          : null,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString()
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching inventory transactions:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve inventory transactions. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
