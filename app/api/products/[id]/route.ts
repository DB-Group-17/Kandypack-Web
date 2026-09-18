/**
 * @file app/api/products/[id]/route.ts
 * @description API route handler for updating existing products in the master data catalog.
 * 
 * Endpoints:
 * - PATCH /api/products/:id: Updates attributes of a specific product (e.g. price, space consumption rate).
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A3
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { queryOne, withUserContext } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

interface ProductRow {
  product_id: number;
  sku: string;
  product_name: string;
  category: string | null;
  unit_of_measure: string;
  unit_price: number;
  space_rate: number;
  is_deleted: number;
}

/**
 * Handles PATCH requests to /api/products/:id.
 * Allows system administrators to update product catalog specifications and pricing.
 * 
 * @param req - Incoming HTTP request with partial JSON body
 * @param context - Next.js 16 route parameters containing target product ID Promise
 * @returns JSON response with updated product or error details
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
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

    // RBAC: Only system_administrator can update products
    if (!hasPermission(session.role, 'products', 'update')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to update products.`
          }
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const productId = Number(id);

    if (isNaN(productId) || productId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_ID',
            message: 'A valid numeric product ID is required.'
          }
        },
        { status: 400 }
      );
    }

    // Verify product exists and is active
    const existing = await queryOne<ProductRow>(
      'SELECT product_id, sku, product_name, category, unit_of_measure, CAST(unit_price AS DOUBLE) as unit_price, CAST(space_rate AS DOUBLE) as space_rate, is_deleted FROM products WHERE product_id = ? AND is_deleted = 0',
      [productId]
    );

    if (!existing) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'The requested product was not found.'
          }
        },
        { status: 404 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid or malformed JSON payload.'
          }
        },
        { status: 400 }
      );
    }

    const updateFields: string[] = [];
    const params: (string | number)[] = [];

    // Validate and build dynamic update statement
    if (body.product_name !== undefined) {
      const name = String(body.product_name).trim();
      if (!name) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Product name cannot be empty.',
              field: 'product_name'
            }
          },
          { status: 400 }
        );
      }
      updateFields.push('product_name = ?');
      params.push(name);
    }

    if (body.category !== undefined) {
      updateFields.push('category = ?');
      params.push(String(body.category).trim());
    }

    if (body.unit_of_measure !== undefined) {
      updateFields.push('unit_of_measure = ?');
      params.push(String(body.unit_of_measure).trim());
    }

    if (body.unit_price !== undefined) {
      const price = Number(body.unit_price);
      if (isNaN(price) || price < 0) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PRICE',
              message: 'Unit price must be a non-negative number.',
              field: 'unit_price'
            }
          },
          { status: 400 }
        );
      }
      updateFields.push('unit_price = ?');
      params.push(price);
    }

    if (body.space_rate !== undefined) {
      const space = Number(body.space_rate);
      if (isNaN(space) || space <= 0) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_SPACE_RATE',
              message: 'Space consumption rate must be greater than zero.',
              field: 'space_rate'
            }
          },
          { status: 400 }
        );
      }
      updateFields.push('space_rate = ?');
      params.push(space);
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_CHANGES',
            message: 'No valid fields provided for update.'
          }
        },
        { status: 400 }
      );
    }

    params.push(productId);

    // Execute update statement with user session context (sets @current_user_id for audit logging)
    await withUserContext(session.user_id, session.role, async (conn) => {
      await conn.execute(
        `UPDATE products SET ${updateFields.join(', ')} WHERE product_id = ? AND is_deleted = 0`,
        params
      );
    });

    // Fetch updated row
    const updated = await queryOne<ProductRow>(
      'SELECT product_id, sku, product_name, category, unit_of_measure, CAST(unit_price AS DOUBLE) as unit_price, CAST(space_rate AS DOUBLE) as space_rate FROM products WHERE product_id = ?',
      [productId]
    );

    return NextResponse.json(
      {
        product_id: updated?.product_id,
        sku: updated?.sku,
        product_name: updated?.product_name,
        category: updated?.category,
        unit_of_measure: updated?.unit_of_measure,
        unit_price: Number(updated?.unit_price),
        space_rate: Number(updated?.space_rate),
        status: 'Active' as const
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error updating product:', error);

    // Database-level backstop for foreign key constraint errors
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ((error as { code: string }).code === 'ER_NO_REFERENCED_ROW_2' ||
       (error as { code: string }).code === 'ER_NO_REFERENCED_ROW')
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A referenced entity does not exist.'
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to update product. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
