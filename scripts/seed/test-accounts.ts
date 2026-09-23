/**
 * @file scripts/seed/test-accounts.ts
 * @description Development-only login accounts, one per non-admin role
 * (Docs/06_seed-data-spec.md §12).
 *
 * Safety rules agreed for this stage:
 * - The password comes only from `SEED_TEST_PASSWORD`. There is no fallback, so no usable
 *   credential is ever committed to the repository.
 * - The accounts are never created when `NODE_ENV=production`.
 * - Skipping this stage never affects the master data in the same transaction.
 *
 * Owner: Member 1 (Dineth)
 */

import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { hashPassword } from '../../lib/auth';
import { insertMissing, logStage, type SeedRow } from './helpers';

/**
 * Test accounts. Each links to a seeded employee of the matching type (see data/people.ts ID
 * layout), so `user_profiles.display_name_override` stays NULL per `chk_user_profiles_name`
 * and login resolves the display name and home store from `employees`.
 */
const TEST_ACCOUNTS = [
  { user_id: '00000000-0000-0000-0000-000000000002', email: 'logistics@kandypack.lk', app_role: 'logistics_manager', employee_id: 1 },
  { user_id: '00000000-0000-0000-0000-000000000003', email: 'clerk@kandypack.lk', app_role: 'order_entry_clerk', employee_id: 3 },
  // Colombo store manager (employee 6, store 1): exercises own-store / own-city scoping
  { user_id: '00000000-0000-0000-0000-000000000004', email: 'store.colombo@kandypack.lk', app_role: 'store_manager', employee_id: 6 },
  { user_id: '00000000-0000-0000-0000-000000000005', email: 'fleet@kandypack.lk', app_role: 'fleet_supervisor', employee_id: 12 }
] as const;

/**
 * Decides whether test accounts may be created and, if so, hashes the shared password.
 * Called **before** the master-data transaction starts, so the slow bcrypt work (cost 12)
 * does not hold database locks open.
 *
 * @returns The bcrypt hash to store, or `null` when the stage must be skipped
 */
export async function prepareTestAccountPassword(): Promise<string | null> {
  if (process.env.NODE_ENV === 'production') {
    console.warn('   ⚠️  NODE_ENV=production — test role accounts will not be created.');
    return null;
  }

  const password = process.env.SEED_TEST_PASSWORD;
  if (!password) {
    console.warn('   ⚠️  SEED_TEST_PASSWORD is not set — test role accounts will be skipped.');
    return null;
  }

  return hashPassword(password);
}

/**
 * Inserts the test accounts that do not exist yet: the `users` row first, then its
 * `user_profiles` row (FK `fk_up_user`).
 *
 * An account is skipped entirely when its email already belongs to a *different* user
 * (e.g. someone created that address through the admin UI). Inserting it would violate
 * `uq_users_email` and roll back the whole shared transaction.
 *
 * @param conn         - Transactional connection with user context applied
 * @param passwordHash - Hash from `prepareTestAccountPassword`, or null to skip the stage
 */
export async function seedTestAccounts(conn: PoolConnection, passwordHash: string | null): Promise<void> {
  if (passwordHash === null) {
    logStage('test accounts', 0, 0);
    return;
  }

  const [existing] = await conn.query<RowDataPacket[]>(
    'SELECT user_id, email FROM users WHERE email IN (?)',
    [TEST_ACCOUNTS.map((account) => account.email)]
  );
  const ownerByEmail = new Map(existing.map((row) => [String(row.email).toLowerCase(), String(row.user_id)]));

  const accounts = TEST_ACCOUNTS.filter((account) => {
    const owner = ownerByEmail.get(account.email);
    if (owner && owner !== account.user_id) {
      console.warn(`   ⚠️  ${account.email} already belongs to another user — skipping this test account.`);
      return false;
    }
    return true;
  });

  const users: SeedRow[] = accounts.map((account) => ({
    user_id: account.user_id,
    email: account.email,
    password_hash: passwordHash,
    is_active: 1
  }));

  const profiles: SeedRow[] = accounts.map((account) => ({
    user_id: account.user_id,
    employee_id: account.employee_id,
    app_role: account.app_role,
    is_active: 1
  }));

  await insertMissing(conn, 'users', 'user_id', users);
  await insertMissing(conn, 'user_profiles', 'user_id', profiles);
}
