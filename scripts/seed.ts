/**
 * @file scripts/seed.ts
 * @description Entry point for `npm run db:seed` — seeds the Kandypack baseline dataset.
 *
 * Stages (run in order; each is safe to re-run and inserts only missing rows):
 * 1. Bootstrap admin            — scripts/seed/admin.ts (own transaction)
 * 2. Master data + train trips  — scripts/seed/master-data.ts (one shared transaction,
 *    + test role accounts          run as the bootstrap admin)
 * 3. Orders                      — scripts/seed/orders.ts (own transaction): the 45 baseline
 *                                  orders plus the capacity-overflow test order (#46)
 * 4. Logistics                   — scripts/seed/logistics.ts (own transaction): trips arrived,
 *                                  opening stock, receipts, 10 truck schedules and deliveries.
 *                                  All-or-nothing: runs only while the logistics tables are empty
 *

 * Usage:
 *   npm run db:seed                   # seed the database pointed to by DATABASE_URL
 *   npx tsx scripts/seed.ts --dry-run # execute every insert, then roll back
 *
 * Coordinate in the team channel before running against the shared dev database
 * (Docs/10_local-setup.md §11).
 *
 * Authority: Docs/06_seed-data-spec.md, Docs/03_architecture.md §17 and §21
 * Owner: Member 1 (Dineth)
 */

import path from 'path';
import dotenv from 'dotenv';

// Load .env.local for variables read at run time (SEED_TEST_PASSWORD, BOOTSTRAP_ADMIN_PASSWORD).
// lib/db.ts loads DATABASE_URL itself when it is imported, since imports are evaluated first.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import { pool } from '../lib/db';
import { seedBootstrapAdmin } from './seed/admin';
import { seedMasterData } from './seed/master-data';
import { seedOrders } from './seed/orders';
import { seedLogistics } from './seed/logistics';

/** True when `--dry-run` was passed: every stage runs, nothing is committed. */
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Runs all seed stages in dependency order and always closes the connection pool once.
 * The pool is closed here (not inside a stage) so later stages still have connections.
 *
 * @returns Resolves when every stage has finished
 * @throws Rethrows the first stage error after the pool is closed
 */
async function main(): Promise<void> {
  console.log(`🚀 Kandypack seed${DRY_RUN ? ' — DRY RUN (nothing will be committed)' : ''}`);

  try {
    await seedBootstrapAdmin(DRY_RUN);
    await seedMasterData(DRY_RUN);
    // Orders after master data: every stage above provides foreign keys this one depends on.
    await seedOrders(DRY_RUN);
    // Logistics last: schedules, deliveries and stock all hang off the seeded orders' bookings.
    await seedLogistics(DRY_RUN);
  } finally {
    try {
      await pool.end();
    } catch (closeError) {
      console.error('Warning: error closing MySQL pool:', closeError);
    }
  }
}

main()
  .then(() => {
    console.log('\n✨ Seed script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed script failed:', error);
    process.exit(1);
  });
