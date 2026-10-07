/**
 * @file app/api/reports/truck-usage/route.ts
 * @description API route handler for Report 5: Monthly Truck Usage Analysis.
 * 
 * Endpoints:
 * - GET /api/reports/truck-usage: Analyzes vehicle fleet utilization, total operational hours, and routes served per month.
 * 
 * Authority: Docs/03_architecture.md §7, Docs/04_database-schema-v4.md §7, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getCachedTruckUsageMonthly, ReportResponse, TruckUsageMonthlyRow } from '@/lib/reports';

/**
 * Handles GET requests to /api/reports/truck-usage.
 * Queries v_truck_usage_monthly with optional ?year= and ?month= filters (cached via Redis for 1 hour).
 * 
 * @param req - Incoming HTTP request with optional ?year= and ?month= query parameters
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

    // RBAC: fleet_supervisor, logistics_manager, and system_administrator are authorized
    if (!hasPermission(session.role, 'reports', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view reports.`,
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    let year: number | undefined;
    if (yearParam !== null && yearParam !== '') {
      year = Number(yearParam);
      if (Number.isNaN(year) || year < 2000 || year > 2100) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PARAM',
              message: 'Invalid year specified. Please provide a valid 4-digit year.',
              field: 'year',
            },
          },
          { status: 400 }
        );
      }
    }

    let month: number | undefined;
    if (monthParam !== null && monthParam !== '') {
      month = Number(monthParam);
      if (Number.isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PARAM',
              message: 'Invalid month specified. Month must be an integer between 1 and 12.',
              field: 'month',
            },
          },
          { status: 400 }
        );
      }
    }

    const items = await getCachedTruckUsageMonthly({
      year,
      month,
    });

    const responsePayload: ReportResponse<TruckUsageMonthlyRow> = {
      items,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[API /api/reports/truck-usage] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve truck usage report data. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
