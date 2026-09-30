/**
 * @file app/api/reports/quarterly-sales/route.ts
 * @description API route handler for Report 1: Quarterly Sales (value and volume).
 * 
 * Endpoints:
 * - GET /api/reports/quarterly-sales: Aggregates total delivered sales volume and revenue by quarter and year.
 * 
 * Authority: Docs/03_architecture.md §7, Docs/04_database-schema-v4.md §7, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getCachedQuarterlySales, ReportResponse, QuarterlySalesRow } from '@/lib/reports';

/**
 * Handles GET requests to /api/reports/quarterly-sales.
 * Queries v_quarterly_sales (cached via Redis for 1 hour) with optional year and quarter filters.
 * 
 * @param req - Incoming HTTP request with optional ?year= and ?quarter= query parameters
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

    // RBAC: logistics_manager and system_administrator only for sales reports
    if (!hasPermission(session.role, 'reports', 'read') || session.role === 'fleet_supervisor') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view sales reports.`,
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const quarterParam = searchParams.get('quarter');

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

    let quarter: number | undefined;
    if (quarterParam !== null && quarterParam !== '') {
      quarter = Number(quarterParam);
      if (Number.isNaN(quarter) || quarter < 1 || quarter > 4) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PARAM',
              message: 'Invalid quarter specified. Quarter must be an integer between 1 and 4.',
              field: 'quarter',
            },
          },
          { status: 400 }
        );
      }
    }

    const items = await getCachedQuarterlySales(year, quarter);

    const responsePayload: ReportResponse<QuarterlySalesRow> = {
      items,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[API /api/reports/quarterly-sales] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve quarterly sales report data. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
