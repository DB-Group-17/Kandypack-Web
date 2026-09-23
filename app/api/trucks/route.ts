/**
 * @file app/api/trucks/route.ts
 * @description GET /api/trucks — returns all non-deleted truck records.
 *
 * Owner: Member 3 (Fleet & Deliveries)
 * Auth: Any authenticated role can read trucks (fleet_supervisor and system_administrator
 *       have full read/write; all other authenticated roles have read-only access per the
 *       PERMISSION_MATRIX in lib/rbac.ts).
 *
 * Data flow:
 *   1. Extract and verify JWT session from cookie via getSession().
 *   2. Check the caller has at least read access on the 'trucks' resource.
 *   3. Query trucks table, excluding soft-deleted rows.
 *   4. Return { items: TruckItem[] }.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A7 GET /api/trucks
 *   - Docs/03_architecture.md §7 Fleet & Truck Scheduling
 *   - types/fleet.ts TruckItem
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import type { TruckItem } from '@/types/fleet';

/**
 * Row shape returned directly from MySQL for the trucks query.
 * BIGINT columns come back as strings from mysql2; we cast them to number on
 * the way out so the DTO matches the TruckItem interface exactly.
 */
interface TruckRow {
  truck_id: string | number;
  plate_number: string;
  capacity_kg: string | number | null;
  home_store_id: string | number | null;
}

/**
 * GET /api/trucks
 *
 * Returns all active (non-deleted) trucks in the fleet.
 *
 * @returns 200 { items: TruckItem[] } on success
 * @returns 401 if the request carries no valid JWT session
 * @returns 403 if the authenticated role lacks read access on trucks
 * @returns 500 on unexpected database or server error
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Step 1 — Authenticate the caller
    const session = await getSession();

    // requirePermission throws ForbiddenError (mapped to 401/403 below)
    // if session is null or role lacks the requested permission.
    requirePermission(session, 'trucks', 'read');

    // Step 2 — Fetch all non-deleted trucks ordered by plate for stable display
    const rows = await query<TruckRow[]>(
      `SELECT truck_id, plate_number, capacity_kg, home_store_id
         FROM trucks
        WHERE is_deleted = 0
        ORDER BY plate_number ASC`
    );

    // Step 3 — Normalise BIGINT/DECIMAL values from mysql2 string representation
    const items: TruckItem[] = rows.map((row) => ({
      truck_id: Number(row.truck_id),
      plate_number: row.plate_number,
      capacity_kg: row.capacity_kg !== null ? Number(row.capacity_kg) : 0,
      home_store_id: row.home_store_id !== null ? Number(row.home_store_id) : 0,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    // ForbiddenError carries a .status of 403; unauthenticated yields 401
    if (err instanceof Error && 'status' in err) {
      const status = (err as { status: number }).status;
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status }
      );
    }

    console.error('[GET /api/trucks]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
