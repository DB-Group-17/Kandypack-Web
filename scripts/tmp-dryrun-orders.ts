/**
 * Throwaway dry-run harness for both order stages. Runs everything in a transaction, reports,
 * then ROLLS BACK. Nothing is committed. Delete after use.
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import type { RowDataPacket } from 'mysql2/promise';
import { pool, withUserContext } from '../lib/db';
import { BOOTSTRAP_ADMIN } from './seed/admin';
import { seedHistoricalOrders, seedCurrentQuarterOrders, seedOverflowTestOrder } from './seed/orders';

async function main(): Promise<void> {
  await withUserContext(BOOTSTRAP_ADMIN.user_id, BOOTSTRAP_ADMIN.app_role, async (conn) => {
    // InnoDB keeps AUTO_INCREMENT values consumed by a rolled-back transaction, so every dry run
    // advances the counter and the next one would allocate order IDs outside the spec range.
    // Harness concern, not a seed concern: reset it (DDL, so before the transaction opens).
    for (const table of ['orders', 'order_items', 'order_status_history', 'train_bookings', 'train_booking_items']) {
      await conn.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
    }

    await conn.beginTransaction();
    try {
      console.log('historical:', await seedHistoricalOrders(conn));
      console.log('current   :', await seedCurrentQuarterOrders(conn));
      console.log('overflow  :', await seedOverflowTestOrder(conn));

      const [dist] = await conn.query<RowDataPacket[]>(
        'SELECT status, COUNT(*) n FROM orders GROUP BY status ORDER BY status'
      );
      console.log('\nstatus distribution (all 45):', JSON.stringify(dist));

      const [range] = await conn.query<RowDataPacket[]>(
        'SELECT MIN(order_id) lo, MAX(order_id) hi, COUNT(*) n FROM orders'
      );
      console.log('order id range:', JSON.stringify(range[0]));

      const [nob] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) n FROM orders o WHERE o.order_id >= 24
            AND NOT EXISTS (SELECT 1 FROM train_bookings b WHERE b.order_id = o.order_id)`
      );
      console.log('current-quarter orders with NO booking (expect 0):', nob[0].n);

      const [histBook] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) n FROM train_bookings WHERE order_id <= 23'
      );
      console.log('historical orders with bookings (expect 0):', histBook[0].n);

      const [over] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) n FROM train_trips WHERE booked_space > total_capacity'
      );
      console.log('trips over capacity (expect 0):', over[0].n);

      const [trips] = await conn.query<RowDataPacket[]>(
        `SELECT trip_id, destination_city_id, total_capacity, booked_space, status
           FROM train_trips WHERE booked_space > 0 OR total_capacity = 50
          ORDER BY trip_id`
      );
      console.log('\ntrips with bookings, plus every 50-unit trip:');
      for (const t of trips) {
        console.log(
          `  trip ${String(t.trip_id).padStart(2)} city ${t.destination_city_id} ` +
            `cap ${String(t.total_capacity).padStart(3)} booked ${String(t.booked_space).padStart(7)} ${t.status}`
        );
      }

      const [bk] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) bookings, COUNT(DISTINCT order_id) distinct_orders FROM train_bookings'
      );
      console.log('\nbookings:', JSON.stringify(bk[0]));

      const [multi] = await conn.query<RowDataPacket[]>(
        `SELECT b.order_id, COUNT(*) n, GROUP_CONCAT(b.trip_id ORDER BY b.trip_id) trips,
                GROUP_CONCAT(b.space_booked ORDER BY b.trip_id) spaces
           FROM train_bookings b GROUP BY b.order_id HAVING n > 1`
      );
      console.log('orders split across trips (expect #46):', JSON.stringify(multi));

      const [hist] = await conn.query<RowDataPacket[]>(
        `SELECT o.status, COUNT(*) orders, SUM(h.n) history_rows FROM orders o
           JOIN (SELECT order_id, COUNT(*) n FROM order_status_history GROUP BY order_id) h
             ON h.order_id = o.order_id
          WHERE o.order_id >= 24 GROUP BY o.status ORDER BY o.status`
      );
      console.log('current-quarter history rows by status:', JSON.stringify(hist));
    } finally {
      await conn.rollback();
      console.log('\n🔁 ROLLED BACK — nothing was committed.');
    }
  });
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error('FAILED:', e);
    await pool.end();
    process.exit(1);
  });
