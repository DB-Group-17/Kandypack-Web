/**
 * @file app/api/reports/city-route-sales/route.ts
 * @description API route handler for Report 3: City-wise and Route-wise Sales Breakdown.
 * 
 * Endpoints:
 * - GET /api/reports/city-route-sales: Details order count, product volume, and sales revenue by city and route.
 * 
 * Authority: Docs/03_architecture.md §7, Docs/04_database-schema-v4.md §7, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getCachedCityRouteSales, ReportResponse, CityRouteSalesRow } from '@/lib/reports';

/**
 * Handles GET requests to /api/reports/city-route-sales.
 * Queries v_city_route_sales or base tables with optional date_from, date_to, and city_id filters (cached via Redis for 1 hour).
 * 
 * @param req - Incoming HTTP request with optional ?date_from=, ?date_to=, ?city_id= query parameters
 * @returns JSON response containing items array and generated_at timestamp
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
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

    // RBAC: logistics_manager and system_administrator only for geographic sales reports
    if (!hasPermission(session.role, 'reports', 'read') || session.role === 'fleet_supervisor') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view geographic sales reports.`,
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('date_from') || undefined;
    const dateTo = searchParams.get('date_to') || undefined;
    const cityIdParam = searchParams.get('city_id');

    // Date validation
    if (dateFrom && Number.isNaN(Date.parse(dateFrom))) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PARAM',
            message: "Invalid 'date_from' parameter. Expected valid ISO date format (YYYY-MM-DD).",
            field: 'date_from',
          },
        },
        { status: 400 }
      );
    }

    if (dateTo && Number.isNaN(Date.parse(dateTo))) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PARAM',
            message: "Invalid 'date_to' parameter. Expected valid ISO date format (YYYY-MM-DD).",
            field: 'date_to',
          },
        },
        { status: 400 }
      );
    }

    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PARAM',
            message: "'date_from' cannot be later than 'date_to'.",
            field: 'date_from',
          },
        },
        { status: 400 }
      );
    }

    let city_id: number | undefined;
    if (cityIdParam !== null && cityIdParam !== '') {
      city_id = Number(cityIdParam);
      if (Number.isNaN(city_id) || city_id <= 0) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PARAM',
              message: "Invalid 'city_id' specified. Expected positive integer.",
              field: 'city_id',
            },
          },
          { status: 400 }
        );
      }
    }

    const items = await getCachedCityRouteSales({
      date_from: dateFrom,
      date_to: dateTo,
      city_id,
    });

    const responsePayload: ReportResponse<CityRouteSalesRow> = {
      items,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[API /api/reports/city-route-sales] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve city and route sales report data. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
