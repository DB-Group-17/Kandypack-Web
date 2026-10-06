/**
 * @file tests/api/arrived-bookings.test.ts
 * @description API route tests for GET /api/stores/:id/arrived-bookings.
 *
 * Verifies that:
 * - Unauthenticated requests return HTTP 401 UNAUTHORIZED.
 * - Unauthorized roles return HTTP 403 FORBIDDEN.
 * - Store managers are isolated to their own store (requesting other stores returns HTTP 403).
 * - Invalid store IDs return HTTP 400 INVALID_ID.
 * - Non-existent stores return HTTP 404 NOT_FOUND.
 * - Arrived, unreceived bookings for the store are returned with expected line items.
 * - Already-received bookings are excluded from the returned items.
 *
 * Authority: Docs/03_architecture.md §4, Docs/05_api-and-pages.md §A6.
 */

import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/api/stores/[id]/arrived-bookings/route';
import type { SessionUser } from '@/lib/auth';

let mockSession: SessionUser | null = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@kandypack.lk',
  role: 'system_administrator',
  store_id: null,
  display_name: 'System Administrator',
};

// Mock authentication session to allow dynamic session context per test
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)),
  };
});

/**
 * Helper to construct incoming GET request and dynamic context for /api/stores/:id/arrived-bookings.
 */
function createGetRequest(storeId: string): { req: Request; context: { params: Promise<{ id: string }> } } {
  const url = `http://localhost:3000/api/stores/${storeId}/arrived-bookings`;
  const req = new Request(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const context = {
    params: Promise.resolve({ id: storeId }),
  };
  return { req, context };
}

describe('API Route: GET /api/stores/:id/arrived-bookings', () => {
  it('rejects unauthenticated requests with HTTP 401', async () => {
    mockSession = null;
    const { req, context } = createGetRequest('1');
    const res = await GET(req, context);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects roles without inventory read permissions with HTTP 403', async () => {
    mockSession = {
      user_id: '11111111-1111-1111-1111-111111111111',
      email: 'clerk@kandypack.lk',
      role: 'order_entry_clerk',
      store_id: null,
      display_name: 'Order Entry Clerk',
    };

    const { req, context } = createGetRequest('1');
    const res = await GET(req, context);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('enforces store isolation: store_manager cannot view bookings for another store', async () => {
    mockSession = {
      user_id: '33333333-3333-3333-3333-333333333333',
      email: 'manager@kandypack.lk',
      role: 'store_manager',
      store_id: 1, // Colombo Store
      display_name: 'Colombo Store Manager',
    };

    // Attempt to query Store 2 (Negombo)
    const { req, context } = createGetRequest('2');
    const res = await GET(req, context);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('assigned store');
  });

  it('rejects invalid non-numeric store IDs with HTTP 400', async () => {
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    };

    const { req, context } = createGetRequest('abc');
    const res = await GET(req, context);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_ID');
  });

  it('returns HTTP 404 for non-existent store IDs', async () => {
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    };

    const { req, context } = createGetRequest('99999');
    const res = await GET(req, context);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns arrived, unreceived bookings with line items and excludes already-received bookings', async () => {
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    };

    // Store 6 (Trincomalee) has arrived unreceived bookings (Booking #1, #22) in seed data
    const { req, context } = createGetRequest('6');
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const booking = body.items[0];
    expect(typeof booking.booking_id).toBe('number');
    expect(typeof booking.trip_id).toBe('number');
    expect(typeof booking.order_id).toBe('number');
    expect(typeof booking.arrival_datetime).toBe('string');
    expect(Array.isArray(booking.items)).toBe(true);

    if (booking.items.length > 0) {
      const item = booking.items[0];
      expect(typeof item.booking_item_id).toBe('number');
      expect(typeof item.product_id).toBe('number');
      expect(typeof item.product_name).toBe('string');
      expect(typeof item.sku).toBe('string');
      expect(typeof item.expected_quantity).toBe('number');
      expect(item.expected_quantity).toBeGreaterThan(0);
    }

    // In clean seed data for Store 1 (Colombo), Bookings #2 and #3 are already received,
    // while Bookings #4 and #5 are arrived but unreceived.
    const { req: req1, context: context1 } = createGetRequest('1');
    const res1 = await GET(req1, context1);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    // Verify already-received bookings (2, 3) are excluded while arrived unreceived bookings (4, 5) are returned
    const returnedBookingIds = body1.items.map((b: { booking_id: number }) => b.booking_id);
    expect(returnedBookingIds).not.toContain(2);
    expect(returnedBookingIds).not.toContain(3);
    expect(returnedBookingIds).toContain(4);
    expect(returnedBookingIds).toContain(5);
  });
});
