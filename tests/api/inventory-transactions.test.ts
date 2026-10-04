/**
 * @file tests/api/inventory-transactions.test.ts
 * @description API route tests for GET /api/inventory/transactions.
 *
 * Verifies that:
 * - Unauthenticated requests return HTTP 401 UNAUTHORIZED.
 * - Unauthorized roles return HTTP 403 FORBIDDEN.
 * - Store managers are strictly restricted to their assigned store (store isolation).
 * - System administrators can query transactions across stores.
 * - Response payload adheres strictly to Docs/05_api-and-pages.md §A6 without fabricated/invented
 *   creator fields (e.g. no fake 'created_by_name' or 'Verified Ledger').
 *
 * Authority: Docs/03_architecture.md §4, Docs/05_api-and-pages.md §A6.
 */

import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/api/inventory/transactions/route';
import type { SessionUser } from '@/lib/auth';

let mockSession: SessionUser | null = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@kandypack.lk',
  role: 'system_administrator',
  store_id: null,
  display_name: 'System Administrator',
};

// Mock authentication session to allow dynamic session switching per test
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)),
  };
});

/**
 * Helper to construct incoming GET request for /api/inventory/transactions.
 */
function createGetRequest(queryString = ''): Request {
  const url = `http://localhost:3000/api/inventory/transactions${queryString ? `?${queryString}` : ''}`;
  return new Request(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API Route: GET /api/inventory/transactions', () => {
  it('rejects unauthenticated requests with HTTP 401', async () => {
    mockSession = null;
    const req = createGetRequest('store_id=1');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects roles without inventory read permission with HTTP 403', async () => {
    mockSession = {
      user_id: '11111111-1111-1111-1111-111111111111',
      email: 'clerk@kandypack.lk',
      role: 'order_entry_clerk',
      store_id: null,
      display_name: 'Order Entry Clerk',
    };

    const req = createGetRequest('store_id=1');
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('enforces store isolation: store_manager cannot query another store ID', async () => {
    mockSession = {
      user_id: '33333333-3333-3333-3333-333333333333',
      email: 'manager@kandypack.lk',
      role: 'store_manager',
      store_id: 1, // Assigned to Colombo store
      display_name: 'Colombo Store Manager',
    };

    // Attempt to query store_id 2 (Kandy)
    const req = createGetRequest('store_id=2');
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('assigned store');
  });

  it('returns HTTP 200 with database transaction records matching contract shape and no fabricated author data', async () => {
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    };

    const req = createGetRequest('store_id=1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);

    if (body.items.length > 0) {
      const item = body.items[0];
      // Required contract fields from Docs/05_api-and-pages.md §A6
      expect(typeof item.transaction_id).toBe('number');
      expect(typeof item.store_id).toBe('number');
      expect(typeof item.product_id).toBe('number');
      expect(typeof item.change_qty).toBe('number');
      expect(['receive', 'dispatch', 'adjustment']).toContain(item.transaction_type);
      expect(typeof item.created_at).toBe('string');

      // Crucial requirement: No fabricated author/creator data in response payload
      expect(item.created_by_name).toBeUndefined();
      expect(item.author).toBeUndefined();
      expect(item.operator).toBeUndefined();
    }
  });
});
