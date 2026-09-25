/**
 * @file app/api/stores/route.ts
 * @description API route handler for regional station stores master reference data.
 * 
 * Endpoints:
 * - GET /api/stores: Lists all active destination station stores with associated cities.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A3
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

interface StoreDbRow {
  store_id: number;
  city_id: number;
  store_name: string;
  city_name: string;
  railway_station_name: string | null;
  contact_phone: string | null;
  created_at: string | Date;
}

/**
 * Handles GET requests to /api/stores.
 * Retrieves all active destination stores used for route assignments and employee home store links.
 * 
 * @param req - Incoming HTTP request
 * @returns JSON response containing items array of store records
 */
export async function GET(): Promise<NextResponse> {
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

    // RBAC: Any authenticated role can read store reference data
    if (!hasPermission(session.role, 'stores', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view stores.`
          }
        },
        { status: 403 }
      );
    }

    const sql = `
      SELECT 
        s.store_id,
        s.city_id,
        s.store_name,
        c.city_name,
        s.railway_station_name,
        s.contact_phone,
        s.created_at
      FROM stores s
      JOIN cities c ON s.city_id = c.city_id
      WHERE s.is_deleted = 0
      ORDER BY s.store_id ASC
    `;

    const rows = await query<StoreDbRow[]>(sql);

    const items = rows.map((s) => ({
      store_id: Number(s.store_id),
      city_id: Number(s.city_id),
      store_name: s.store_name,
      city_name: s.city_name,
      railway_station_name: s.railway_station_name || undefined,
      contact_phone: s.contact_phone || undefined,
      created_at:
        s.created_at instanceof Date
          ? s.created_at.toISOString()
          : new Date(s.created_at).toISOString()
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching stores:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve stores. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
