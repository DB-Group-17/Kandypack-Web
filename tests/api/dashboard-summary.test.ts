/**
 * @file tests/api/dashboard-summary.test.ts
 * @description API route tests for GET /api/dashboard/summary.
 *
 * Verifies that:
 * - Unauthenticated requests return HTTP 401.
 * - Every staff role receives HTTP 200 with the contract shape from Docs/05_api-and-pages.md §A2.
 * - A store_manager is scoped to their own store (low-stock rows never leak other stores).
 * - A store_manager without an assigned store is rejected with HTTP 403.
 * - Low-stock rows respect the shared LOW_STOCK_THRESHOLD.
 *
 * Runs against the configured database; Redis falls back to no-op when not configured.
 *
 * Authority: Docs/03_architecture.md §10, Docs/05_api-and-pages.md §A2.
 */

import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/api/dashboard/summary/route';
import type { AppRole, SessionUser } from '@/lib/auth';
import { LOW_STOCK_THRESHOLD } from '@/lib/business-rules';

let mockSession: SessionUser | null = null;

// Mock authentication so each test can switch the signed-in user
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)),
  };
});

// Mock lib/redis so getOrSetCache bypasses Upstash network calls in CI
vi.mock('@/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/redis')>();
  return {
    ...actual,
    getOrSetCache: vi.fn().mockImplementation((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
  };
});

/**
 * Builds a session for the given role.
 *
 * @param role - The role to sign in as
 * @param storeId - Assigned store id (store managers only)
 * @returns A SessionUser fixture
 */
function sessionFor(role: AppRole, storeId: number | null = null): SessionUser {
  return {
    user_id: '00000000-0000-0000-0000-000000000001',
    email: `${role}@kandypack.lk`,
    role,
    store_id: storeId,
    display_name: role,
  };
}

describe('API Route: GET /api/dashboard/summary', () => {
  it('rejects unauthenticated requests with HTTP 401', async () => {
    mockSession = null;
    const res = await GET();

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a store manager with no assigned store with HTTP 403', async () => {
    mockSession = sessionFor('store_manager', null);
    const res = await GET();

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });

  it.each<AppRole>([
    'system_administrator',
    'logistics_manager',
    'order_entry_clerk',
    'fleet_supervisor',
  ])('returns the contract shape for %s', async (role) => {
    mockSession = sessionFor(role);
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.pending_orders).toBe('number');
    expect(typeof body.active_truck_schedules).toBe('number');
    expect(Array.isArray(body.todays_departures)).toBe(true);
    expect(Array.isArray(body.low_stock_alerts)).toBe(true);

    for (const alert of body.low_stock_alerts) {
      expect(typeof alert.store_id).toBe('number');
      expect(typeof alert.store_name).toBe('string');
      expect(typeof alert.product_name).toBe('string');
      expect(alert.quantity_on_hand).toBeLessThan(LOW_STOCK_THRESHOLD);
    }
    for (const trip of body.todays_departures) {
      expect(typeof trip.trip_id).toBe('number');
      expect(typeof trip.destination_city).toBe('string');
      expect(Number.isNaN(Date.parse(trip.departure_datetime))).toBe(false);
    }
  });

  it('scopes a store manager to their own store', async () => {
    mockSession = sessionFor('store_manager', 1);
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    for (const alert of body.low_stock_alerts) {
      expect(alert.store_id).toBe(1);
    }

    // A scoped view can never exceed the system-wide view
    mockSession = sessionFor('system_administrator');
    const globalBody = await (await GET()).json();
    expect(body.pending_orders).toBeLessThanOrEqual(globalBody.pending_orders);
    expect(body.active_truck_schedules).toBeLessThanOrEqual(globalBody.active_truck_schedules);
    expect(body.low_stock_alerts.length).toBeLessThanOrEqual(globalBody.low_stock_alerts.length);
  });
});
