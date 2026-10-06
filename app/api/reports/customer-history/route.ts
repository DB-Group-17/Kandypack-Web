/**
 * @file app/api/reports/customer-history/route.ts
 * @description API route handler for Report 6: Customer Order History with Delivery Details.
 * 
 * Endpoints:
 * - GET /api/reports/customer-history: Complete audit and fulfillment trail of orders for a commercial customer.
 * 
 * Authority: Docs/03_architecture.md §7, Docs/04_database-schema-v4.md §7, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getCachedCustomerOrderHistory, ReportResponse, CustomerOrderHistoryRow } from '@/lib/reports';

/**
 * Handles GET requests to /api/reports/customer-history.
 * Queries v_customer_order_history with mandatory ?customer_id= and optional ?status=, ?date_from=, ?date_to= filters (cached via Redis for 1 hour).
 * 
 * @param req - Incoming HTTP request with ?customer_id= and optional query parameters
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

    // RBAC: logistics_manager and system_administrator only for customer history
    if (!hasPermission(session.role, 'reports', 'read') || session.role === 'fleet_supervisor') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view customer history reports.`,
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const customerIdParam = searchParams.get('customer_id');
    const statusParam = searchParams.get('status') || undefined;
    const dateFrom = searchParams.get('date_from') || undefined;
    const dateTo = searchParams.get('date_to') || undefined;

    if (!customerIdParam) {
      return NextResponse.json(
        {
          error: {
            code: 'MISSING_PARAM',
            message: "Parameter 'customer_id' is required for the customer order history report.",
            field: 'customer_id',
          },
        },
        { status: 400 }
      );
    }

    const customerId = Number(customerIdParam);
    if (Number.isNaN(customerId) || customerId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PARAM',
            message: "Invalid 'customer_id' specified. Expected positive integer.",
            field: 'customer_id',
          },
        },
        { status: 400 }
      );
    }

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

    const items = await getCachedCustomerOrderHistory(customerId, {
      status: statusParam,
      date_from: dateFrom,
      date_to: dateTo,
    });

    const responsePayload: ReportResponse<CustomerOrderHistoryRow> = {
      items,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[API /api/reports/customer-history] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve customer order history report data. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
