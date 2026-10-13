/**
 * @file tests/api/train-trip-status.test.ts
 * @description Handler-level tests for PATCH /api/train-trips/:id (smoke-test gap G2).
 *
 * The database and the business-rule service are mocked, so these tests prove the HTTP contract:
 *   - authentication and role checks (only logistics_manager and system_administrator),
 *   - validation of the trip ID and the requested status,
 *   - the success response shape and that the transaction is committed,
 *   - that an expected rejection (unknown trip, illegal transition) rolls back and answers with the
 *     right status code, and that an unexpected failure rolls back and answers 500.
 * The SQL itself (state machine, Pending → In Transit on departure) is covered against a real MySQL
 * database in tests/integration/trip-status-and-delivery-assignment.test.ts.
 *
 * Authority: Docs/05_api-and-pages.md §A5, Docs/03_architecture.md §19.
 * Owner: Member 1 (Dineth).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PATCH } from '@/app/api/train-trips/[id]/route';
import { TripStatusError } from '@/app/api/train-trips/[id]/service';
import type { SessionUser, AppRole } from '@/lib/auth';

/** Fake transactional connection handed to the route by the mocked withUserContext. */
const mockConn = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
};

let mockSession: SessionUser | null;

// Dynamic session so each test can switch role.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)) };
});

// withUserContext simply runs the callback with the fake connection.
vi.mock('@/lib/db', () => ({
  withUserContext: vi.fn(
    async (_userId: string, _role: string, cb: (conn: typeof mockConn) => Promise<unknown>) =>
      cb(mockConn)
  ),
}));

// Keep the real TripStatusError class, mock only the business function.
vi.mock('@/app/api/train-trips/[id]/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/train-trips/[id]/service')>();
  return { ...actual, changeTripStatus: vi.fn() };
});

import { changeTripStatus } from '@/app/api/train-trips/[id]/service';

/**
 * Builds a session for the given role.
 *
 * @param role - Application role of the signed-in user
 * @returns A session object
 */
function sessionFor(role: AppRole): SessionUser {
  return {
    user_id: '00000000-0000-0000-0000-000000000002',
    email: 'user@kandypack.lk',
    role,
    store_id: null,
    display_name: 'Test User',
  };
}

/**
 * Calls the PATCH handler.
 *
 * @param id - Value of the :id URL segment
 * @param body - JSON body to send (a string is sent raw so malformed JSON can be tested)
 * @returns The handler's response
 */
function callPatch(id: string, body: unknown): Promise<Response> {
  const req = new Request(`http://localhost:3000/api/train-trips/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

describe('API Route: PATCH /api/train-trips/:id', () => {
  beforeEach(() => {
    mockSession = sessionFor('logistics_manager');
    mockConn.beginTransaction.mockReset();
    mockConn.commit.mockReset();
    mockConn.rollback.mockReset();
    vi.mocked(changeTripStatus).mockReset();
    vi.mocked(changeTripStatus).mockResolvedValue({
      trip_id: 7,
      status: 'Departed',
      orders_advanced: 2,
    });
  });

  describe('Authentication and roles', () => {
    it('rejects a missing session', async () => {
      mockSession = null;
      const res = await callPatch('7', { status: 'Departed' });
      expect(res.status).toBe(401);
      expect(changeTripStatus).not.toHaveBeenCalled();
    });

    it.each(['logistics_manager', 'system_administrator'] as AppRole[])(
      'allows %s',
      async (role) => {
        mockSession = sessionFor(role);
        const res = await callPatch('7', { status: 'Departed' });
        expect(res.status).toBe(200);
      }
    );

    it.each(['order_entry_clerk', 'store_manager', 'fleet_supervisor'] as AppRole[])(
      'rejects %s with 403 and never touches the database',
      async (role) => {
        mockSession = sessionFor(role);
        const res = await callPatch('7', { status: 'Departed' });
        expect(res.status).toBe(403);
        expect((await res.json()).error.code).toBe('FORBIDDEN');
        expect(mockConn.beginTransaction).not.toHaveBeenCalled();
      }
    );
  });

  describe('Validation', () => {
    it.each(['abc', '0', '-3', '1.5'])('rejects trip id "%s" with 400', async (id) => {
      const res = await callPatch(id, { status: 'Departed' });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('INVALID_TRIP_ID');
    });

    it.each([
      ['Cancelled', { status: 'Cancelled' }],
      ['Scheduled', { status: 'Scheduled' }],
      ['an empty body', {}],
      ['a number', { status: 5 }],
    ])('rejects %s as the requested status with 400', async (_label, body) => {
      const res = await callPatch('7', body);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('INVALID_STATUS');
      expect(changeTripStatus).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON with 400', async () => {
      const res = await callPatch('7', '{not json');
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success', () => {
    it('commits and returns the trip, status and number of orders advanced', async () => {
      const res = await callPatch('7', { status: 'Departed' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ trip_id: 7, status: 'Departed', orders_advanced: 2 });
      expect(changeTripStatus).toHaveBeenCalledWith(mockConn, 7, 'Departed');
      expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConn.commit).toHaveBeenCalledTimes(1);
      expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('passes Arrived through to the service', async () => {
      vi.mocked(changeTripStatus).mockResolvedValue({
        trip_id: 7,
        status: 'Arrived',
        orders_advanced: 0,
      });
      const res = await callPatch('7', { status: 'Arrived' });
      expect(res.status).toBe(200);
      expect((await res.json()).orders_advanced).toBe(0);
      expect(changeTripStatus).toHaveBeenCalledWith(mockConn, 7, 'Arrived');
    });
  });

  describe('Rejections and failures roll back', () => {
    it('answers 404 for an unknown trip and rolls back', async () => {
      vi.mocked(changeTripStatus).mockRejectedValue(
        new TripStatusError('TRIP_NOT_FOUND', 'Train trip #7 was not found.', 404)
      );
      const res = await callPatch('7', { status: 'Departed' });
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('TRIP_NOT_FOUND');
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
      expect(mockConn.commit).not.toHaveBeenCalled();
    });

    it('answers 400 for an illegal transition, with the service message, and rolls back', async () => {
      vi.mocked(changeTripStatus).mockRejectedValue(
        new TripStatusError(
          'INVALID_TRANSITION',
          'Trip #7 is Scheduled; it can only be moved to Departed.',
          400
        )
      );
      const res = await callPatch('7', { status: 'Arrived' });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_TRANSITION');
      expect(body.error.message).toContain('can only be moved to Departed');
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
    });

    it('answers 500 without leaking details for an unexpected error, and rolls back', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(changeTripStatus).mockRejectedValue(new Error('connection reset by peer'));
      const res = await callPatch('7', { status: 'Departed' });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('SERVER_ERROR');
      expect(JSON.stringify(body)).not.toContain('connection reset');
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
    });
  });
});
