/**
 * @file scripts/seed/master-data.ts
 * @description Baseline master data, train trips and test accounts in one transaction
 * (Docs/06_seed-data-spec.md §1–§8 and §12).
 *
 * Data flow:
 * 1. Hash the test-account password (or decide to skip) before touching the database.
 * 2. Borrow one connection via `withUserContext`, setting `@current_user_id` to the bootstrap
 *    admin so every `trg_audit_*_ins` row is attributed rather than NULL.
 * 3. Begin a transaction on that same connection (session variables are per connection).
 * 4. Insert tables in foreign-key dependency order.
 * 5. Commit, or roll back for a dry run or on any error, so the shared DB is never half-seeded.
 *
 * Owner: Member 1 (Dineth)
 */

import { withUserContext } from '../../lib/db';
import { BOOTSTRAP_ADMIN } from './admin';
import { insertMissing } from './helpers';
import { CITIES, STORES, ROUTES, ROUTE_COVERAGE_AREAS } from './data/locations';
import { PRODUCTS, CUSTOMERS } from './data/catalog';
import { EMPLOYEES, DRIVERS, ASSISTANTS, TRUCKS } from './data/people';
import { seedTrainTrips } from './train-trips';
import { prepareTestAccountPassword, seedTestAccounts } from './test-accounts';

/**
 * Seeds the baseline master data, train trips and test role accounts.
 *
 * Insert order (each parent before its children):
 * cities → stores → products → customers → routes → route_coverage_areas
 *   → employees → drivers → assistants → trucks → train_trips → users/user_profiles
 *
 * Assumptions:
 * - The bootstrap admin already exists (Stage 1 guarantees it), because `audit_log.user_id`
 *   references `user_profiles(user_id)`.
 * - The `withUserContext` fix resets the session variables before the connection returns to the pool.
 *
 * @param dryRun - When true, run every insert (so all constraints and triggers fire) then roll back
 * @throws Rethrows the first database error after rolling the transaction back
 */
export async function seedMasterData(dryRun: boolean): Promise<void> {
  console.log(`\n🏗️  Stage 2 — Master data, train trips and test accounts${dryRun ? ' (dry run)' : ''}`);

  // Done before the transaction: bcrypt is slow and must not hold row locks open
  const testAccountPasswordHash = await prepareTestAccountPassword();

  await withUserContext(BOOTSTRAP_ADMIN.user_id, BOOTSTRAP_ADMIN.app_role, async (conn) => {
    await conn.beginTransaction();
    try {
      await insertMissing(conn, 'cities', 'city_id', CITIES);
      await insertMissing(conn, 'stores', 'store_id', STORES);
      await insertMissing(conn, 'products', 'product_id', PRODUCTS);
      await insertMissing(conn, 'customers', 'customer_id', CUSTOMERS);
      await insertMissing(conn, 'routes', 'route_id', ROUTES);
      await insertMissing(conn, 'route_coverage_areas', 'coverage_id', ROUTE_COVERAGE_AREAS);
      // Employees must precede drivers/assistants: the subtype triggers look up employee_type
      await insertMissing(conn, 'employees', 'employee_id', EMPLOYEES);
      await insertMissing(conn, 'drivers', 'driver_id', DRIVERS);
      await insertMissing(conn, 'assistants', 'assistant_id', ASSISTANTS);
      await insertMissing(conn, 'trucks', 'truck_id', TRUCKS);
      await seedTrainTrips(conn);
      // Last: test accounts link to employees seeded above
      await seedTestAccounts(conn, testAccountPasswordHash);

      if (dryRun) {
        await conn.rollback();
        console.log('   🔁 Dry run complete — all inserts succeeded and were rolled back. No data changed.');
      } else {
        await conn.commit();
        console.log('   ✅ Committed.');
      }
    } catch (error) {
      await conn.rollback();
      console.error('   ❌ Stage failed — transaction rolled back. No master data was changed.');
      throw error;
    }
  });
}
