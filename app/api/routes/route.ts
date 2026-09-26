/**
 * @file app/api/routes/route.ts
 * @description API route handler for delivery routes and coverage areas master data.
 * 
 * Endpoints:
 * - GET /api/routes: Lists all store-linked delivery routes and their mapped coverage areas.
 * - POST /api/routes: Creates a new delivery route and its coverage areas atomically.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A3
 * Copy Source: Docs/07_content-copy.md §/admin/master-data
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { query, queryOne, withUserContext, QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

interface RouteDbRow {
  route_id: number;
  store_id: number;
  store_name: string;
  route_name: string;
  coverage_description: string | null;
  max_delivery_time_hours: number;
  created_at: string | Date;
}

interface CoverageDbRow {
  coverage_id: number;
  route_id: number;
  city_id: number;
  city_name: string;
  area_name: string;
}

/**
 * Handles GET requests to /api/routes.
 * Retrieves active routes with their child coverage area associations.
 * 
 * @param req - Incoming HTTP request with optional store_id or city_id search params
 * @returns JSON response containing items array of routes
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

    // RBAC: All authenticated roles can read routes
    if (!hasPermission(session.role, 'routes', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view routes.`
          }
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const storeIdParam = searchParams.get('store_id');
    const cityIdParam = searchParams.get('city_id');
    const searchParam = searchParams.get('search')?.trim();

    let sql = `
      SELECT 
        r.route_id,
        r.store_id,
        s.store_name,
        r.route_name,
        r.coverage_description,
        CAST(r.max_delivery_time_hours AS DOUBLE) AS max_delivery_time_hours,
        r.created_at
      FROM routes r
      JOIN stores s ON r.store_id = s.store_id
      WHERE r.is_deleted = 0
    `;
    const params: QueryParam[] = [];

    if (storeIdParam && !isNaN(Number(storeIdParam))) {
      sql += ` AND r.store_id = ?`;
      params.push(Number(storeIdParam));
    }

    if (cityIdParam && !isNaN(Number(cityIdParam))) {
      sql += ` AND EXISTS (
        SELECT 1
        FROM route_coverage_areas rca
        WHERE rca.route_id = r.route_id
          AND rca.city_id = ?
      )`;
      params.push(Number(cityIdParam));
    }

    if (searchParam) {
      sql += ` AND (r.route_name LIKE ? OR s.store_name LIKE ?)`;
      params.push(`%${searchParam}%`, `%${searchParam}%`);
    }

    sql += ` ORDER BY r.route_id ASC`;

    const routes = await query<RouteDbRow[]>(sql, params);

    if (routes.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // Fetch coverage areas for the retrieved routes
    const routeIds = routes.map((r) => r.route_id);
    const placeholders = routeIds.map(() => '?').join(', ');
    
    let coverageSql = `
      SELECT 
        rca.coverage_id,
        rca.route_id,
        rca.city_id,
        c.city_name,
        rca.area_name
      FROM route_coverage_areas rca
      JOIN cities c ON rca.city_id = c.city_id
      WHERE rca.route_id IN (${placeholders})
    `;
    const coverageParams: QueryParam[] = [...routeIds];

    if (cityIdParam && !isNaN(Number(cityIdParam))) {
      coverageSql += ` AND rca.city_id = ?`;
      coverageParams.push(Number(cityIdParam));
    }

    coverageSql += ` ORDER BY rca.coverage_id ASC`;

    const coverageRows = await query<CoverageDbRow[]>(coverageSql, coverageParams);

    // Group coverage areas by route_id
    const coverageMap = new Map<number, CoverageDbRow[]>();
    for (const ca of coverageRows) {
      const list = coverageMap.get(ca.route_id) || [];
      list.push(ca);
      coverageMap.set(ca.route_id, list);
    }

    const items = routes.map((r) => {
      const areas = coverageMap.get(r.route_id) || [];
      return {
        route_id: Number(r.route_id),
        store_id: Number(r.store_id),
        store_name: r.store_name,
        route_name: r.route_name,
        coverage_description: r.coverage_description || undefined,
        max_delivery_time_hours: Number(r.max_delivery_time_hours),
        status: 'Active' as const,
        coverage_areas: areas.map((a) => ({
          coverage_id: Number(a.coverage_id),
          route_id: Number(a.route_id),
          city_id: Number(a.city_id),
          city_name: a.city_name,
          area_name: a.area_name
        })),
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : new Date(r.created_at).toISOString()
      };
    });

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching routes:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve routes. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests to /api/routes.
 * Creates a new route record and bulk-inserts coverage areas within an atomic transaction.
 * 
 * @param req - Incoming HTTP request with JSON payload conforming to NewRoutePayload
 * @returns JSON response with created route record (HTTP 201) or error object
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

    // RBAC: system_administrator and logistics_manager can create routes
    if (!hasPermission(session.role, 'routes', 'create')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to create delivery routes.`
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
      store_id,
      route_name,
      coverage_description,
      max_delivery_time_hours,
      coverage_areas
    } = body;

    // 1. Validate mandatory fields
    if (!store_id || isNaN(Number(store_id))) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Assigned store station is required.',
            field: 'store_id'
          }
        },
        { status: 400 }
      );
    }

    if (!route_name || typeof route_name !== 'string' || !route_name.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Route name is required.',
            field: 'route_name'
          }
        },
        { status: 400 }
      );
    }

    const maxHours = Number(max_delivery_time_hours);
    if (isNaN(maxHours) || maxHours <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TIME',
            message: 'Maximum delivery turnaround time must be greater than 0 hours.',
            field: 'max_delivery_time_hours'
          }
        },
        { status: 400 }
      );
    }

    // 2. Validate and clean coverage areas (Should Fix 5: trim names first, require at least one valid area)
    if (!Array.isArray(coverage_areas) || coverage_areas.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one coverage area is required for this route.',
            field: 'coverage_areas'
          }
        },
        { status: 400 }
      );
    }

    const validatedAreas: Array<{ city_id: number; area_name: string }> = [];
    for (const area of coverage_areas) {
      if (!area || typeof area !== 'object') continue;
      const rawName = typeof (area as { area_name?: unknown }).area_name === 'string'
        ? (area as { area_name: string }).area_name.trim()
        : '';

      if (!rawName) {
        continue;
      }

      const rawCityId = Number((area as { city_id?: unknown }).city_id);
      if (isNaN(rawCityId) || rawCityId <= 0) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid city ID specified in coverage areas.',
              field: 'coverage_areas'
            }
          },
          { status: 400 }
        );
      }

      validatedAreas.push({ city_id: rawCityId, area_name: rawName });
    }

    if (validatedAreas.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one valid coverage area with a non-blank name is required.',
            field: 'coverage_areas'
          }
        },
        { status: 400 }
      );
    }

    // 3. Verify store exists and is active
    const store = await queryOne<{ store_id: number; store_name: string; city_id: number }>(
      'SELECT store_id, store_name, city_id FROM stores WHERE store_id = ? AND is_deleted = 0',
      [Number(store_id)]
    );

    if (!store) {
      return NextResponse.json(
        {
          error: {
            code: 'STORE_NOT_FOUND',
            message: 'The selected store does not exist.',
            field: 'store_id'
          }
        },
        { status: 400 }
      );
    }

    // 4. Verify all referenced city IDs exist in the database (Must Fix 3)
    const uniqueCityIds = Array.from(new Set(validatedAreas.map((a) => a.city_id)));
    const cityPlaceholders = uniqueCityIds.map(() => '?').join(', ');
    const existingCities = await query<{ city_id: number }[]>(
      `SELECT city_id FROM cities WHERE city_id IN (${cityPlaceholders})`,
      uniqueCityIds
    );
    const existingCitySet = new Set(existingCities.map((c) => Number(c.city_id)));

    const invalidCity = uniqueCityIds.find((id) => !existingCitySet.has(id));
    if (invalidCity !== undefined) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `Coverage area references a city ID (${invalidCity}) that does not exist.`,
            field: 'coverage_areas'
          }
        },
        { status: 400 }
      );
    }

    const cleanRouteName = route_name.trim();
    const cleanDesc = coverage_description ? String(coverage_description).trim() : null;

    // 5. Atomically insert route and coverage areas within user context connection (Must Fix 2)
    const created = await withUserContext(session.user_id, session.role, async (connection) => {
      await connection.beginTransaction();
      try {
        // Insert main route row
        const [routeResult] = await connection.execute(
          `INSERT INTO routes (store_id, route_name, coverage_description, max_delivery_time_hours)
           VALUES (?, ?, ?, ?)`,
          [store.store_id, cleanRouteName, cleanDesc, maxHours]
        );

        const newRouteId = (routeResult as { insertId: number }).insertId;

        // Insert coverage areas
        const createdAreas: Array<{
          coverage_id: number;
          route_id: number;
          city_id: number;
          area_name: string;
        }> = [];

        for (const area of validatedAreas) {
          const [areaResult] = await connection.execute(
            `INSERT INTO route_coverage_areas (route_id, city_id, area_name)
             VALUES (?, ?, ?)`,
            [newRouteId, area.city_id, area.area_name]
          );

          createdAreas.push({
            coverage_id: (areaResult as { insertId: number }).insertId,
            route_id: newRouteId,
            city_id: area.city_id,
            area_name: area.area_name
          });
        }

        await connection.commit();

        return {
          route_id: newRouteId,
          store_id: store.store_id,
          store_name: store.store_name,
          route_name: cleanRouteName,
          coverage_description: cleanDesc || undefined,
          max_delivery_time_hours: maxHours,
          status: 'Active' as const,
          coverage_areas: createdAreas
        };
      } catch (txError) {
        await connection.rollback();
        throw txError;
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating route:', error);

    // Catch duplicate coverage area in the same city (uq_coverage_area_per_city)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'ER_DUP_ENTRY'
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_AREA',
            message: 'One of the specified coverage areas is already assigned to a route in this city.',
            field: 'coverage_areas'
          }
        },
        { status: 409 }
      );
    }

    // Database-level backstop for foreign key constraint violation (e.g. invalid store_id or city_id)
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
            message: 'A referenced store or city does not exist.',
            field: 'coverage_areas'
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create route. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
