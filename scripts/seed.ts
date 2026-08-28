/**
 * @file scripts/seed.ts
 * @description Bootstrap admin seeding script for Kandypack.
 * 
 * Creates the initial system administrator account required to log in
 * and manage user accounts and master data.
 * 
 * Authority: Docs/03_architecture.md §6.3, Docs/04_database-schema-v4.md §11
 * Owner: Member 1 (Dineth)
 */

import 'dotenv/config';
import { pool, queryOne, withTransaction } from '../lib/db';
import { hashPassword } from '../lib/auth';

/**
 * Bootstrap administrator default credentials.
 */
const BOOTSTRAP_ADMIN = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@kandypack.lk',
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@Kandypack2026!',
  display_name: 'System Administrator',
  app_role: 'system_administrator' as const
};

/**
 * Executes the bootstrap admin seed process idempotently.
 */
async function seedBootstrapAdmin(): Promise<void> {
  console.log('🚀 Starting Kandypack Bootstrap Admin Seeding...');

  try {
    // 1. Check if bootstrap admin already exists
    const existingUser = await queryOne<{ user_id: string; email: string }>(
      'SELECT user_id, email FROM users WHERE email = ?',
      [BOOTSTRAP_ADMIN.email]
    );

    if (existingUser) {
      console.log(`ℹ️  Bootstrap admin (${BOOTSTRAP_ADMIN.email}) already exists. Skipping.`);
      return;
    }

    // 2. Hash the initial password with bcrypt (cost factor 12)
    console.log('🔐 Hashing administrator password...');
    const passwordHash = await hashPassword(BOOTSTRAP_ADMIN.password);

    // 3. Atomically insert into users and user_profiles tables
    await withTransaction(async (connection) => {
      // Insert users credential record
      await connection.execute(
        `INSERT INTO users (user_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [BOOTSTRAP_ADMIN.user_id, BOOTSTRAP_ADMIN.email, passwordHash]
      );

      // Insert matching user_profiles role record
      await connection.execute(
        `INSERT INTO user_profiles (user_id, app_role, display_name_override, employee_id)
         VALUES (?, ?, ?, NULL)`,
        [BOOTSTRAP_ADMIN.user_id, BOOTSTRAP_ADMIN.app_role, BOOTSTRAP_ADMIN.display_name]
      );
    });

    console.log('----------------------------------------------------');
    console.log('✅ Bootstrap Admin Account Successfully Created:');
    console.log(`   User ID:   ${BOOTSTRAP_ADMIN.user_id}`);
    console.log(`   Email:     ${BOOTSTRAP_ADMIN.email}`);
    console.log('   Password:  [REDACTED — Sourced from BOOTSTRAP_ADMIN_PASSWORD / default seed spec]');
    console.log(`   Role:      ${BOOTSTRAP_ADMIN.app_role}`);
    console.log('----------------------------------------------------');
    console.log('⚠️  IMPORTANT: Please change this default password after first login.');
  } catch (error) {
    console.error('❌ Error seeding bootstrap admin:', error);
    throw error;
  } finally {
    // Gracefully close database connection pool
    try {
      await pool.end();
    } catch (closeErr) {
      console.error('Warning: Error closing MySQL pool:', closeErr);
    }
  }
}

// Execute seed script
seedBootstrapAdmin()
  .then(() => {
    console.log('✨ Seed script completed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Fatal error in seed execution:', err);
    process.exit(1);
  });
