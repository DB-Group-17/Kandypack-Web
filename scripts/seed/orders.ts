/**
 * @file scripts/seed/orders.ts
 * @description Baseline order stage (Docs/06_seed-data-spec.md §9).
 *
 * This module currently seeds the **historical** block only — orders 1–23, dated in the previous
 * completed quarter and finishing at `Delivered` or `Cancelled`. The current-quarter block goes
 * through `place_order` instead and is added to this file separately.
 *
 * Why direct INSERT rather than `place_order` (spec §9 Decision A):
 * `place_order` books space on a trip departing after the order date, and §8's trip window only
 * spans three weeks either side of the seed run. Previous-quarter orders have no trip to attach
 * to, so they are written as closed sales records with no `train_bookings` — and must therefore
 * supply `route_id` themselves, which the data module resolves from each order's customer.
 *
 * Data flow per order:
 * 1. INSERT into `orders` as `Pending` (dates resolved on the database clock).
 * 2. INSERT its `order_items`; `trg_snapshot_order_item_prices` fills price and space rate, and
 *    `trg_maintain_order_totals_ins` then maintains `total_value` / `total_space_required`.
 * 3. UPDATE the status through each step of `STATUS_WALK` so `trg_log_order_status_change`
 *    writes the `order_status_history` rows (spec §9 Decision B).
 * 4. Backdate those history rows, which would otherwise all carry the seed-run timestamp.
 *
 * Accepted limitation: `orders.updated_at` cannot be backdated. `trg_touch_updated_at_orders`
 * sets it to `NOW()` on every UPDATE unconditionally, and correcting it would be another UPDATE.
 * Historical orders therefore show a seed-time `updated_at`; no page displays that column.
 *
 * Owner: Member 1 (Dineth)
 */

import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { BOOTSTRAP_ADMIN } from './admin';
import { insertMissing, logStage, sql, type SeedRow } from './helpers';
import { SEED_ORDERS, STATUS_WALK, type SeedOrder } from './data/orders';

/**
 * SQL for the first day of the previous completed calendar quarter.
 *
 * `MAKEDATE(YEAR(CURDATE()), 1)` is 1 January of this year; adding `QUARTER(CURDATE()) - 1`
 * quarters reaches the start of the current quarter, and subtracting one more reaches the start
 * of the previous one. Evaluated server-side so it shares the clock `place_order` and the seeded
 * train trips use (see scripts/seed/train-trips.ts).
 */
const PREVIOUS_QUARTER_START =
  'DATE_SUB(MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL QUARTER(CURDATE()) - 1 QUARTER, INTERVAL 1 QUARTER)';

/** SQL for the anchor an order's `placedOffsetDays` counts from. */
const ANCHOR_SQL: Record<SeedOrder['anchor'], string> = {
  'previous-quarter-start': PREVIOUS_QUARTER_START,
  today: 'CURDATE()'
};

/**
 * Line-item ID slots reserved per order.
 *
 * `order_items.order_item_id` is AUTO_INCREMENT, but `insertMissing` compares explicit primary
 * keys to decide what to skip, so the seed allocates them. A fixed block per order (rather than
 * packing IDs sequentially) keeps every ID pinned to its own order even if a later edit changes
 * an earlier order's line count. Six is spec §9's maximum lines per order.
 */
const ITEM_ID_SLOTS_PER_ORDER = 6;

/**
 * Builds the `orders` row for one seeded order, inserted at `Pending` regardless of its target.
 *
 * @param order - Order definition from the data module
 * @returns A seed row with both dates as server-evaluated expressions
 */
function buildOrderRow(order: SeedOrder): SeedRow {
  const anchor = ANCHOR_SQL[order.anchor];

  return {
    order_id: order.order_id,
    customer_id: order.customer_id,
    delivery_address: order.delivery_address,
    delivery_area: order.delivery_area,
    destination_city_id: order.destination_city_id,
    route_id: order.route_id,
    order_placed_at: sql(`DATE_ADD(${anchor}, INTERVAL ? DAY)`, order.placedOffsetDays),
    expected_delivery_date: sql(
      `DATE_ADD(${anchor}, INTERVAL ? DAY)`,
      order.placedOffsetDays + order.deliveryLeadDays
    ),
    // Decision B: every order starts Pending and is walked to its target status afterwards.
    status: 'Pending',
    created_by: BOOTSTRAP_ADMIN.user_id
  };
}

/**
 * Builds the `order_items` rows for one seeded order.
 *
 * `unit_price_at_order` and `space_rate_at_order` are passed as explicit NULL: this is the path
 * `trg_snapshot_order_item_prices` is written for (`IF NEW.unit_price_at_order IS NULL`), so the
 * snapshot comes from `products` at insert time rather than being duplicated in the seed data.
 *
 * @param order - Order definition whose items to build
 * @returns One seed row per line, with IDs from this order's reserved block
 */
function buildItemRows(order: SeedOrder): SeedRow[] {
  return order.items.map((item, lineIndex) => ({
    order_item_id: (order.order_id - 1) * ITEM_ID_SLOTS_PER_ORDER + lineIndex + 1,
    order_id: order.order_id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price_at_order: null,
    space_rate_at_order: null
  }));
}

/**
 * Reads the order IDs already present, so the stage can tell which orders it is actually creating.
 *
 * `insertMissing` reports how many rows it wrote but not which ones, and the status walk must run
 * only for newly inserted orders — re-walking an existing order would append a second
 * `Pending → …` chain to a history that already has one.
 *
 * @param conn - Transactional connection
 * @returns The set of `order_id` values already in the table, as strings
 */
async function readExistingOrderIds(conn: PoolConnection): Promise<Set<string>> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT order_id FROM orders');
  return new Set(rows.map((row) => String(row.order_id)));
}

/**
 * Walks one order from `Pending` to its target status, one UPDATE per transition.
 *
 * Each UPDATE fires `trg_log_order_status_change`, which writes the `order_status_history` row
 * using `@current_user_id` — already set on this connection by `withUserContext`, so the seeded
 * history is attributed to the bootstrap admin rather than NULL.
 *
 * @param conn  - Transactional connection with user context applied
 * @param order - Order to walk; a `Pending` target performs no updates
 * @returns Number of status transitions applied
 */
async function walkStatus(conn: PoolConnection, order: SeedOrder): Promise<number> {
  const steps = STATUS_WALK[order.status];

  for (const step of steps) {
    await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [step, order.order_id]);
  }

  return steps.length;
}

/**
 * Backdates one order's status-history timestamps.
 *
 * `order_status_history.changed_at` defaults to `NOW()`, so a previous-quarter order would show
 * all of its transitions at seed time — visibly wrong on the Order Detail timeline. The rows are
 * spread evenly between `order_placed_at` and `expected_delivery_date` in `history_id` order,
 * which is chronological because the walk applies transitions in order.
 *
 * Safe to do with a plain UPDATE: `order_status_history` carries no triggers at all — no audit
 * trigger, no delete guard, no `updated_at` touch — so this writes no audit rows of its own.
 *
 * @param conn    - Transactional connection
 * @param orderId - Order whose history to backdate
 * @returns Number of history rows adjusted
 */
async function backdateStatusHistory(conn: PoolConnection, orderId: number): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT history_id FROM order_status_history WHERE order_id = ? ORDER BY history_id',
    [orderId]
  );
  if (rows.length === 0) return 0;

  for (const [index, row] of rows.entries()) {
    // Fraction of the way from placement to expected delivery: the last transition lands on the
    // expected delivery date, earlier ones spread evenly before it.
    const fraction = (index + 1) / rows.length;

    await conn.query(
      `UPDATE order_status_history
          SET changed_at = (
            SELECT DATE_ADD(
                     o.order_placed_at,
                     INTERVAL ROUND(DATEDIFF(o.expected_delivery_date, DATE(o.order_placed_at)) * ? * 24) HOUR
                   )
              FROM orders o WHERE o.order_id = ?
          )
        WHERE history_id = ?`,
      [fraction, orderId, row.history_id]
    );
  }

  return rows.length;
}

/**
 * Seeds the previous-quarter orders (spec §9, orders 1–23).
 *
 * Only orders absent from the table are inserted, walked and backdated, so re-running the seed
 * writes nothing and cannot duplicate a status history.
 *
 * Assumptions:
 * - `conn` has `@current_user_id` set and an open transaction (same contract as `insertMissing`).
 * - Customers, products, cities and routes are already seeded — the FKs require it.
 *
 * @param conn - Transactional connection with user context applied
 * @returns Counts of what this run created
 */
export async function seedHistoricalOrders(conn: PoolConnection): Promise<{
  orders: number;
  items: number;
  transitions: number;
}> {
  const historical = SEED_ORDERS.filter((order) => order.anchor === 'previous-quarter-start');
  const existingIds = await readExistingOrderIds(conn);
  const toCreate = historical.filter((order) => !existingIds.has(String(order.order_id)));

  const orders = await insertMissing(conn, 'orders', 'order_id', historical.map(buildOrderRow));

  // Items are inserted per order rather than in one batch so a constraint failure names the order.
  let items = 0;
  for (const order of historical) {
    items += await insertMissing(conn, 'order_items', 'order_item_id', buildItemRows(order));
  }

  // Walk and backdate only the orders this run created (see readExistingOrderIds).
  let transitions = 0;
  for (const order of toCreate) {
    transitions += await walkStatus(conn, order);
    await backdateStatusHistory(conn, order.order_id);
  }

  logStage('order status walk', transitions, 0);
  return { orders, items, transitions };
}

/**
 * Seeds the current-quarter orders (spec §9, orders 24–45) through `place_order`.
 *
 * These go through the real procedure rather than direct INSERT so the seeded data exercises
 * route matching, the capacity check and the trip-booking loop exactly as `POST /api/orders` does.
 * The resulting `train_bookings` are therefore genuine, and a regression in `place_order` shows up
 * here rather than in someone's manual testing.
 *
 * Trip selection, for reference: `place_order` books the *earliest* `Scheduled` trip departing
 * after the order date with any free space — `expected_delivery_date` plays no part. Every one of
 * these orders therefore lands on its city's `+1` week trip (capacity 500, worst-city demand 231),
 * so the deliberately small `+2` trip stays empty for the overflow test order.
 *
 * Deliberately no Redis lock: `withLock` guards concurrent API callers racing for the same trip
 * capacity, whereas this stage is single-threaded inside one transaction and
 * `trg_check_trip_capacity` already takes `SELECT … FOR UPDATE` on the trip row.
 *
 * Idempotency: unlike `insertMissing`, `place_order` always inserts, so a re-run would create a
 * second set of orders. The stage therefore returns early if its ID range is already present.
 *
 * @param conn - Transactional connection with user context applied (role must be allowed to call
 *               `place_order`: `order_entry_clerk`, `logistics_manager` or `system_administrator`)
 * @returns Counts of what this run created
 * @throws If `place_order` returns an unexpected `order_id`, which would mean the seeded IDs no
 *         longer match the spec that other members' tests rely on
 */
export async function seedCurrentQuarterOrders(conn: PoolConnection): Promise<{
  orders: number;
  transitions: number;
}> {
  const current = SEED_ORDERS.filter((order) => order.anchor === 'today');
  const existingIds = await readExistingOrderIds(conn);
  const toCreate = current.filter((order) => !existingIds.has(String(order.order_id)));

  if (toCreate.length === 0) {
    logStage('orders (place_order)', 0, current.length);
    return { orders: 0, transitions: 0 };
  }

  // Partial ranges cannot be repaired safely: place_order assigns IDs by AUTO_INCREMENT, so
  // filling a gap would hand the new order whatever ID comes next, not the one the spec promises.
  if (toCreate.length !== current.length) {
    throw new Error(
      `Seed error: orders 24–45 are partially present (${current.length - toCreate.length} of ${current.length}). ` +
        'place_order cannot fill gaps at specific IDs; reset the orders table or seed a fresh database.'
    );
  }

  let transitions = 0;
  for (const order of toCreate) {
    const orderId = await callPlaceOrder(conn, order);

    // AUTO_INCREMENT should continue straight on from the historical block. If it does not, the
    // baseline IDs other members reference would silently shift, so stop rather than continue.
    if (orderId !== order.order_id) {
      throw new Error(
        `Seed error: place_order created order ${orderId} where spec §9 expects ${order.order_id}. ` +
          'The orders table is not in its expected baseline state.'
      );
    }

    // Current-quarter history keeps its natural NOW() timestamps: these orders really are days old.
    transitions += await walkStatus(conn, order);
  }

  logStage('orders (place_order)', toCreate.length, current.length - toCreate.length);
  logStage('order status walk', transitions, 0);
  return { orders: toCreate.length, transitions };
}

/**
 * Calls `place_order` for one seeded order and returns the ID it assigned.
 *
 * Called directly on the transactional connection rather than through `callProcedure`, which
 * borrows its own pooled connection (so it would run outside this transaction and survive a dry
 * run's rollback) and has no way to read an `OUT` parameter back.
 *
 * `order_placed_at` is resolved server-side from `CURDATE()` for the same clock-consistency reason
 * the direct inserts use, and `expected_delivery_date` is derived from it so the 7-day lead rule
 * (`chk_orders_min_lead` and `trg_validate_order_date`) holds however the two clocks differ.
 *
 * @param conn  - Transactional connection with user context applied
 * @param order - Order definition to place
 * @returns The `order_id` the procedure assigned
 * @throws If the procedure signals a business-rule violation, or returns no ID
 */
async function callPlaceOrder(conn: PoolConnection, order: SeedOrder): Promise<number> {
  const anchor = ANCHOR_SQL[order.anchor];
  const placedAt = `DATE_ADD(${anchor}, INTERVAL ? DAY)`;
  const expectedDate = `DATE_ADD(${anchor}, INTERVAL ? DAY)`;

  await conn.query(
    `CALL place_order(?, ?, ?, ?, ${expectedDate}, CAST(? AS JSON), ?, ${placedAt}, @seed_order_id)`,
    [
      order.customer_id,
      order.delivery_address,
      order.delivery_area,
      order.destination_city_id,
      order.placedOffsetDays + order.deliveryLeadDays,
      JSON.stringify(order.items),
      BOOTSTRAP_ADMIN.user_id,
      order.placedOffsetDays
    ]
  );

  const [rows] = await conn.query<RowDataPacket[]>('SELECT @seed_order_id AS order_id');
  const orderId = rows[0]?.order_id;
  if (orderId === null || orderId === undefined) {
    throw new Error(`Seed error: place_order returned no order_id for seed order ${order.order_id}.`);
  }

  return Number(orderId);
}
