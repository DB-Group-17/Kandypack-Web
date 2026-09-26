/**
 * @file scripts/seed/admin.ts
 * @description Bootstrap administrator seed stage.
 *
 * Creates the first `system_administrator` login, which cannot be created through the UI
 * because no admin exists yet (Docs/03_architecture.md §6.3). It runs before every other
 * stage: later stages set `@current_user_id` to this account, and `audit_log.user_id`
 * references `user_profiles(user_id)`, so the admin must already exist.
 *
 * Authority: Docs/03_architecture.md §6.3, Docs/04_database-schema-v4.md §11
 * Owner: Member 1 (Dineth)
 */

import { queryOne, withTransaction } from '../../lib/db';
import { hashPassword } from '../../lib/auth';

/**
 * Bootstrap administrator identity. The fixed UUID lets other stages reference it
 * as the acting user without an extra lookup.
 */
export const BOOTSTRAP_ADMIN = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@kandypack.lk',
  display_name: 'System Administrator',
  app_role: 'system_administrator' as const
};

/**
 * Creates the bootstrap admin (`users` + `user_profiles`) if it does not exist yet.
 * Uses its own transaction so the credential and profile rows are written together.
 *
 * Password source: `BOOTSTRAP_ADMIN_PASSWORD`, falling back to the historical Phase 0
 * default. The fallback is kept unchanged so the already-seeded shared admin keeps working.
 *
 * Dry-run behaviour: nothing is written. If the admin is missing, the stage throws,
 * because the master-data dry run needs a real admin profile to attribute audit rows to.
 *
 * @param dryRun - When true, only verify the admin exists
 * @throws If the admin is missing during a dry run, or on any database error
 */
export async function seedBootstrapAdmin(dryRun: boolean): Promise<void> {
  console.log('\n👤 Stage 1 — Bootstrap admin');

  const existingUser = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM users WHERE email = ?',
    [BOOTSTRAP_ADMIN.email]
  );

  if (existingUser) {
    console.log(`   ${BOOTSTRAP_ADMIN.email} already exists. Skipping.`);
    return;
  }

  if (dryRun) {
    throw new Error(
      'Dry run requires the bootstrap admin to exist. Run `npm run db:seed` once (without --dry-run) first.'
    );
  }

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@Kandypack2026!';
  const passwordHash = await hashPassword(password);

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO users (user_id, email, password_hash, is_active)
       VALUES (?, ?, ?, 1)`,
      [BOOTSTRAP_ADMIN.user_id, BOOTSTRAP_ADMIN.email, passwordHash]
    );

    // Admin has no employees row, so the profile uses display_name_override (chk_user_profiles_name)
    await connection.execute(
      `INSERT INTO user_profiles (user_id, app_role, display_name_override, employee_id)
       VALUES (?, ?, ?, NULL)`,
      [BOOTSTRAP_ADMIN.user_id, BOOTSTRAP_ADMIN.app_role, BOOTSTRAP_ADMIN.display_name]
    );
  });

  console.log(`   Created ${BOOTSTRAP_ADMIN.email} (${BOOTSTRAP_ADMIN.app_role}).`);
  console.log('   ⚠️  Change this default password after first login.');
}
