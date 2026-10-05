/**
 * @file app/api/reports/[type]/export/csv/route.ts
 * @description API route handler for synchronous CSV report exports.
 * 
 * Endpoints:
 * - GET /api/reports/:type/export/csv: Generates and streams standard RFC 4180 CSV files directly to the client.
 * 
 * Supported Report Types:
 * - quarterly-sales
 * - most-ordered-items
 * - city-route-sales
 * - driver-assistant-hours
 * - truck-usage
 * - customer-history
 * 
 * Authority: Docs/03_architecture.md §7, §11, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import {
  generateCsv,
  validateReportFilters,
  CSV_ROW_CAP,
  fetchQuarterlySales,
  fetchMostOrderedItems,
  fetchCityRouteSales,
  fetchDriverAssistantHours,
  fetchTruckUsageMonthly,
  fetchCustomerOrderHistory,
} from '@/lib/reports';

/**
 * Route context interface matching Next.js 15/16 async dynamic route parameters.
 */
interface RouteContext {
  params: Promise<{
    type: string;
  }>;
}

/** Supported report export types */
const ALLOWED_REPORT_TYPES = [
  'quarterly-sales',
  'most-ordered-items',
  'city-route-sales',
  'driver-assistant-hours',
  'truck-usage',
  'customer-history',
] as const;

type AllowedReportType = (typeof ALLOWED_REPORT_TYPES)[number];

/**
 * Handles GET requests to /api/reports/:type/export/csv.
 * Validates report type, authenticates requester, applies active filters, and returns a CSV file download.
 * 
 * @param req - Incoming HTTP request with report-specific filter query parameters
 * @param context - Dynamic route parameters containing report type
 * @returns Streamed CSV file with Content-Disposition attachment header
 */
export async function GET(
  req: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { type } = await context.params;

    // Validate report type
    if (!ALLOWED_REPORT_TYPES.includes(type as AllowedReportType)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REPORT_TYPE',
            message: `Invalid report type '${type}'. Valid types are: ${ALLOWED_REPORT_TYPES.join(', ')}.`,
          },
        },
        { status: 400 }
      );
    }

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

    // RBAC: logistics_manager and system_administrator have export permissions
    if (!hasPermission(session.role, 'reports', 'export')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to export reports.`,
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const reportType = type as AllowedReportType;

    // Run shared filter validation — consistent with JSON endpoint checks (reviewer issue #5).
    const validation = validateReportFilters(reportType, searchParams);
    if (!validation.valid) {
      return NextResponse.json(
        { error: { code: 'INVALID_PARAM', message: validation.error } },
        { status: validation.status ?? 400 }
      );
    }

    let headers: string[] = [];
    let rows: (string | number | null | undefined)[][] = [];

    switch (reportType) {
      case 'quarterly-sales': {
        const yearParam = searchParams.get('year');
        const quarterParam = searchParams.get('quarter');
        const year = yearParam ? Number(yearParam) : undefined;
        const quarter = quarterParam ? Number(quarterParam) : undefined;

        const data = await fetchQuarterlySales(year, quarter);
        headers = [
          'Financial Year',
          'Quarter',
          'Total Orders',
          'Volume (Units)',
          'Gross Sales Value (LKR)',
        ];
        rows = data.map((r) => [
          r.sales_year,
          `Q${r.sales_quarter}`,
          r.num_orders,
          r.total_volume.toFixed(2),
          r.total_value.toFixed(2),
        ]);
        break;
      }

      case 'most-ordered-items': {
        const yearParam = searchParams.get('year');
        const quarterParam = searchParams.get('quarter');

        if (!yearParam || !quarterParam) {
          return NextResponse.json(
            {
              error: {
                code: 'MISSING_PARAM',
                message: "Both 'year' and 'quarter' are required to export the most ordered items report.",
              },
            },
            { status: 400 }
          );
        }

        const year = Number(yearParam);
        const quarter = Number(quarterParam);
        const data = await fetchMostOrderedItems(year, quarter);

        headers = [
          'Rank',
          'Product ID',
          'Product Name',
          'Total Quantity (Units)',
          'Total Gross Value (LKR)',
        ];
        rows = data.map((r) => [
          r.quantity_rank,
          r.product_id,
          r.product_name,
          r.total_quantity.toFixed(2),
          r.total_value.toFixed(2),
        ]);
        break;
      }

      case 'city-route-sales': {
        const date_from = searchParams.get('date_from') || undefined;
        const date_to = searchParams.get('date_to') || undefined;
        const cityIdParam = searchParams.get('city_id');
        const city_id = cityIdParam ? Number(cityIdParam) : undefined;

        const data = await fetchCityRouteSales({ date_from, date_to, city_id });
        headers = [
          'City ID',
          'City Name',
          'Route ID',
          'Route Name',
          'Total Orders',
          'Total Volume (Units)',
          'Total Gross Value (LKR)',
        ];
        rows = data.map((r) => [
          r.city_id,
          r.city_name,
          r.route_id ?? 'N/A',
          r.route_name ?? 'Direct / Unassigned',
          r.num_orders,
          r.total_volume.toFixed(2),
          r.total_value.toFixed(2),
        ]);
        break;
      }

      case 'driver-assistant-hours': {
        const week_start = searchParams.get('week_start');
        const role = (searchParams.get('role') as 'driver' | 'assistant') || undefined;

        if (!week_start) {
          return NextResponse.json(
            {
              error: {
                code: 'MISSING_PARAM',
                message: "Parameter 'week_start' (YYYY-MM-DD) is required to export driver & assistant hours.",
              },
            },
            { status: 400 }
          );
        }

        const data = await fetchDriverAssistantHours({ week_start, role });
        headers = [
          'Role',
          'Person ID',
          'Full Name',
          'Week Starting',
          'Total Hours Worked',
          'Weekly Limit Hours',
          'Remaining Hours',
        ];
        rows = data.map((r) => [
          r.person_role,
          r.person_id,
          r.full_name,
          r.week_start,
          r.total_hours.toFixed(2),
          r.weekly_limit_hours.toFixed(2),
          r.remaining_hours.toFixed(2),
        ]);
        break;
      }

      case 'truck-usage': {
        const yearParam = searchParams.get('year');
        const monthParam = searchParams.get('month');
        const year = yearParam ? Number(yearParam) : undefined;
        const month = monthParam ? Number(monthParam) : undefined;

        const data = await fetchTruckUsageMonthly({ year, month });
        headers = [
          'Truck ID',
          'Plate Number',
          'Month',
          'Delivery Schedules',
          'Total In-Service Hours',
          'Distinct Routes Covered',
        ];
        rows = data.map((r) => [
          r.truck_id,
          r.plate_number,
          r.usage_month,
          r.num_schedules,
          r.total_hours.toFixed(2),
          r.distinct_routes_covered,
        ]);
        break;
      }

      case 'customer-history': {
        const customerIdParam = searchParams.get('customer_id');

        if (!customerIdParam) {
          return NextResponse.json(
            {
              error: {
                code: 'MISSING_PARAM',
                message: "Parameter 'customer_id' is required to export customer order history.",
              },
            },
            { status: 400 }
          );
        }

        const customerId = Number(customerIdParam);
        const status = searchParams.get('status') || undefined;
        const date_from = searchParams.get('date_from') || undefined;
        const date_to = searchParams.get('date_to') || undefined;

        const data = await fetchCustomerOrderHistory(customerId, { status, date_from, date_to });
        headers = [
          'Order ID',
          'Customer ID',
          'Customer Name',
          'Order Placed Date',
          'Expected Delivery Date',
          'Order Status',
          'Delivery Address',
          'Delivery Area',
          'Destination City',
          'Route Name',
          'Order Total Value (LKR)',
          'Space Required (Units)',
          'Delivery ID',
          'Delivery Status',
          'Delivered At',
          'Driver Name',
          'Assistant Name',
          'Truck Plate Number',
        ];
        rows = data.map((r) => [
          r.order_id,
          r.customer_id,
          r.customer_name,
          r.order_placed_at,
          r.expected_delivery_date,
          r.status,
          r.delivery_address,
          r.delivery_area,
          r.destination_city,
          r.route_name ?? 'N/A',
          r.total_value.toFixed(2),
          r.total_space_required.toFixed(2),
          r.delivery_id ?? 'N/A',
          r.delivery_status ?? 'N/A',
          r.delivered_at ?? 'N/A',
          r.driver_name ?? 'N/A',
          r.assistant_name ?? 'N/A',
          r.truck_plate ?? 'N/A',
        ]);
        break;
      }
    }

    // Enforce row cap to prevent exporting arbitrarily large datasets.
    // Docs/03_architecture.md §11 and §13 require a maximum size for synchronous exports.
    if (rows.length > CSV_ROW_CAP) {
      return NextResponse.json(
        {
          error: {
            code: 'EXPORT_TOO_LARGE',
            message: `Export exceeds the ${CSV_ROW_CAP.toLocaleString()} row limit. Narrow your filters and try again.`,
          },
        },
        { status: 400 }
      );
    }

    const csvContent = generateCsv(headers, rows);
    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `kandypack-${reportType}-${dateStamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[API /api/reports/:type/export/csv] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate CSV export file. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
