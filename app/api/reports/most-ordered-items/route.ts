/**
 * @file app/api/reports/most-ordered-items/route.ts
 * @description API route handler for Report 2: Most Ordered Items in a Given Quarter.
 * 
 * Endpoints:
 * - GET /api/reports/most-ordered-items: Ranks products by total ordered volume and revenue in a specified quarter.
 * 
 * Authority: Docs/03_architecture.md §7, Docs/04_database-schema-v4.md §7, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getCachedMostOrderedItems, ReportResponse, MostOrderedItemRow } from '@/lib/reports';

/**
 * Handles GET requests to /api/reports/most-ordered-items.
 * Queries v_most_ordered_items with mandatory ?year= and ?quarter= filters (cached via Redis for 1 hour).
 * 
 * @param req - Incoming HTTP request with ?year= and ?quarter= query parameters
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

    // RBAC: logistics_manager and system_administrator only for product sales reports
    if (!hasPermission(session.role, 'reports', 'read') || session.role === 'fleet_supervisor') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view product sales reports.`,
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const quarterParam = searchParams.get('quarter');

    if (!yearParam || !quarterParam) {
      return NextResponse.json(
        {
          error: {
            code: 'MISSING_PARAM',
            message: "Both 'year' and 'quarter' are required parameters for the most ordered items report.",
          },
        },
        { status: 400 }
      );
    }

    const year = Number(yearParam);
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

    const quarter = Number(quarterParam);
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

    const items = await getCachedMostOrderedItems(year, quarter);

    const responsePayload: ReportResponse<MostOrderedItemRow> = {
      items,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[API /api/reports/most-ordered-items] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve most ordered items report data. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
