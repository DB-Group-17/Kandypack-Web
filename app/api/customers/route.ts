/**
 * @file app/api/customers/route.ts
 * @description API route handler for customer directory master data.
 * 
 * Endpoints:
 * - GET /api/customers: Lists active customers with city information and search filtering.
 * - POST /api/customers: Registers a new wholesale or retail commercial client.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A3
 * Copy Source: Docs/07_content-copy.md §/admin/master-data
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { query, execute, queryOne, QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

interface CustomerDbRow {
  customer_id: number;
  customer_name: string;
  customer_type: 'retail' | 'wholesale';
  phone: string;
  email: string | null;
  registered_city_id: number;
  registered_city_name: string;
  address_line: string | null;
  created_at: string | Date;
}

/**
 * Handles GET requests to /api/customers.
 * Retrieves customers with city names, supporting text search by name or contact phone.
 * 
 * @param req - Incoming HTTP request with optional search, city_id, or customer_type query params
 * @returns JSON response containing items array and total count
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

    // RBAC: order_entry_clerk, logistics_manager, system_administrator
    if (!hasPermission(session.role, 'customers', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view customer accounts.`
          }
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const searchParam = searchParams.get('search')?.trim();
    const cityIdParam = searchParams.get('city_id');
    const typeParam = searchParams.get('type')?.trim();

    let sql = `
      SELECT 
        c.customer_id,
        c.customer_name,
        c.customer_type,
        c.phone,
        c.email,
        c.registered_city_id,
        ci.city_name AS registered_city_name,
        c.address_line,
        c.created_at
      FROM customers c
      LEFT JOIN cities ci ON c.registered_city_id = ci.city_id
      WHERE c.is_deleted = 0
    `;
    const params: QueryParam[] = [];

    if (searchParam) {
      sql += ` AND (c.customer_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`;
      params.push(`%${searchParam}%`, `%${searchParam}%`, `%${searchParam}%`);
    }

    if (cityIdParam && !isNaN(Number(cityIdParam))) {
      sql += ` AND c.registered_city_id = ?`;
      params.push(Number(cityIdParam));
    }

    if (typeParam && (typeParam === 'retail' || typeParam === 'wholesale')) {
      sql += ` AND c.customer_type = ?`;
      params.push(typeParam);
    }

    sql += ` ORDER BY c.customer_name ASC`;

    const rows = await query<CustomerDbRow[]>(sql, params);

    const items = rows.map((c) => ({
      customer_id: Number(c.customer_id),
      customer_name: c.customer_name,
      customer_type: c.customer_type,
      phone: c.phone,
      email: c.email || undefined,
      registered_city_id: Number(c.registered_city_id),
      registered_city_name: c.registered_city_name || 'Unassigned',
      address_line: c.address_line || '',
      status: 'Active' as const,
      created_at:
        c.created_at instanceof Date
          ? c.created_at.toISOString()
          : new Date(c.created_at).toISOString()
    }));

    return NextResponse.json({ items, total: items.length }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve customers. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests to /api/customers.
 * Creates a new client account with category validation and destination city assignment.
 * 
 * @param req - Incoming HTTP request with JSON body conforming to NewCustomerPayload
 * @returns JSON response with created customer record (HTTP 201) or error object
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

    // RBAC: order_entry_clerk, system_administrator
    if (!hasPermission(session.role, 'customers', 'create')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to register new customers.`
          }
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      customer_name,
      customer_type,
      phone,
      email,
      registered_city_id,
      address_line
    } = body;

    // 1. Validate required fields
    if (!customer_name || typeof customer_name !== 'string' || !customer_name.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Customer name is required.',
            field: 'customer_name'
          }
        },
        { status: 400 }
      );
    }

    if (!customer_type || (customer_type !== 'retail' && customer_type !== 'wholesale')) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CUSTOMER_TYPE',
            message: "Customer type must be either 'retail' or 'wholesale'.",
            field: 'customer_type'
          }
        },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Primary phone number is required.',
            field: 'phone'
          }
        },
        { status: 400 }
      );
    }

    const cityId = registered_city_id ? Number(registered_city_id) : null;
    let cityName = 'Unassigned';

    if (cityId) {
      const city = await queryOne<{ city_id: number; city_name: string }>(
        'SELECT city_id, city_name FROM cities WHERE city_id = ?',
        [cityId]
      );
      if (city) {
        cityName = city.city_name;
      }
    }

    const cleanName = customer_name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email ? String(email).trim() : null;
    const cleanAddress = address_line ? String(address_line).trim() : '';

    // 2. Insert into customers table
    const result = await execute(
      `INSERT INTO customers 
        (customer_name, customer_type, phone, email, registered_city_id, address_line)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cleanName, customer_type, cleanPhone, cleanEmail, cityId, cleanAddress]
    );

    const newCustomerId = result.insertId;

    const createdCustomer = {
      customer_id: newCustomerId,
      customer_name: cleanName,
      customer_type,
      phone: cleanPhone,
      email: cleanEmail || undefined,
      registered_city_id: cityId || 0,
      registered_city_name: cityName,
      address_line: cleanAddress,
      status: 'Active' as const,
      created_at: new Date().toISOString()
    };

    return NextResponse.json(createdCustomer, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating customer:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create customer account. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
