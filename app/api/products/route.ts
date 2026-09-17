/**
 * @file app/api/products/route.ts
 * @description API route handler for product catalog master data management.
 * 
 * Endpoints:
 * - GET /api/products: Lists all active products with optional search and category filters.
 * - POST /api/products: Registers a new commercial product with SKU uniqueness and dimension constraints.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A3
 * Copy Source: Docs/07_content-copy.md §/admin/master-data
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { query, withUserContext, QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Interface representing a product record returned from MySQL.
 */
interface ProductRow {
  product_id: number;
  sku: string;
  product_name: string;
  category: string | null;
  unit_of_measure: string;
  unit_price: number;
  space_rate: number;
  created_at: string | Date;
  updated_at: string | Date;
}

/**
 * Handles GET requests to /api/products.
 * Retrieves all active (non-deleted) products with optional filtering by search query and category.
 * 
 * @param req - Incoming HTTP request with optional URL search parameters
 * @returns JSON response containing items array of products or error object
 */
export async function GET(req: Request): Promise<NextResponse> {
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

    // RBAC: All authenticated roles possess read capability on products
    if (!hasPermission(session.role, 'products', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view products.`
          }
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const searchParam = searchParams.get('search')?.trim();
    const categoryParam = searchParams.get('category')?.trim();

    let sql = `
      SELECT 
        product_id,
        sku,
        product_name,
        category,
        unit_of_measure,
        CAST(unit_price AS DOUBLE) AS unit_price,
        CAST(space_rate AS DOUBLE) AS space_rate,
        created_at,
        updated_at
      FROM products
      WHERE is_deleted = 0
    `;
    const params: QueryParam[] = [];

    // Filter by text search across product name or SKU code
    if (searchParam) {
      sql += ` AND (product_name LIKE ? OR sku LIKE ?)`;
      params.push(`%${searchParam}%`, `%${searchParam}%`);
    }

    // Filter by product category if specific category is selected
    if (categoryParam && categoryParam !== 'All') {
      sql += ` AND category = ?`;
      params.push(categoryParam);
    }

    sql += ` ORDER BY product_name ASC`;

    const rows = await query<ProductRow[]>(sql, params);

    // Format products into API response contract
    const items = rows.map((p) => ({
      product_id: Number(p.product_id),
      sku: p.sku,
      product_name: p.product_name,
      category: p.category || 'General',
      unit_of_measure: p.unit_of_measure,
      unit_price: Number(p.unit_price),
      space_rate: Number(p.space_rate),
      status: 'Active' as const,
      created_at:
        p.created_at instanceof Date
          ? p.created_at.toISOString()
          : new Date(p.created_at).toISOString(),
      updated_at:
        p.updated_at instanceof Date
          ? p.updated_at.toISOString()
          : new Date(p.updated_at).toISOString()
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve products. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests to /api/products.
 * Creates a new product catalog item, enforcing SKU uniqueness and dimension constraints.
 * 
 * @param req - Incoming HTTP request with JSON payload conforming to NewProductPayload
 * @returns JSON response containing the created product record with HTTP 201, or error object
 */
export async function POST(req: Request): Promise<NextResponse> {
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

    // RBAC: Only system_administrator can create products
    if (!hasPermission(session.role, 'products', 'create')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to create products.`
          }
        },
        { status: 403 }
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

    const {
      sku,
      product_name,
      category,
      unit_of_measure,
      unit_price,
      space_rate
    } = body;

    // 1. Validate mandatory fields
    if (!sku || typeof sku !== 'string' || !sku.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'SKU is required.',
            field: 'sku'
          }
        },
        { status: 400 }
      );
    }

    if (!product_name || typeof product_name !== 'string' || !product_name.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Product name is required.',
            field: 'product_name'
          }
        },
        { status: 400 }
      );
    }

    const priceNum = Number(unit_price);
    if (isNaN(priceNum) || priceNum < 0) {
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

    const spaceNum = Number(space_rate);
    if (isNaN(spaceNum) || spaceNum <= 0) {
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

    const cleanSku = sku.trim().toUpperCase();
    const cleanName = product_name.trim();
    const cleanCategory = category ? String(category).trim() : 'General';
    const cleanUom = unit_of_measure ? String(unit_of_measure).trim() : 'unit';

    // 2. Insert into products table within user session context (sets @current_user_id for audit logging)
    const newProductId = await withUserContext(session.user_id, session.role, async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO products 
          (sku, product_name, category, unit_of_measure, unit_price, space_rate)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cleanSku, cleanName, cleanCategory, cleanUom, priceNum, spaceNum]
      );
      return (result as { insertId: number }).insertId;
    });

    const createdProduct = {
      product_id: newProductId,
      sku: cleanSku,
      product_name: cleanName,
      category: cleanCategory,
      unit_of_measure: cleanUom,
      unit_price: priceNum,
      space_rate: spaceNum,
      status: 'Active' as const
    };

    return NextResponse.json(createdProduct, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating product:', error);

    // Handle MySQL unique constraint violation on SKU (uq_products_sku / ER_DUP_ENTRY)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'ER_DUP_ENTRY'
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_SKU',
            message: 'A product with this SKU already exists.',
            field: 'sku'
          }
        },
        { status: 409 }
      );
    }

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
          message: 'Failed to create product. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
