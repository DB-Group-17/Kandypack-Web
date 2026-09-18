/**
 * @file app/api/cities/route.ts
 * @description API route handler for Sri Lankan geographic cities master reference data.
 * 
 * Endpoints:
 * - GET /api/cities: Lists all registered origin and destination station cities.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A3
 * Copy Source: Docs/07_content-copy.md §/admin/master-data
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

interface CityDbRow {
  city_id: number;
  city_name: string;
  is_origin: number;
  is_destination: number;
  store_name: string | null;
  created_at: string | Date;
}

/**
 * Handles GET requests to /api/cities.
 * Returns geographic master data for central Kandy origin and regional destination hubs.
 * 
 * @param req - Incoming HTTP request
 * @returns JSON response containing items array of cities
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

    // RBAC: All authenticated roles can read city reference data
    if (!hasPermission(session.role, 'cities', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view cities.`
          }
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const destinationOnly = searchParams.get('destination_only') === 'true';

    let sql = `
      SELECT 
        c.city_id,
        c.city_name,
        c.is_origin,
        c.is_destination,
        s.store_name,
        c.created_at
      FROM cities c
      LEFT JOIN stores s ON c.city_id = s.city_id AND s.is_deleted = 0
    `;

    if (destinationOnly) {
      sql += ` WHERE c.is_destination = 1`;
    }

    sql += ` ORDER BY c.city_id ASC`;

    const rows = await query<CityDbRow[]>(sql);

    const items = rows.map((c) => ({
      city_id: Number(c.city_id),
      city_name: c.city_name,
      is_origin: Boolean(c.is_origin),
      is_destination: Boolean(c.is_destination),
      store_name: c.store_name || undefined,
      status: 'Active' as const,
      created_at:
        c.created_at instanceof Date
          ? c.created_at.toISOString()
          : new Date(c.created_at).toISOString()
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching cities:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve cities. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
