/**
 * @file scripts/seed/logistics.ts
 * @description Baseline logistics stage (Docs/06_seed-data-spec.md §10–§11): truck schedules,
 *              deliveries, store inventory and inventory transactions.
 *
 * Runs after the orders stage, in one transaction as the bootstrap admin. Steps, in order:
 * 1. Mark the current-quarter train trips `Arrived` (their arrival time has passed).
 * 2. Insert each store's opening stock balance as `adjustment` transactions (spec Decision C).
 * 3. Insert `receive` transactions for the 10 eligible orders' bookings.
 * 4. Create one truck schedule per order through `schedule_truck_delivery`, so
 *    `trg_validate_truck_schedule` checks every roster rule exactly as it does for the API.
 * 5. Insert one delivery per schedule.
 * 6. Complete three deliveries through `complete_delivery` (dispatch + order → `Delivered`).
 * 7. Put two deliveries `In Progress`; the remaining five stay `Scheduled`.
 * 8. Assert the end state.
 *
 * Every stock movement goes through `inventory_transactions`, so `trg_apply_inventory_transaction`
 * builds `store_inventory` itself — no `store_inventory` row is written directly.
 *
 * Why receipts are inserted directly rather than via `receive_goods_at_store` (plan decision 2):
 * the procedure also sets the order to `At Store`, which would move the five `Out for Delivery`
 * orders backwards and write a false "Out for Delivery → At Store" row into their status
 * timeline. The insert below is the procedure's own `INSERT … SELECT`, minus that status update.
 *
 * Owner: Member 1 (Dineth)
 */

import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withUserContext } from '../../lib/db';
import { BOOTSTRAP_ADMIN } from './admin';
import { insertMissing, logStage, type SeedRow } from './helpers';
import {
  LOW_STOCK_PRODUCT_BY_STORE,
  LOW_STOCK_QUANTITY,
  OPENING_QUANTITY,
  PRODUCT_IDS,
  SEED_DELIVERIES,
  STORE_IDS,
  TRIPS_TO_ARRIVE,
  type SeedDelivery
} from './data/logistics';

/** Tables this stage fills; their AUTO_INCREMENT is reset together when all are empty. */
const LOGISTICS_TABLES = [
  'truck_schedules',
  'deliveries',
  'inventory_transactions',
  'store_inventory'
] as const;

/** SQL for the first day of the current calendar quarter — the opening balance's timestamp. */
const CURRENT_QUARTER_START = 'MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL QUARTER(CURDATE()) - 1 QUARTER';

/**
 * Seeds truck schedules, deliveries and store stock (spec §10–§11).
 *
 * The stage is all-or-nothing: it runs only when every logistics table is empty and skips when
 * the baseline is already present. A partially filled state is refused, because schedule IDs come
 * from AUTO_INCREMENT and stock is cumulative — topping up would double-count.
 *
 * @param dryRun - When true, every step executes and is then rolled back
 * @throws If the tables are partially filled, a procedure or trigger rejects a step, or an
 *         end-state assertion fails (the transaction is rolled back first)
 */
export async function seedLogistics(dryRun: boolean): Promise<void> {
  console.log(`\n🚚 Stage 4 — Logistics${dryRun ? ' (dry run)' : ''}`);

  await withUserContext(BOOTSTRAP_ADMIN.user_id, BOOTSTRAP_ADMIN.app_role, async (conn) => {
    const counts = await readTableCounts(conn);
    const filled = LOGISTICS_TABLES.filter((table) => counts[table] > 0);

    if (filled.length === LOGISTICS_TABLES.length) {
      console.log('   Logistics baseline already present — nothing to do.');
      return;
    }
    if (filled.length > 0) {
      throw new Error(
        `Seed error: logistics tables are partially filled (${filled.map((t) => `${t}=${counts[t]}`).join(', ')}).\n` +
          '  This stage only seeds an empty logistics state: schedule IDs come from AUTO_INCREMENT and\n' +
          '  stock is cumulative, so topping up a partial state would double-count. Investigate before re-running.'
      );
    }

    await prepareAutoIncrement(conn);

    await conn.beginTransaction();
    try {
      const today = await readDatabaseToday(conn);

      await markTripsArrived(conn);
      await seedOpeningBalance(conn);
      await receiveBookedGoods(conn);
      const scheduleIds = await createSchedules(conn, today);
      await insertDeliveries(conn, scheduleIds);
      await completeDeliveries(conn, scheduleIds);
      await startInProgressDeliveries(conn, scheduleIds);
      await assertEndState(conn);

      if (dryRun) {
        await conn.rollback();
        console.log('   🔁 Dry run complete — all steps succeeded and were rolled back. No data changed.');
      } else {
        await conn.commit();
        console.log('   ✅ Committed.');
      }
    } catch (error) {
      await conn.rollback();
      console.error('   ❌ Stage failed — transaction rolled back. No logistics data was changed.');
      throw error;
    }
  });
}

/**
 * Reads the row count of every logistics table, for the all-or-nothing guard.
 *
 * @param conn - Connection with user context applied
 * @returns Count per table name
 */
async function readTableCounts(conn: PoolConnection): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of LOGISTICS_TABLES) {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${table}`);
    counts[table] = Number(rows[0].n);
  }
  return counts;
}

/**
 * Resets the logistics tables' AUTO_INCREMENT counters so a first real run starts IDs at 1.
 *
 * InnoDB does not reclaim values consumed by a rolled-back transaction, so every dry run would
 * otherwise push schedule and transaction IDs further up. Only called once all four tables are
 * confirmed empty. Runs before the transaction because `ALTER TABLE` is DDL and forces an implicit
 * COMMIT (the same reason as `prepareAutoIncrement` in scripts/seed/orders.ts).
 *
 * @param conn - Connection with user context applied, before any transaction is opened
 */
async function prepareAutoIncrement(conn: PoolConnection): Promise<void> {
  for (const table of LOGISTICS_TABLES) {
    await conn.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
  }
}

/**
 * Reads the database's current date as `YYYY-MM-DD`.
 *
 * Schedule dates are derived from this rather than the Node clock, so they agree with the
 * `NOW()`-based timestamps the triggers write and with the dates earlier stages resolved.
 *
 * @param conn - Transactional connection
 * @returns Today's date on the database clock
 */
async function readDatabaseToday(conn: PoolConnection): Promise<string> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today"
  );
  return String(rows[0].today);
}

/**
 * Shifts a date by a number of working days, where working days are Monday–Saturday.
 *
 * Offset 0 on a Sunday resolves to the Saturday before, so "today" deliveries never land on a
 * non-operating day. Arithmetic is done in UTC on a date-only value, so no timezone can move it.
 *
 * @param isoDate - Start date as `YYYY-MM-DD`
 * @param offset  - Working days to move; negative goes back in time
 * @returns The resulting date as `YYYY-MM-DD`
 */
function shiftWorkingDays(isoDate: string, offset: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const isSunday = () => date.getUTCDay() === 0;
  const step = offset < 0 ? -1 : 1;

  if (offset === 0 && isSunday()) date.setUTCDate(date.getUTCDate() - 1);

  for (let moved = 0; moved < Math.abs(offset); ) {
    date.setUTCDate(date.getUTCDate() + step);
    if (!isSunday()) moved++; // Sundays do not count as a working day
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Marks the current-quarter trips `Arrived` (plan decision 1).
 *
 * Only trips whose arrival time has passed are updated, so the data never claims a future trip
 * has arrived. If any listed trip is still in the future the stage fails rather than receiving
 * goods that are not there yet.
 *
 * @param conn - Transactional connection
 * @throws If any trip is not `Arrived` afterwards
 */
async function markTripsArrived(conn: PoolConnection): Promise<void> {
  const ids = [...TRIPS_TO_ARRIVE];
  const [result] = await conn.query(
    `UPDATE train_trips SET status = 'Arrived'
      WHERE trip_id IN (?) AND status = 'Scheduled' AND arrival_datetime <= NOW()`,
    [ids]
  );

  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT trip_id FROM train_trips WHERE trip_id IN (?) AND status <> 'Arrived'",
    [ids]
  );
  if (rows.length > 0) {
    throw new Error(
      `Seed error: trips ${rows.map((r) => r.trip_id).join(', ')} could not be marked Arrived — ` +
        'their arrival time is still in the future, so their goods cannot be received yet.'
    );
  }

  logStage('trips marked Arrived', (result as { affectedRows: number }).affectedRows, 0);
}

/**
 * Inserts every store's opening stock as `adjustment` transactions (spec §11, Decision C).
 *
 * 6 stores × 12 products = 72 rows, dated to the start of the current quarter so they sort
 * before every receipt and dispatch in the inventory history. Each store's low-stock product
 * opens at `LOW_STOCK_QUANTITY` so the dashboard alert always has a row.
 *
 * @param conn - Transactional connection with user context applied
 */
async function seedOpeningBalance(conn: PoolConnection): Promise<void> {
  let inserted = 0;
  for (const storeId of STORE_IDS) {
    for (const productId of PRODUCT_IDS) {
      const quantity =
        LOW_STOCK_PRODUCT_BY_STORE[storeId] === productId ? LOW_STOCK_QUANTITY : OPENING_QUANTITY[productId];

      // No booking or delivery link: chk_it_fk_consistency requires both NULL for 'adjustment'.
      await conn.query(
        `INSERT INTO inventory_transactions
           (store_id, product_id, change_qty, transaction_type, created_by, created_at)
         VALUES (?, ?, ?, 'adjustment', ?, ${CURRENT_QUARTER_START})`,
        [storeId, productId, quantity, BOOTSTRAP_ADMIN.user_id]
      );
      inserted++;
    }
  }
  logStage('opening balance', inserted, 0);
}

/**
 * Receives the goods booked for the 10 eligible orders (plan decision 2).
 *
 * The `INSERT … SELECT` is `receive_goods_at_store`'s own, run for every booking of those orders:
 * the store is the one in the trip's destination city and each line ships `quantity_shipped`.
 * `created_at` is the trip's arrival time, so the inventory history reads in real order.
 *
 * @param conn - Transactional connection with user context applied
 * @throws If any booking is on a trip that has not arrived
 */
async function receiveBookedGoods(conn: PoolConnection): Promise<void> {
  const orderIds = SEED_DELIVERIES.map((delivery) => delivery.order_id);

  // The procedure refuses unarrived trips; keep that guarantee for the direct insert too.
  const [notArrived] = await conn.query<RowDataPacket[]>(
    `SELECT b.booking_id FROM train_bookings b JOIN train_trips t ON t.trip_id = b.trip_id
      WHERE b.order_id IN (?) AND t.status <> 'Arrived'`,
    [orderIds]
  );
  if (notArrived.length > 0) {
    throw new Error(
      `Seed error: bookings ${notArrived.map((r) => r.booking_id).join(', ')} are on trips that have not arrived.`
    );
  }

  const [result] = await conn.query(
    `INSERT INTO inventory_transactions
       (store_id, product_id, change_qty, transaction_type, train_booking_id, created_by, created_at)
     SELECT s.store_id, oi.product_id, bi.quantity_shipped, 'receive', b.booking_id, ?, t.arrival_datetime
       FROM train_bookings b
       JOIN train_trips t          ON t.trip_id = b.trip_id
       JOIN stores s               ON s.city_id = t.destination_city_id
       JOIN train_booking_items bi ON bi.booking_id = b.booking_id
       JOIN order_items oi         ON oi.order_item_id = bi.order_item_id
      WHERE b.order_id IN (?)
      ORDER BY b.booking_id, oi.product_id`,
    [BOOTSTRAP_ADMIN.user_id, orderIds]
  );
  logStage('goods received', (result as { affectedRows: number }).affectedRows, 0);
}

/**
 * Creates one truck schedule per seeded delivery through `schedule_truck_delivery`.
 *
 * Going through the procedure (rather than a direct INSERT) means `trg_validate_truck_schedule`
 * checks every roster rule — overlaps, the driver 2-hour break, the assistant consecutive-route
 * limit, the weekly hour caps and the 06:00–20:00 window. A rejection aborts the whole stage;
 * the baseline must pass cleanly (spec §10).
 *
 * Schedules are created in chronological order so the chain and weekly-hour checks see earlier
 * schedules first, as they would in real use.
 *
 * @param conn  - Transactional connection with user context applied (admin is an allowed role)
 * @param today - The database's current date, `YYYY-MM-DD`
 * @returns Map of `delivery_id` → the `schedule_id` created for it
 */
async function createSchedules(conn: PoolConnection, today: string): Promise<Map<number, number>> {
  const scheduleIds = new Map<number, number>();
  const byTime = [...SEED_DELIVERIES].sort((a, b) => a.workingDayOffset - b.workingDayOffset);

  for (const delivery of byTime) {
    const startTime = `${shiftWorkingDays(today, delivery.workingDayOffset)} ${String(delivery.startHour).padStart(2, '0')}:00:00`;

    // The procedure derives end_time from the route's max_delivery_time_hours.
    await conn.query('CALL schedule_truck_delivery(?, ?, ?, ?, ?, @seed_schedule_id)', [
      delivery.truck_id,
      delivery.driver_id,
      delivery.assistant_id,
      delivery.route_id,
      startTime
    ]);

    const [rows] = await conn.query<RowDataPacket[]>('SELECT @seed_schedule_id AS schedule_id');
    const scheduleId = Number(rows[0]?.schedule_id);
    if (!scheduleId) {
      throw new Error(`Seed error: schedule_truck_delivery returned no ID for order ${delivery.order_id}.`);
    }
    scheduleIds.set(delivery.delivery_id, scheduleId);
  }

  logStage('truck_schedules', scheduleIds.size, 0);
  return scheduleIds;
}

/**
 * Inserts one `Scheduled` delivery per schedule.
 *
 * `trg_check_active_delivery_on_insert` rejects a second active delivery for the same order, so
 * this also confirms no order was given two.
 *
 * @param conn        - Transactional connection with user context applied
 * @param scheduleIds - `delivery_id` → `schedule_id` from `createSchedules`
 */
async function insertDeliveries(conn: PoolConnection, scheduleIds: Map<number, number>): Promise<void> {
  const rows: SeedRow[] = SEED_DELIVERIES.map((delivery) => ({
    delivery_id: delivery.delivery_id,
    order_id: delivery.order_id,
    truck_schedule_id: requireScheduleId(scheduleIds, delivery),
    status: 'Scheduled'
  }));
  await insertMissing(conn, 'deliveries', 'delivery_id', rows);
}

/**
 * Completes the `completed` deliveries through `complete_delivery`, then backdates them.
 *
 * The procedure marks the delivery `Completed`, `trg_delivery_complete_order` flips the order to
 * `Delivered` (logging the status change), and it inserts the `dispatch` transactions that
 * `trg_check_inventory_before_dispatch` validates against the stock just received.
 *
 * Those steps all timestamp at seed time, but these deliveries ran on earlier working days, so
 * the delivery's `delivered_at`, the dispatch rows' `created_at` and the order's `Delivered`
 * history row are moved to the schedule's end time — the same backdating §9 applies to history
 * (spec Decision B). The schedule itself is then marked `Completed`.
 *
 * @param conn        - Transactional connection with user context applied
 * @param scheduleIds - `delivery_id` → `schedule_id` from `createSchedules`
 */
async function completeDeliveries(conn: PoolConnection, scheduleIds: Map<number, number>): Promise<void> {
  const completed = SEED_DELIVERIES.filter((delivery) => delivery.outcome === 'completed');

  for (const delivery of completed) {
    const scheduleId = requireScheduleId(scheduleIds, delivery);
    await conn.query('CALL complete_delivery(?, NULL)', [delivery.delivery_id]);

    const endTime = `(SELECT end_time FROM truck_schedules WHERE schedule_id = ${Number(scheduleId)})`;
    await conn.query(`UPDATE deliveries SET delivered_at = ${endTime} WHERE delivery_id = ?`, [
      delivery.delivery_id
    ]);
    await conn.query(
      `UPDATE inventory_transactions SET created_at = ${endTime}
        WHERE delivery_id = ? AND transaction_type = 'dispatch'`,
      [delivery.delivery_id]
    );
    await conn.query(
      `UPDATE order_status_history SET changed_at = ${endTime}
        WHERE order_id = ? AND new_status = 'Delivered'`,
      [delivery.order_id]
    );
    await conn.query("UPDATE truck_schedules SET status = 'Completed' WHERE schedule_id = ?", [scheduleId]);
  }

  logStage('deliveries completed', completed.length, 0);
}

/**
 * Puts the `in-progress` deliveries and their schedules `In Progress`.
 *
 * There is no procedure for starting a delivery, so this is a direct UPDATE. Neither table has a
 * trigger that acts on this transition (`trg_delivery_complete_order` only reacts to `Completed`),
 * and the orders are already `Out for Delivery` from §9.
 *
 * @param conn        - Transactional connection with user context applied
 * @param scheduleIds - `delivery_id` → `schedule_id` from `createSchedules`
 */
async function startInProgressDeliveries(
  conn: PoolConnection,
  scheduleIds: Map<number, number>
): Promise<void> {
  const inProgress = SEED_DELIVERIES.filter((delivery) => delivery.outcome === 'in-progress');

  for (const delivery of inProgress) {
    await conn.query("UPDATE deliveries SET status = 'In Progress' WHERE delivery_id = ?", [
      delivery.delivery_id
    ]);
    await conn.query("UPDATE truck_schedules SET status = 'In Progress' WHERE schedule_id = ?", [
      requireScheduleId(scheduleIds, delivery)
    ]);
  }

  logStage('deliveries in progress', inProgress.length, 0);
}

/**
 * Looks up the schedule created for a delivery, failing loudly if it is missing.
 *
 * @param scheduleIds - `delivery_id` → `schedule_id` from `createSchedules`
 * @param delivery    - Delivery whose schedule is needed
 * @returns The schedule ID
 * @throws If no schedule was created for the delivery
 */
function requireScheduleId(scheduleIds: Map<number, number>, delivery: SeedDelivery): number {
  const scheduleId = scheduleIds.get(delivery.delivery_id);
  if (!scheduleId) throw new Error(`Seed error: no schedule was created for delivery ${delivery.delivery_id}.`);
  return scheduleId;
}

/**
 * Verifies the stage's end state before it is committed.
 *
 * These are baseline guarantees other members' pages and tests rely on (spec §10–§11), so a
 * failure rolls the stage back rather than leaving a half-right baseline.
 *
 * @param conn - Transactional connection
 * @throws On the first failed check, naming what is wrong
 */
async function assertEndState(conn: PoolConnection): Promise<void> {
  const expectedOrderStatus: Record<SeedDelivery['outcome'], string> = {
    completed: 'Delivered',
    'in-progress': 'Out for Delivery',
    upcoming: 'At Store'
  };
  const expectedDeliveryStatus: Record<SeedDelivery['outcome'], string> = {
    completed: 'Completed',
    'in-progress': 'In Progress',
    upcoming: 'Scheduled'
  };

  // 1. Every delivery, its schedule and its order are in the planned state.
  const [states] = await conn.query<RowDataPacket[]>(
    `SELECT d.delivery_id, d.status AS delivery_status, ts.status AS schedule_status, o.status AS order_status
       FROM deliveries d
       JOIN truck_schedules ts ON ts.schedule_id = d.truck_schedule_id
       JOIN orders o           ON o.order_id = d.order_id`
  );
  if (states.length !== SEED_DELIVERIES.length) {
    throw new Error(`Seed assertion: expected ${SEED_DELIVERIES.length} deliveries, found ${states.length}.`);
  }
  for (const delivery of SEED_DELIVERIES) {
    const row = states.find((r) => Number(r.delivery_id) === delivery.delivery_id);
    const wantDelivery = expectedDeliveryStatus[delivery.outcome];
    const wantOrder = expectedOrderStatus[delivery.outcome];
    if (!row || row.delivery_status !== wantDelivery || row.schedule_status !== wantDelivery || row.order_status !== wantOrder) {
      throw new Error(
        `Seed assertion: delivery ${delivery.delivery_id} (order ${delivery.order_id}) expected ` +
          `${wantDelivery}/${wantDelivery}/${wantOrder}, found ` +
          `${row?.delivery_status}/${row?.schedule_status}/${row?.order_status} (delivery/schedule/order).`
      );
    }
  }

  // 2. store_inventory is exactly the sum of the transactions (the trigger kept it in step).
  const [drift] = await conn.query<RowDataPacket[]>(
    `SELECT si.store_id, si.product_id, si.quantity_on_hand, SUM(it.change_qty) AS txn_total
       FROM store_inventory si
       JOIN inventory_transactions it ON it.store_id = si.store_id AND it.product_id = si.product_id
      GROUP BY si.store_id, si.product_id, si.quantity_on_hand
     HAVING si.quantity_on_hand <> txn_total`
  );
  if (drift.length > 0) {
    throw new Error(
      `Seed assertion: store_inventory disagrees with transactions for store ${drift[0].store_id}, ` +
        `product ${drift[0].product_id} (${drift[0].quantity_on_hand} vs ${drift[0].txn_total}).`
    );
  }

  // 3. Every store has its low-stock row, and most products otherwise stocked.
  const [stock] = await conn.query<RowDataPacket[]>(
    `SELECT store_id,
            SUM(quantity_on_hand <= 5) AS low_rows,
            SUM(quantity_on_hand > 5)  AS stocked_rows
       FROM store_inventory WHERE product_id IN (?) GROUP BY store_id`,
    [[...PRODUCT_IDS]]
  );
  for (const storeId of STORE_IDS) {
    const row = stock.find((r) => Number(r.store_id) === storeId);
    if (!row || Number(row.low_rows) < 1) {
      throw new Error(`Seed assertion: store ${storeId} has no product at or below 5 units for the low-stock alert.`);
    }
    if (Number(row.stocked_rows) < PRODUCT_IDS.length - 2) {
      throw new Error(`Seed assertion: store ${storeId} has only ${row.stocked_rows} products stocked above 5 units.`);
    }
  }

  // 4. Each received booking was received in full — no quantity lost between train and store.
  const [short] = await conn.query<RowDataPacket[]>(
    `SELECT bi.booking_id, SUM(bi.quantity_shipped) AS shipped,
            (SELECT COALESCE(SUM(change_qty), 0) FROM inventory_transactions
              WHERE train_booking_id = bi.booking_id AND transaction_type = 'receive') AS received
       FROM train_booking_items bi
      WHERE bi.booking_id IN (SELECT DISTINCT train_booking_id FROM inventory_transactions
                               WHERE transaction_type = 'receive')
      GROUP BY bi.booking_id
     HAVING shipped <> received`
  );
  if (short.length > 0) {
    throw new Error(
      `Seed assertion: booking ${short[0].booking_id} shipped ${short[0].shipped} but ${short[0].received} were received.`
    );
  }

  console.log(
    `   Checks passed: ${SEED_DELIVERIES.length} deliveries in their planned states, stock matches ` +
      'transactions, every store has a low-stock row, every receipt is complete.'
  );
}
