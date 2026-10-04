/**
 * @file tests/api/admin-users-protection.test.ts
 * @description Integration and security tests for PATCH /api/users/:id admin protection guards.
 *
 * Verifies that:
 * - Administrators cannot deactivate their own account (HTTP 400 SELF_DEACTIVATION_PROHIBITED).
 * - Administrators cannot demote their own account away from system_administrator (HTTP 400 SELF_DEMOTION_PROHIBITED).
 * - Attempts to deactivate or demote the last remaining active system administrator are rejected
 *   with HTTP 400 LAST_ADMIN_PROTECTED, backed by database row-level locking (SELECT ... FOR UPDATE).
 * - Valid modifications of another administrator remain possible when multiple active administrators exist.
 * - Test setup and teardown are completely idempotent, leaving seeded records unchanged with zero residue.
 *
 * Authority: Docs/03_architecture.md §6, Docs/05_api-and-pages.md §A10.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PATCH } from '@/app/api/users/[id]/route';
import { pool } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';
import type { SessionUser } from '@/lib/auth';

const PRIMARY_ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const SECOND_ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const DUMMY_HASH = '$2a$12$e80yq7K.wV5iHwGqT9w7UeW3P0/Z9g/3m.D2Y7N8B6Z7K0W8H9Q2.';

let mockSession: SessionUser = {
  user_id: PRIMARY_ADMIN_ID,
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
 * Helper to construct incoming PATCH request for /api/users/:id.
 */
function createPatchRequest(targetUserId: string, payload: Record<string, unknown>): Request {
  return new Request(`http://localhost:3000/api/users/${targetUserId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Clean up test records from database.
 */
async function cleanupTestUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM user_profiles WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);
}

describe('API Route: PATCH /api/users/:id Administrator Safeguards', () => {
  beforeAll(async () => {
    // 1. Verify connectivity
    const [alive] = await pool.query<RowDataPacket[]>('SELECT 1 AS alive');
    expect(alive[0]?.alive).toBe(1);

    // 2. Ensure clean slate by removing any prior test user residue
    await cleanupTestUser(SECOND_ADMIN_ID);

    // 3. Ensure primary admin account is in canonical active system_administrator state
    await pool.query('UPDATE users SET is_active = 1 WHERE user_id = ?', [PRIMARY_ADMIN_ID]);
    await pool.query(
      "UPDATE user_profiles SET is_active = 1, app_role = 'system_administrator' WHERE user_id = ?",
      [PRIMARY_ADMIN_ID]
    );
  });

  afterAll(async () => {
    try {
      await cleanupTestUser(SECOND_ADMIN_ID);
      // Ensure primary admin account is restored
      await pool.query('UPDATE users SET is_active = 1 WHERE user_id = ?', [PRIMARY_ADMIN_ID]);
      await pool.query(
        "UPDATE user_profiles SET is_active = 1, app_role = 'system_administrator' WHERE user_id = ?",
        [PRIMARY_ADMIN_ID]
      );
    } finally {
      await pool.end();
    }
  });

  beforeEach(() => {
    // Default to primary administrator session
    mockSession = {
      user_id: PRIMARY_ADMIN_ID,
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    };
  });

  it('rejects self-deactivation of currently signed-in administrator account with HTTP 400', async () => {
    mockSession.user_id = PRIMARY_ADMIN_ID;

    const req = createPatchRequest(PRIMARY_ADMIN_ID, { is_active: false });
    const res = await PATCH(req, { params: Promise.resolve({ id: PRIMARY_ADMIN_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body?.error?.code).toBe('SELF_DEACTIVATION_PROHIBITED');
    expect(body?.error?.message).toMatch(/cannot deactivate their own account/i);

    // Verify primary admin remains active in database
    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT is_active FROM users WHERE user_id = ?',
      [PRIMARY_ADMIN_ID]
    );
    expect(userRows[0]?.is_active).toBe(1);
  });

  it('rejects self-demotion of currently signed-in administrator account with HTTP 400', async () => {
    mockSession.user_id = PRIMARY_ADMIN_ID;

    const req = createPatchRequest(PRIMARY_ADMIN_ID, { app_role: 'logistics_manager' });
    const res = await PATCH(req, { params: Promise.resolve({ id: PRIMARY_ADMIN_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body?.error?.code).toBe('SELF_DEMOTION_PROHIBITED');
    expect(body?.error?.message).toMatch(/cannot change their own role away from system administrator/i);

    // Verify primary admin role remains system_administrator
    const [profileRows] = await pool.query<RowDataPacket[]>(
      'SELECT app_role FROM user_profiles WHERE user_id = ?',
      [PRIMARY_ADMIN_ID]
    );
    expect(profileRows[0]?.app_role).toBe('system_administrator');
  });

  it('rejects deactivating the last remaining active system administrator with HTTP 400', async () => {
    // Simulate request coming from a different session identity (e.g. secondary actor)
    mockSession.user_id = '99999999-9999-9999-9999-999999999999';
    mockSession.role = 'system_administrator';

    // Target PRIMARY_ADMIN_ID who is currently the ONLY active system_administrator
    const req = createPatchRequest(PRIMARY_ADMIN_ID, { is_active: false });
    const res = await PATCH(req, { params: Promise.resolve({ id: PRIMARY_ADMIN_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body?.error?.code).toBe('LAST_ADMIN_PROTECTED');
    expect(body?.error?.message).toMatch(/last remaining active system administrator/i);

    // Verify primary admin remains active
    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT is_active FROM users WHERE user_id = ?',
      [PRIMARY_ADMIN_ID]
    );
    expect(userRows[0]?.is_active).toBe(1);
  });

  it('rejects demoting the last remaining active system administrator with HTTP 400', async () => {
    mockSession.user_id = '99999999-9999-9999-9999-999999999999';
    mockSession.role = 'system_administrator';

    const req = createPatchRequest(PRIMARY_ADMIN_ID, { app_role: 'order_entry_clerk' });
    const res = await PATCH(req, { params: Promise.resolve({ id: PRIMARY_ADMIN_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body?.error?.code).toBe('LAST_ADMIN_PROTECTED');
    expect(body?.error?.message).toMatch(/last remaining active system administrator/i);

    // Verify primary admin role remains unchanged
    const [profileRows] = await pool.query<RowDataPacket[]>(
      'SELECT app_role FROM user_profiles WHERE user_id = ?',
      [PRIMARY_ADMIN_ID]
    );
    expect(profileRows[0]?.app_role).toBe('system_administrator');
  });

  it('allows modifying another administrator when multiple active administrators exist', async () => {
    // 1. Provision a temporary second active system administrator
    await pool.query(
      `INSERT INTO users (user_id, email, password_hash, is_active)
       VALUES (?, 'second.admin.test@kandypack.lk', ?, 1)`,
      [SECOND_ADMIN_ID, DUMMY_HASH]
    );
    await pool.query(
      `INSERT INTO user_profiles (user_id, app_role, display_name_override, is_active)
       VALUES (?, 'system_administrator', 'Second Admin Test', 1)`,
      [SECOND_ADMIN_ID]
    );

    // 2. As primary admin, demote the second admin to logistics_manager (now permitted because primary remains)
    mockSession.user_id = PRIMARY_ADMIN_ID;
    mockSession.role = 'system_administrator';

    const reqDemote = createPatchRequest(SECOND_ADMIN_ID, { app_role: 'logistics_manager' });
    const resDemote = await PATCH(reqDemote, {
      params: Promise.resolve({ id: SECOND_ADMIN_ID }),
    });
    const bodyDemote = await resDemote.json();

    expect(resDemote.status).toBe(200);
    expect(bodyDemote.app_role).toBe('logistics_manager');

    // 3. Deactivate the second admin (now permitted)
    const reqDeactivate = createPatchRequest(SECOND_ADMIN_ID, { is_active: false });
    const resDeactivate = await PATCH(reqDeactivate, {
      params: Promise.resolve({ id: SECOND_ADMIN_ID }),
    });
    const bodyDeactivate = await resDeactivate.json();

    expect(resDeactivate.status).toBe(200);
    expect(bodyDeactivate.is_active).toBe(false);

    // 4. Clean up the second admin
    await cleanupTestUser(SECOND_ADMIN_ID);
  });
});
