/**
 * @file app/api/reports/[type]/export/pdf/route.ts
 * @description API route handler for synchronous PDF report exports.
 * 
 * Endpoints:
 * - POST /api/reports/:type/export/pdf: Generates and streams standard PDF files directly to the client.
 * 
 * Supported Report Types:
 * - quarterly-sales
 * - most-ordered-items
 * - city-route-sales
 * - driver-assistant-hours
 * - truck-usage
 * - customer-history
 * 
 * Authority: Docs/03_architecture.md §7, §10, §11, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 5 (Desandu)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { applyRateLimit, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';
import {
  generatePdfReport,
  createPdfResponse,
  REPORT_TITLES,
  ReportType,
  ReportTableData,
  PdfExportOptions,
} from '@/lib/export';
import {
  validateReportFilters,
  fetchQuarterlySales,
  fetchMostOrderedItems,
  fetchCityRouteSales,
  fetchDriverAssistantHours,
  fetchTruckUsageMonthly,
  fetchCustomerOrderHistory,
} from '@/lib/reports';

/**
 * Route context interface matching Next.js dynamic route parameters.
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
 * Maximum number of data rows allowed in a single PDF export response.
 * Enforced to prevent runaway CPU time and memory consumption during PDF rendering.
 * Authority: Docs/03_architecture.md §11, §13.
 */
export const PDF_ROW_CAP = 1000;

/**
 * Extracts and merges filter parameters from both URL query parameters and JSON request body.
 *
 * @param req - Incoming HTTP request.
 * @returns Combined URLSearchParams instance containing all active filters.
 */
async function parseFilterParameters(req: Request): Promise<URLSearchParams> {
  const { searchParams } = new URL(req.url);
  const mergedParams = new URLSearchParams(searchParams);

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        for (const [key, value] of Object.entries(body)) {
          if (value !== undefined && value !== null) {
            mergedParams.set(key, String(value));
          }
        }
      }
    } catch {
      // Ignore JSON parse errors and proceed with query parameters if present
    }
  }

  return mergedParams;
}

/**
 * Handles POST requests to /api/reports/:type/export/pdf.
 * Validates report type, authenticates requester, applies RBAC checks, enforces per-user rate limiting,
 * validates filter parameters, runs report query, renders synchronous PDF, and returns a binary download stream.
 *
 * @param req - Incoming HTTP POST request containing optional JSON body or search parameters.
 * @param context - Dynamic route parameters containing report type.
 * @returns Binary application/pdf file stream with Content-Disposition attachment header.
 */
export async function POST(
  req: Request,
  context: RouteContext
): Promise<Response> {
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

    const reportType = type as AllowedReportType;

    // Authenticate user session
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

    // Rate limiting: 10 requests per 5 minutes per user
    const rateLimited = await applyRateLimit(
      req,
      RATE_LIMIT_PROFILES.REPORT_PDF_EXPORT,
      session.user_id
    );

    if (rateLimited) {
      return rateLimited;
    }

    // Parse and consolidate filter parameters from body and search params
    const filterParams = await parseFilterParameters(req);

    // Run shared filter validation
    const validation = validateReportFilters(reportType as ReportType, filterParams);
    if (!validation.valid) {
      return NextResponse.json(
        { error: { code: 'INVALID_PARAM', message: validation.error } },
        { status: validation.status ?? 400 }
      );
    }

    let headers: string[] = [];
    let rows: (string | number | null | undefined)[][] = [];
    let subtitle = '';
    let orientation: 'portrait' | 'landscape' = 'portrait';

    switch (reportType) {
      case 'quarterly-sales': {
        const yearParam = filterParams.get('year');
        const quarterParam = filterParams.get('quarter');
        const year = yearParam ? Number(yearParam) : undefined;
        const quarter = quarterParam ? Number(quarterParam) : undefined;

        subtitle = year
          ? quarter
            ? `Financial Year: ${year} | Quarter: Q${quarter}`
            : `Financial Year: ${year} | All Quarters`
          : 'All Recorded Financial Quarters';
        orientation = 'portrait';

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
        const yearParam = filterParams.get('year');
        const quarterParam = filterParams.get('quarter');

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

        subtitle = `Year: ${year} | Quarter: Q${quarter}`;
        orientation = 'portrait';

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
        const date_from = filterParams.get('date_from') || undefined;
        const date_to = filterParams.get('date_to') || undefined;
        const cityIdParam = filterParams.get('city_id');
        const city_id = cityIdParam ? Number(cityIdParam) : undefined;

        subtitle = `Date Range: ${date_from || 'Start'} to ${date_to || 'Present'}${city_id ? ` | City ID: ${city_id}` : ''}`;
        orientation = 'landscape';

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
        const week_start = filterParams.get('week_start');
        const role = (filterParams.get('role') as 'driver' | 'assistant') || undefined;

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

        subtitle = `Week Starting: ${week_start}${role ? ` | Role: ${role.toUpperCase()}` : ' | All Staff'}`;
        orientation = 'landscape';

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
        const yearParam = filterParams.get('year');
        const monthParam = filterParams.get('month');
        const year = yearParam ? Number(yearParam) : undefined;
        const month = monthParam ? Number(monthParam) : undefined;

        subtitle = year
          ? month
            ? `Year: ${year} | Month: ${String(month).padStart(2, '0')}`
            : `Year: ${year} | All Months`
          : 'All Operational History';
        orientation = 'landscape';

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
        const customerIdParam = filterParams.get('customer_id');

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
        const status = filterParams.get('status') || undefined;
        const date_from = filterParams.get('date_from') || undefined;
        const date_to = filterParams.get('date_to') || undefined;

        subtitle = `Customer ID: ${customerId}${status ? ` | Status: ${status}` : ''}${
          date_from || date_to ? ` (${date_from || 'Start'} to ${date_to || 'Present'})` : ''
        }`;
        orientation = 'landscape';

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

    // Enforce row cap to prevent excessive memory usage or timeout during synchronous rendering
    if (rows.length > PDF_ROW_CAP) {
      return NextResponse.json(
        {
          error: {
            code: 'EXPORT_TOO_LARGE',
            message: `Export exceeds the ${PDF_ROW_CAP.toLocaleString()} row limit for PDF generation. Narrow your filters and try again, or export as CSV.`,
          },
        },
        { status: 400 }
      );
    }

    const tableData: ReportTableData = {
      headers,
      rows,
    };

    const pdfOptions: PdfExportOptions = {
      title: REPORT_TITLES[reportType as ReportType],
      subtitle,
      generatedBy: session.email,
      orientation,
    };

    // Render PDF synchronously into memory buffer
    const pdfBuffer = generatePdfReport(tableData, pdfOptions);

    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `kandypack-${reportType}-${dateStamp}.pdf`;

    return createPdfResponse(pdfBuffer, filename);
  } catch (error) {
    console.error('[API /api/reports/:type/export/pdf] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate PDF export file. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
