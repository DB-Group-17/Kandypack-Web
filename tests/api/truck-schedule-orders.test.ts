/**
 * @file tests/api/truck-schedule-orders.test.ts
 * @description Handler-level tests for attaching orders to a truck schedule (smoke-test gap G1):
 *   - POST /api/truck-schedules with `order_ids` (schedule + deliveries in one transaction), and
 *   - GET /api/truck-schedules/eligible-orders (the list behind the "Orders to deliver" section).
 *
 * The database, Redis lock and the order-attachment SQL are mocked. These tests prove the HTTP
 * contract and the transaction boundaries: without `order_ids` nothing changes (no explicit
 * transaction); with `order_ids` the schedule and deliveries are committed together, and a rejected
 * order rolls the WHOLE transaction back so no schedule is left behind. The SQL rules themselves are
 * covered against a real MySQL database in tests/integration/trip-status-and-delivery-assignment.test.ts.
 *
 * Authority: Docs/05_api-and-pages.md §A7, Docs/13_system-operation-guide.md §7.
 * Owner: Member 1 (Dineth).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/truck-schedules/route';
import { GET } from '@/app/api/truck-schedules/eligible-orders/route';
import { OrderAssignmentError } from '@/app/api/truck-schedules/service';
import type { SessionUser, AppRole } from '@/lib/auth';
import { query } from '@/lib/db';

/** Fake connection: the CALL succeeds and the OUT parameter read returns schedule id 55. */
const mockConn = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  execute: vi.fn(),
};

let mockSession: SessionUser | null;

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)) };
});

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  withUserContext: vi.fn(
    async (_userId: string, _role: string, cb: (conn: typeof mockConn) => Promise<unknown>) =>
      cb(mockConn)
  ),
}));

// The Redis lock is a pass-through: it simply runs the critical section.
vi.mock('@/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/redis')>();
  return { ...actual, withLock: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()) };
});

// Keep the real error class and limits; mock the functions that touch the database.
vi.mock('@/app/api/truck-schedules/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/truck-schedules/service')>();
  return { ...actual, fetchTruckSchedulesFromDB: vi.fn(), attachOrdersToSchedule: vi.fn() };
});

import { attachOrdersToSchedule } from '@/app/api/truck-schedules/service';

/**
 * Builds a session for the given role.
 *
 * @param role - Application role of the signed-in user
 * @returns A session object
 */
function sessionFor(role: AppRole): SessionUser {
  return {
    user_id: '00000000-0000-0000-0000-000000000005',
    email: 'user@kandypack.lk',
    role,
    store_id: null,
    display_name: 'Test User',
  };
}

/** A valid schedule request body; tests spread extra fields over it. */
const BASE_BODY = {
  truck_id: 6,
  driver_id: 6,
  assistant_id: 6,
  route_id: 11,
  start_time: '2040-01-03 08:00:00',
};

/**
 * Calls POST /api/truck-schedules.
 *
 * @param body - JSON body
 * @returns The handler's response
 */
function callPost(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost:3000/api/truck-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
}

/**
 * Calls GET /api/truck-schedules/eligible-orders.
 *
 * @param search - Query string without the leading "?"
 * @returns The handler's response
 */
function callEligible(search: string): Promise<Response> {
  return GET(
    new Request(`http://localhost:3000/api/truck-schedules/eligible-orders?${search}`) as never
  );
}

beforeEach(() => {
  mockSession = sessionFor('fleet_supervisor');
  mockConn.beginTransaction.mockReset();
  mockConn.commit.mockReset();
  mockConn.rollback.mockReset();
  mockConn.execute.mockReset();
  // 1st call = CALL schedule_truck_delivery, 2nd call = SELECT @out_schedule_id
  mockConn.execute
    .mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([[{ schedule_id: 55 }]]);
  vi.mocked(attachOrdersToSchedule).mockReset();
  vi.mocked(attachOrdersToSchedule).mockResolvedValue([101, 102]);
  vi.mocked(query).mockReset();
});

describe('POST /api/truck-schedules with order_ids', () => {
  it('without order_ids behaves as before: no explicit transaction, empty delivery_ids', async () => {
    const res = await callPost(BASE_BODY);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ schedule_id: 55, delivery_ids: [] });
    expect(mockConn.beginTransaction).not.toHaveBeenCalled();
    expect(attachOrdersToSchedule).not.toHaveBeenCalled();
  });

  it('treats an empty order_ids array like no orders', async () => {
    const res = await callPost({ ...BASE_BODY, order_ids: [] });
    expect(res.status).toBe(201);
    expect(mockConn.beginTransaction).not.toHaveBeenCalled();
  });

  it('creates the schedule and deliveries in ONE transaction and commits', async () => {
    const res = await callPost({ ...BASE_BODY, order_ids: [30, 31] });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ schedule_id: 55, delivery_ids: [101, 102] });
    expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(attachOrdersToSchedule).toHaveBeenCalledWith(mockConn, 55, 11, [30, 31]);
    expect(mockConn.commit).toHaveBeenCalledTimes(1);
    expect(mockConn.rollback).not.toHaveBeenCalled();
  });

  it('collapses duplicate order ids and accepts numeric strings', async () => {
    await callPost({ ...BASE_BODY, order_ids: [30, '30', 31] });
    expect(attachOrdersToSchedule).toHaveBeenCalledWith(mockConn, 55, 11, [30, 31]);
  });

  it('rolls back the whole transaction and answers 400 INVALID_ORDER when an order is rejected', async () => {
    vi.mocked(attachOrdersToSchedule).mockRejectedValue(
      new OrderAssignmentError('Order #31 is Pending; only orders that are At Store can be assigned to a delivery.')
    );
    const res = await callPost({ ...BASE_BODY, order_ids: [30, 31] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_ORDER');
    expect(body.error.field).toBe('order_ids');
    expect(body.error.message).toContain('Order #31');
    // The schedule was created before the order check, so the rollback is what removes it.
    expect(mockConn.rollback).toHaveBeenCalledTimes(1);
    expect(mockConn.commit).not.toHaveBeenCalled();
  });

  it('rolls back and answers 500 for an unexpected database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(attachOrdersToSchedule).mockRejectedValue(new Error('deadlock'));
    const res = await callPost({ ...BASE_BODY, order_ids: [30] });
    expect(res.status).toBe(500);
    expect(mockConn.rollback).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not an array', 'abc'],
    ['an object', { a: 1 }],
    ['containing zero', [0]],
    ['containing a negative', [-4]],
    ['containing a fraction', [1.5]],
    ['containing text', ['x']],
    ['too long (51 entries)', Array.from({ length: 51 }, (_, i) => i + 1)],
  ])('rejects order_ids %s with 400 before touching the database', async (_label, value) => {
    const res = await callPost({ ...BASE_BODY, order_ids: value });
    expect(res.status).toBe(400);
    expect((await res.json()).error.field).toBe('order_ids');
    expect(mockConn.execute).not.toHaveBeenCalled();
  });

  it.each(['order_entry_clerk', 'store_manager', 'logistics_manager'] as AppRole[])(
    'rejects %s with 403',
    async (role) => {
      mockSession = sessionFor(role);
      const res = await callPost({ ...BASE_BODY, order_ids: [30] });
      expect(res.status).toBe(403);
      expect(mockConn.beginTransaction).not.toHaveBeenCalled();
    }
  );
});

describe('GET /api/truck-schedules/eligible-orders', () => {
  it('returns the eligible orders with the date as YYYY-MM-DD and numbers as numbers', async () => {
    vi.mocked(query).mockResolvedValue([
      {
        order_id: '25',
        customer_name: 'Colombo Retail Mart',
        delivery_area: 'Fort',
        delivery_address: '12 Main St',
        expected_delivery_date: new Date('2026-10-20T00:00:00.000Z'),
        total_space_required: '8.50',
      },
    ] as never);
    const res = await callEligible('route_id=1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        {
          order_id: 25,
          customer_name: 'Colombo Retail Mart',
          delivery_area: 'Fort',
          delivery_address: '12 Main St',
          expected_delivery_date: '2026-10-20',
          total_space_required: 8.5,
        },
      ],
      total: 1,
    });
  });

  it('filters by the route and by the eligibility rules in SQL', async () => {
    vi.mocked(query).mockResolvedValue([] as never);
    await callEligible('route_id=4');
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(params).toEqual([4]);
    expect(sql).toContain("o.status = 'At Store'");
    expect(sql).toContain('o.route_id = ?');
    expect(sql).toContain("d.status IN ('Scheduled', 'In Progress')");
  });

  it('returns an empty list when nothing is eligible', async () => {
    vi.mocked(query).mockResolvedValue([] as never);
    const res = await callEligible('route_id=4');
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });

  it.each(['', 'route_id=', 'route_id=abc', 'route_id=0', 'route_id=-2', 'route_id=1.5'])(
    'rejects "%s" with 400',
    async (search) => {
      const res = await callEligible(search);
      expect(res.status).toBe(400);
      expect((await res.json()).error.field).toBe('route_id');
      expect(query).not.toHaveBeenCalled();
    }
  );

  it.each(['order_entry_clerk', 'store_manager', 'logistics_manager'] as AppRole[])(
    'rejects %s with 403',
    async (role) => {
      mockSession = sessionFor(role);
      const res = await callEligible('route_id=1');
      expect(res.status).toBe(403);
      expect(query).not.toHaveBeenCalled();
    }
  );

  it.each(['fleet_supervisor', 'system_administrator'] as AppRole[])('allows %s', async (role) => {
    mockSession = sessionFor(role);
    vi.mocked(query).mockResolvedValue([] as never);
    const res = await callEligible('route_id=1');
    expect(res.status).toBe(200);
  });
});
