/**
 * @file tests/api/report-pdf-export.test.ts
 * @description API route tests for POST /api/reports/:type/export/pdf.
 *
 * Verifies that:
 * - Unauthenticated requests return HTTP 401 UNAUTHORIZED.
 * - Roles without reports:export permission return HTTP 403 FORBIDDEN.
 * - Rate limiting returns HTTP 429 RATE_LIMITED with Retry-After header.
 * - Invalid report types return HTTP 400 INVALID_REPORT_TYPE.
 * - Missing or invalid filter parameters return HTTP 400 with descriptive error messages.
 * - Datasets exceeding PDF_ROW_CAP return HTTP 400 EXPORT_TOO_LARGE.
 * - Successful exports return HTTP 200 with Content-Type: application/pdf and Content-Disposition: attachment.
 * - Output binary stream is valid PDF (starts with %PDF- header magic bytes).
 * - All 6 management report types render cleanly in portrait or landscape orientations.
 * - Supports both JSON request bodies and URL query parameters.
 * - Empty result sets produce valid PDFs without crashing.
 *
 * Authority: Docs/03_architecture.md §11, §16, Docs/05_api-and-pages.md §A9.
 * Owner: Member 5 (Desandu).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, PDF_ROW_CAP } from '@/app/api/reports/[type]/export/pdf/route';
import type { SessionUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/redis';
import * as reportsModule from '@/lib/reports';

let mockSession: SessionUser | null = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@kandypack.lk',
  role: 'system_administrator',
  store_id: null,
  display_name: 'System Administrator',
};

// ---------------------------------------------------------------------------
// 1. Mock lib/auth for dynamic test session switching
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)),
  };
});

// ---------------------------------------------------------------------------
// 2. Mock lib/redis for deterministic, sub-second rate-limit checking
// ---------------------------------------------------------------------------
vi.mock('@/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/redis')>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetTimeMs: Date.now() + 5 * 60 * 1000,
    }),
  };
});

// ---------------------------------------------------------------------------
// 3. Mock database fetch functions in lib/reports, keeping real validation
// ---------------------------------------------------------------------------
vi.mock('@/lib/reports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reports')>();
  return {
    ...actual,
    fetchQuarterlySales: vi.fn().mockResolvedValue([
      {
        sales_year: 2026,
        sales_quarter: 1,
        num_orders: 142,
        total_volume: 1840.5,
        total_value: 3250000.0,
      },
      {
        sales_year: 2026,
        sales_quarter: 2,
        num_orders: 185,
        total_volume: 2410.0,
        total_value: 4120000.0,
      },
    ]),
    fetchMostOrderedItems: vi.fn().mockResolvedValue([
      {
        quantity_rank: 1,
        product_id: 101,
        product_name: 'Sunlight Soap 100g',
        total_quantity: 4500,
        total_value: 900000,
      },
      {
        quantity_rank: 2,
        product_id: 102,
        product_name: 'Munchee Super Cream Cracker',
        total_quantity: 3200,
        total_value: 640000,
      },
    ]),
    fetchCityRouteSales: vi.fn().mockResolvedValue([
      {
        city_id: 1,
        city_name: 'Colombo',
        route_id: 10,
        route_name: 'Colombo Fort Route A',
        num_orders: 88,
        total_volume: 950.25,
        total_value: 1750000.0,
      },
    ]),
    fetchDriverAssistantHours: vi.fn().mockResolvedValue([
      {
        person_role: 'driver',
        person_id: 5,
        full_name: 'Kamal Perera',
        week_start: '2026-09-07',
        total_hours: 36.5,
        weekly_limit_hours: 40.0,
        remaining_hours: 3.5,
      },
      {
        person_role: 'assistant',
        person_id: 12,
        full_name: 'Nimal Silva',
        week_start: '2026-09-07',
        total_hours: 32.0,
        weekly_limit_hours: 40.0,
        remaining_hours: 8.0,
      },
    ]),
    fetchTruckUsageMonthly: vi.fn().mockResolvedValue([
      {
        truck_id: 3,
        plate_number: 'WP-CAD-5542',
        usage_month: '2026-09',
        num_schedules: 14,
        total_hours: 68.5,
        distinct_routes_covered: 5,
      },
    ]),
    fetchCustomerOrderHistory: vi.fn().mockResolvedValue([
      {
        order_id: 201,
        customer_id: 15,
        customer_name: 'Ceylon Superstores Ltd',
        order_placed_at: '2026-09-01 10:30:00',
        expected_delivery_date: '2026-09-08',
        status: 'Delivered',
        delivery_address: '45 Galle Road',
        delivery_area: 'Kollupitiya',
        destination_city: 'Colombo',
        route_name: 'Colombo South',
        total_value: 125000.0,
        total_space_required: 24.5,
        delivery_id: 42,
        delivery_status: 'Completed',
        delivered_at: '2026-09-08 14:15:00',
        driver_name: 'Kamal Perera',
        assistant_name: 'Nimal Silva',
        truck_plate: 'WP-CAD-5542',
      },
    ]),
  };
});

/**
 * Creates dynamic RouteContext matching Next.js App Router context signature.
 */
function createRouteContext(type: string) {
  return {
    params: Promise.resolve({ type }),
  };
}

/**
 * Helper to construct incoming POST requests with optional JSON body and query string.
 */
function createPdfPostRequest(
  type: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): Request {
  const url = new URL(`http://localhost:3000/api/reports/${type}/export/pdf`);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  return new Request(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('API Route: POST /api/reports/:type/export/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    };
  });

  // =========================================================================
  // 1. AUTHENTICATION & AUTHORIZATION
  // =========================================================================

  it('rejects unauthenticated requests with HTTP 401 UNAUTHORIZED', async () => {
    mockSession = null;
    const req = createPdfPostRequest('quarterly-sales', { year: 2026, quarter: 1 });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects unauthorized role (order_entry_clerk) with HTTP 403 FORBIDDEN', async () => {
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000002',
      email: 'clerk@kandypack.lk',
      role: 'order_entry_clerk',
      store_id: null,
      display_name: 'Order Entry Clerk',
    };

    const req = createPdfPostRequest('quarterly-sales', { year: 2026, quarter: 1 });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('not authorized to export reports');
  });

  it('allows logistics_manager role with reports:export permission', async () => {
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000003',
      email: 'manager@kandypack.lk',
      role: 'logistics_manager',
      store_id: null,
      display_name: 'Logistics Manager',
    };

    const req = createPdfPostRequest('quarterly-sales', { year: 2026, quarter: 1 });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  // =========================================================================
  // 2. RATE LIMITING
  // =========================================================================

  it('returns HTTP 429 when per-user rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetTimeMs: Date.now() + 180 * 1000,
    });

    const req = createPdfPostRequest('quarterly-sales', { year: 2026, quarter: 1 });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeDefined();
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  // =========================================================================
  // 3. REPORT TYPE & PARAMETER VALIDATION
  // =========================================================================

  it('rejects unknown report type with HTTP 400 INVALID_REPORT_TYPE', async () => {
    const req = createPdfPostRequest('invalid-report-type');
    const res = await POST(req, createRouteContext('invalid-report-type'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REPORT_TYPE');
  });

  it('rejects most-ordered-items when year or quarter is missing with HTTP 400', async () => {
    const req = createPdfPostRequest('most-ordered-items', { year: 2026 }); // missing quarter
    const res = await POST(req, createRouteContext('most-ordered-items'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PARAM');
  });

  it('rejects driver-assistant-hours when week_start is missing with HTTP 400', async () => {
    const req = createPdfPostRequest('driver-assistant-hours', {});
    const res = await POST(req, createRouteContext('driver-assistant-hours'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PARAM');
  });

  it('rejects customer-history when customer_id is missing with HTTP 400', async () => {
    const req = createPdfPostRequest('customer-history', {});
    const res = await POST(req, createRouteContext('customer-history'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PARAM');
  });

  it('rejects invalid calendar dates or inverted ranges with HTTP 400', async () => {
    const req = createPdfPostRequest('city-route-sales', {
      date_from: '2026-12-31',
      date_to: '2026-01-01',
    });
    const res = await POST(req, createRouteContext('city-route-sales'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PARAM');
    expect(body.error.message).toContain("'date_from' cannot be after 'date_to'");
  });

  // =========================================================================
  // 4. ROW CAP LIMIT ENFORCEMENT
  // =========================================================================

  it('returns HTTP 400 EXPORT_TOO_LARGE when result rows exceed PDF_ROW_CAP', async () => {
    // Generate mock data exceeding PDF_ROW_CAP
    const oversizedData = Array.from({ length: PDF_ROW_CAP + 5 }, (_, i) => ({
      sales_year: 2026,
      sales_quarter: (i % 4) + 1,
      num_orders: 10,
      total_volume: 100,
      total_value: 50000,
    }));

    vi.mocked(reportsModule.fetchQuarterlySales).mockResolvedValueOnce(oversizedData);

    const req = createPdfPostRequest('quarterly-sales', { year: 2026 });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('EXPORT_TOO_LARGE');
    expect(body.error.message).toContain('row limit for PDF generation');
  });

  // =========================================================================
  // 5. SUCCESSFUL PDF GENERATION & STREAMING
  // =========================================================================

  it('generates valid PDF for quarterly-sales via JSON body', async () => {
    const req = createPdfPostRequest('quarterly-sales', { year: 2026, quarter: 1 });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="kandypack-quarterly-sales-\d{4}-\d{2}-\d{2}\.pdf"$/
    );

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('supports URL search query parameters as fallback', async () => {
    const req = createPdfPostRequest('quarterly-sales', undefined, { year: '2026', quarter: '2' });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates valid PDF for most-ordered-items', async () => {
    const req = createPdfPostRequest('most-ordered-items', { year: 2026, quarter: 1 });
    const res = await POST(req, createRouteContext('most-ordered-items'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates valid PDF for city-route-sales in landscape orientation', async () => {
    const req = createPdfPostRequest('city-route-sales', {
      date_from: '2026-01-01',
      date_to: '2026-09-30',
    });
    const res = await POST(req, createRouteContext('city-route-sales'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates valid PDF for driver-assistant-hours', async () => {
    const req = createPdfPostRequest('driver-assistant-hours', {
      week_start: '2026-09-07',
      role: 'driver',
    });
    const res = await POST(req, createRouteContext('driver-assistant-hours'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates valid PDF for truck-usage', async () => {
    const req = createPdfPostRequest('truck-usage', { year: 2026, month: 9 });
    const res = await POST(req, createRouteContext('truck-usage'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates valid PDF for customer-history with 18-column wide table', async () => {
    const req = createPdfPostRequest('customer-history', { customer_id: 15 });
    const res = await POST(req, createRouteContext('customer-history'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="kandypack-customer-history-\d{4}-\d{2}-\d{2}\.pdf"$/
    );

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('handles empty query result sets cleanly without errors', async () => {
    vi.mocked(reportsModule.fetchQuarterlySales).mockResolvedValueOnce([]);

    const req = createPdfPostRequest('quarterly-sales', { year: 2026, quarter: 4 });
    const res = await POST(req, createRouteContext('quarterly-sales'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
