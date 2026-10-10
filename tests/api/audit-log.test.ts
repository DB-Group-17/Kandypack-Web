/**
 * @file tests/api/audit-log.test.ts
 * @description Automated test suite for GET /api/audit-log.
 *
 * Verifies that:
 * 1. Authentication:
 *    - Unauthenticated requests return HTTP 401 UNAUTHORIZED.
 * 2. RBAC:
 *    - system_administrator is authorized to read the audit log.
 *    - Unauthorized roles (logistics_manager, order_entry_clerk, store_manager, fleet_supervisor) return HTTP 403 FORBIDDEN.
 * 3. Successful retrieval:
 *    - Returns HTTP 200 with the documented `{ items, total }` structure.
 *    - Verifies deterministic newest-first ordering in SQL (`created_at DESC, log_id DESC`).
 * 4. Filtering:
 *    - Filters by table_name (exact match, ignores 'all').
 *    - Filters by user_id (UUID match, ignores 'all').
 *    - System / NULL actor filtering (`user_id=system`, `'null'`, `'0'`).
 *    - Date range filtering (`date_from`, `date_to`).
 * 5. Pagination & validation:
 *    - Valid limit, page + limit, offset + limit.
 *    - Rejects page without limit with HTTP 400 VALIDATION_ERROR ("limit must be specified when using page.").
 *    - Rejects invalid limit, page, and offset values.
 *    - Rejects invalid date format and inverted date ranges (date_from > date_to).
 * 6. Row data transformations:
 *    - Maps trigger actions: INSERT -> Created, UPDATE -> Updated, DELETE -> Deleted.
 *    - Resolves NULL user_id to "System" with "SYS" initials.
 *    - Resolves actor display name and avatar initials from joined employee/profile records.
 *    - Resolves record_id fallback from old_data / new_data for user accounts where record_id is NULL.
 *    - Safely parses stringified JSON columns into typed objects.
 *
 * Authority: Docs/03_architecture.md §19, Docs/04_database-schema-v4.md §2.9, Docs/05_api-and-pages.md §A10.
 * Owner: Member 4 (Vidura).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/audit-log/route';
import type { SessionUser, AppRole } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

let mockSession: SessionUser | null = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@kandypack.lk',
  role: 'system_administrator',
  store_id: null,
  display_name: 'System Administrator',
};

// Mock authentication session to allow dynamic test role switching
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)),
  };
});

// Mock database helper methods to isolate unit tests from live database state
vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

/**
 * Constructs an incoming GET Request for /api/audit-log with optional query parameters.
 *
 * @param queryString - Optional URL search string (without leading '?')
 * @returns Standard HTTP Request instance
 */
function createGetRequest(queryString = ''): Request {
  const url = `http://localhost:3000/api/audit-log${queryString ? `?${queryString}` : ''}`;
  return new Request(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API Route: GET /api/audit-log', () => {
  beforeEach(() => {
    // Reset session to default system administrator
    mockSession = {
      user_id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    };

    vi.mocked(queryOne).mockReset();
    vi.mocked(query).mockReset();

    // Default implementations: empty result set with zero count
    vi.mocked(queryOne).mockResolvedValue({ total: 0 });
    vi.mocked(query).mockResolvedValue([]);
  });

  // =========================================================================
  // 1. Authentication
  // =========================================================================
  describe('Authentication', () => {
    it('rejects unauthenticated requests with HTTP 401 UNAUTHORIZED', async () => {
      mockSession = null;
      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Authentication required');
    });
  });

  // =========================================================================
  // 2. Role-Based Access Control (RBAC)
  // =========================================================================
  describe('RBAC Authorization', () => {
    it('authorizes system_administrator with HTTP 200', async () => {
      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    const unauthorizedRoles: AppRole[] = [
      'logistics_manager',
      'order_entry_clerk',
      'store_manager',
      'fleet_supervisor',
    ];

    unauthorizedRoles.forEach((role) => {
      it(`rejects unauthorized role '${role}' with HTTP 403 FORBIDDEN`, async () => {
        mockSession = {
          user_id: '11111111-1111-1111-1111-111111111111',
          email: `${role}@kandypack.lk`,
          role,
          store_id: role === 'store_manager' ? 1 : null,
          display_name: 'Staff Member',
        };

        const req = createGetRequest();
        const res = await GET(req);

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.code).toBe('FORBIDDEN');
        expect(body.error.message).toContain(`Role '${role}' is not authorized`);
      });
    });
  });

  // =========================================================================
  // 3. Successful Retrieval & Deterministic Ordering
  // =========================================================================
  describe('Successful Retrieval & Ordering', () => {
    it('returns documented response structure with items array and total count', async () => {
      vi.mocked(queryOne).mockResolvedValue({ total: 1 });
      vi.mocked(query).mockResolvedValue([
        {
          log_id: 101,
          table_name: 'orders',
          record_id: 42,
          action: 'INSERT',
          user_id: '00000000-0000-0000-0000-000000000001',
          old_data: null,
          new_data: { order_id: 42, status: 'Pending' },
          created_at: new Date('2026-10-09T10:00:00Z'),
          actor_name: 'System Administrator',
          actor_email: 'admin@kandypack.lk',
        },
      ]);

      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('total', 1);
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items).toHaveLength(1);

      const item = body.items[0];
      expect(item.log_id).toBe(101);
      expect(item.table_name).toBe('orders');
      expect(item.record_id).toBe('42');
      expect(item.action).toBe('Created');
      expect(item.user_id).toBe('00000000-0000-0000-0000-000000000001');
      expect(item.user_name).toBe('System Administrator');
      expect(item.user_initials).toBe('SA');
      expect(item.changed_at).toBe('2026-10-09T10:00:00.000Z');
      expect(item.old_data).toBeNull();
      expect(item.new_data).toEqual({ order_id: 42, status: 'Pending' });
    });

    it('enforces deterministic newest-first ordering (created_at DESC, log_id DESC)', async () => {
      const req = createGetRequest();
      await GET(req);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY al.created_at DESC, al.log_id DESC'),
        expect.any(Array)
      );
    });
  });

  // =========================================================================
  // 4. Query Parameter Filtering
  // =========================================================================
  describe('Query Parameter Filtering', () => {
    it('filters by table_name (case-insensitive exact match)', async () => {
      const req = createGetRequest('table_name=Orders');
      await GET(req);

      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining('al.table_name = ?'),
        expect.arrayContaining(['orders'])
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('al.table_name = ?'),
        expect.arrayContaining(['orders'])
      );
    });

    it('ignores table_name when value is "all"', async () => {
      const req = createGetRequest('table_name=all');
      await GET(req);

      expect(queryOne).toHaveBeenCalledWith(
        expect.not.stringContaining('al.table_name = ?'),
        []
      );
    });

    it('filters by user_id UUID', async () => {
      const targetUserId = '22222222-2222-2222-2222-222222222222';
      const req = createGetRequest(`user_id=${targetUserId}`);
      await GET(req);

      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining('al.user_id = ?'),
        expect.arrayContaining([targetUserId])
      );
    });

    it('filters by system/null actor when user_id is "system", "null", or "0"', async () => {
      for (const val of ['system', 'null', '0']) {
        vi.mocked(queryOne).mockClear();
        const req = createGetRequest(`user_id=${val}`);
        await GET(req);

        expect(queryOne).toHaveBeenCalledWith(
          expect.stringContaining('al.user_id IS NULL'),
          []
        );
      }
    });

    it('filters by date_from boundary (00:00:00)', async () => {
      const req = createGetRequest('date_from=2026-10-01');
      await GET(req);

      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining('al.created_at >= ?'),
        expect.arrayContaining(['2026-10-01 00:00:00'])
      );
    });

    it('filters by date_to boundary (23:59:59)', async () => {
      const req = createGetRequest('date_to=2026-10-05');
      await GET(req);

      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining('al.created_at <= ?'),
        expect.arrayContaining(['2026-10-05 23:59:59'])
      );
    });

    it('combines multiple filter parameters cleanly', async () => {
      const req = createGetRequest('table_name=customers&date_from=2026-10-01&date_to=2026-10-05');
      await GET(req);

      expect(queryOne).toHaveBeenCalledWith(
        expect.stringMatching(/al\.table_name = \?.*AND.*al\.created_at >= \?.*AND.*al\.created_at <= \?/),
        ['customers', '2026-10-01 00:00:00', '2026-10-05 23:59:59']
      );
    });
  });

  // =========================================================================
  // 5. Pagination & Parameter Validation
  // =========================================================================
  describe('Pagination & Validation', () => {
    it('applies pagination with valid limit parameter', async () => {
      const req = createGetRequest('limit=25');
      await GET(req);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        expect.arrayContaining([25, 0])
      );
    });

    it('applies pagination with valid page and limit parameters', async () => {
      const req = createGetRequest('page=3&limit=10');
      await GET(req);

      // Page 3 with limit 10 => offset = (3 - 1) * 10 = 20
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        expect.arrayContaining([10, 20])
      );
    });

    it('applies pagination with valid offset and limit parameters', async () => {
      const req = createGetRequest('offset=15&limit=5');
      await GET(req);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        expect.arrayContaining([5, 15])
      );
    });

    it('rejects page without limit with HTTP 400 VALIDATION_ERROR', async () => {
      const req = createGetRequest('page=2');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('limit must be specified when using page.');
      expect(body.error.field).toBe('limit');
    });

    it('rejects invalid limit values (< 1, > 100, non-integer) with HTTP 400', async () => {
      const invalidLimits = ['0', '-5', '101', 'abc', '10.5'];

      for (const lim of invalidLimits) {
        const req = createGetRequest(`limit=${lim}`);
        const res = await GET(req);

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.field).toBe('limit');
      }
    });

    it('rejects invalid page values (<= 0, non-integer) with HTTP 400', async () => {
      const invalidPages = ['0', '-1', 'xyz', '1.5'];

      for (const pg of invalidPages) {
        const req = createGetRequest(`page=${pg}&limit=10`);
        const res = await GET(req);

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.field).toBe('page');
      }
    });

    it('rejects invalid offset values (< 0, non-integer) with HTTP 400', async () => {
      const invalidOffsets = ['-1', 'abc', '2.5'];

      for (const off of invalidOffsets) {
        const req = createGetRequest(`offset=${off}&limit=10`);
        const res = await GET(req);

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.field).toBe('offset');
      }
    });

    it('rejects malformed date_from and date_to parameters with HTTP 400', async () => {
      const reqFrom = createGetRequest('date_from=invalid-date');
      const resFrom = await GET(reqFrom);
      expect(resFrom.status).toBe(400);
      const bodyFrom = await resFrom.json();
      expect(bodyFrom.error.code).toBe('VALIDATION_ERROR');
      expect(bodyFrom.error.field).toBe('date_from');

      const reqTo = createGetRequest('date_to=2026-13-45');
      const resTo = await GET(reqTo);
      expect(resTo.status).toBe(400);
      const bodyTo = await resTo.json();
      expect(bodyTo.error.code).toBe('VALIDATION_ERROR');
      expect(bodyTo.error.field).toBe('date_to');
    });

    it('rejects inverted date ranges (date_from strictly after date_to) with HTTP 400', async () => {
      const req = createGetRequest('date_from=2026-10-15&date_to=2026-10-10');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('date_from cannot be after date_to.');
      expect(body.error.field).toBe('date_from');
    });
  });

  // =========================================================================
  // 6. Row Transformations
  // =========================================================================
  describe('Row Data Transformations', () => {
    it('correctly maps trigger actions INSERT/UPDATE/DELETE to Created/Updated/Deleted', async () => {
      vi.mocked(queryOne).mockResolvedValue({ total: 3 });
      vi.mocked(query).mockResolvedValue([
        {
          log_id: 1,
          table_name: 'orders',
          record_id: 10,
          action: 'INSERT',
          user_id: '00000000-0000-0000-0000-000000000001',
          old_data: null,
          new_data: { status: 'Pending' },
          created_at: new Date('2026-10-09T10:00:00Z'),
          actor_name: 'Admin',
          actor_email: 'admin@kandypack.lk',
        },
        {
          log_id: 2,
          table_name: 'orders',
          record_id: 10,
          action: 'UPDATE',
          user_id: '00000000-0000-0000-0000-000000000001',
          old_data: { status: 'Pending' },
          new_data: { status: 'In Transit' },
          created_at: new Date('2026-10-09T11:00:00Z'),
          actor_name: 'Admin',
          actor_email: 'admin@kandypack.lk',
        },
        {
          log_id: 3,
          table_name: 'orders',
          record_id: 10,
          action: 'DELETE',
          user_id: '00000000-0000-0000-0000-000000000001',
          old_data: { status: 'Cancelled' },
          new_data: null,
          created_at: new Date('2026-10-09T12:00:00Z'),
          actor_name: 'Admin',
          actor_email: 'admin@kandypack.lk',
        },
      ]);

      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items[0].action).toBe('Created');
      expect(body.items[1].action).toBe('Updated');
      expect(body.items[2].action).toBe('Deleted');
    });

    it('resolves NULL user_id to "System" with "SYS" avatar initials', async () => {
      vi.mocked(queryOne).mockResolvedValue({ total: 1 });
      vi.mocked(query).mockResolvedValue([
        {
          log_id: 50,
          table_name: 'store_inventory',
          record_id: 5,
          action: 'INSERT',
          user_id: null,
          old_data: null,
          new_data: { quantity_on_hand: 500 },
          created_at: new Date('2026-10-09T08:00:00Z'),
          actor_name: null,
          actor_email: null,
        },
      ]);

      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      const item = body.items[0];

      expect(item.user_id).toBeNull();
      expect(item.user_name).toBe('System');
      expect(item.user_initials).toBe('SYS');
    });

    it('resolves actor display name and initials from joined profile or email', async () => {
      vi.mocked(queryOne).mockResolvedValue({ total: 2 });
      vi.mocked(query).mockResolvedValue([
        {
          log_id: 61,
          table_name: 'routes',
          record_id: 1,
          action: 'UPDATE',
          user_id: '33333333-3333-3333-3333-333333333333',
          old_data: { max_hours: 4 },
          new_data: { max_hours: 5 },
          created_at: new Date('2026-10-09T09:00:00Z'),
          actor_name: 'Kasun Perera',
          actor_email: 'kasun@kandypack.lk',
        },
        {
          log_id: 62,
          table_name: 'trucks',
          record_id: 2,
          action: 'UPDATE',
          user_id: '44444444-4444-4444-4444-444444444444',
          old_data: { capacity: 2000 },
          new_data: { capacity: 2500 },
          created_at: new Date('2026-10-09T09:30:00Z'),
          actor_name: null,
          actor_email: 'fleet.supervisor@kandypack.lk',
        },
      ]);

      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].user_name).toBe('Kasun Perera');
      expect(body.items[0].user_initials).toBe('KP');

      expect(body.items[1].user_name).toBe('fleet.supervisor@kandypack.lk');
      expect(body.items[1].user_initials).toBe('FL');
    });

    it('resolves record_id from new_data/old_data for users and user_profiles where record_id is NULL', async () => {
      const targetUserUuid = '55555555-5555-5555-5555-555555555555';
      vi.mocked(queryOne).mockResolvedValue({ total: 2 });
      vi.mocked(query).mockResolvedValue([
        {
          log_id: 71,
          table_name: 'users',
          record_id: null,
          action: 'INSERT',
          user_id: '00000000-0000-0000-0000-000000000001',
          old_data: null,
          new_data: { user_id: targetUserUuid, email: 'clerk@kandypack.lk', is_active: 1 },
          created_at: new Date('2026-10-09T07:00:00Z'),
          actor_name: 'System Administrator',
          actor_email: 'admin@kandypack.lk',
        },
        {
          log_id: 72,
          table_name: 'user_profiles',
          record_id: null,
          action: 'UPDATE',
          user_id: '00000000-0000-0000-0000-000000000001',
          old_data: { user_id: targetUserUuid, is_active: 1 },
          new_data: { user_id: targetUserUuid, is_active: 0 },
          created_at: new Date('2026-10-09T07:30:00Z'),
          actor_name: 'System Administrator',
          actor_email: 'admin@kandypack.lk',
        },
      ]);

      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].record_id).toBe(targetUserUuid);
      expect(body.items[1].record_id).toBe(targetUserUuid);
    });

    it('safely parses stringified JSON in old_data and new_data columns', async () => {
      vi.mocked(queryOne).mockResolvedValue({ total: 1 });
      vi.mocked(query).mockResolvedValue([
        {
          log_id: 81,
          table_name: 'products',
          record_id: 99,
          action: 'UPDATE',
          user_id: '00000000-0000-0000-0000-000000000001',
          old_data: JSON.stringify({ unit_price: 100 }),
          new_data: JSON.stringify({ unit_price: 120 }),
          created_at: '2026-10-09T14:00:00Z',
          actor_name: 'Admin',
          actor_email: 'admin@kandypack.lk',
        },
      ]);

      const req = createGetRequest();
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      const item = body.items[0];

      expect(item.old_data).toEqual({ unit_price: 100 });
      expect(item.new_data).toEqual({ unit_price: 120 });
    });
  });
});
