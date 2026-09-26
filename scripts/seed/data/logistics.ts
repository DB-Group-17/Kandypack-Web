/**
 * @file scripts/seed/data/logistics.ts
 * @description Pure data for the logistics seed stage (Docs/06_seed-data-spec.md §10–§11):
 *              which trips arrive, which orders get a truck schedule and delivery, when each
 *              schedule runs, and each store's opening stock balance.
 *
 * No queries live here — scripts/seed/logistics.ts turns this data into rows. Everything is
 * deterministic (no randomness) so every run of the seed produces the same baseline, and dates
 * are expressed as working-day offsets from the database's `CURDATE()`, resolved at run time.
 *
 * Scope (spec §9, "Option 1"): only the 10 current-quarter orders that have reached a store.
 * Historical `Delivered` orders carry no train bookings (Decision A), so they get no schedule,
 * delivery or stock movement either.
 *
 * Owner: Member 1 (Dineth)
 */

/**
 * Train trips the seed marks `Arrived` before receiving goods.
 *
 * These are the `+1` week trips (arrival 2026-09-21 at the first seed run) that every
 * current-quarter order was booked on. §9 walked five of those orders to `At Store` and five to
 * `Out for Delivery` while the trips were still `Scheduled`, which `receive_goods_at_store` would
 * reject. Their arrival time has passed, so marking them `Arrived` makes the data consistent
 * with the calendar. The `In Transit` orders on the same trips are deliberately left arrived but
 * not received, for Member 4 to exercise the receive-goods flow.
 *
 * `trip_id = city_index × 6 + offset_index + 1`, where `+1` week is offset index 3.
 */
export const TRIPS_TO_ARRIVE = [4, 10, 16, 22, 28, 34] as const;

/**
 * What happens to an order's delivery in the baseline.
 *
 * - `completed`   — ran on an earlier working day; `complete_delivery` dispatches the stock and
 *                   the trigger flips the order to `Delivered`.
 * - `in-progress` — on the road today; schedule and delivery are `In Progress`, the order stays
 *                   `Out for Delivery` for Member 3 to complete from the deliveries page.
 * - `upcoming`    — booked for a later working day; everything stays `Scheduled` and the order
 *                   stays `At Store`.
 */
export type DeliveryOutcome = 'completed' | 'in-progress' | 'upcoming';

/** One truck schedule plus its delivery, for one eligible order. */
export interface SeedDelivery {
  /** Delivery primary key, pinned so re-runs can tell what already exists. */
  delivery_id: number;
  /** The order being delivered; must be `At Store` or `Out for Delivery` after §9. */
  order_id: number;
  /** Store the truck leaves from — the order's route store (also its destination-city store). */
  store_id: number;
  /** The order's own route, so the schedule's duration is that route's `max_delivery_time_hours`. */
  route_id: number;
  truck_id: number;
  driver_id: number;
  assistant_id: number;
  outcome: DeliveryOutcome;
  /**
   * Working days from the seed run's `CURDATE()`: negative is in the past, 0 is today, positive
   * is in the future. Sundays are skipped (deliveries run Monday–Saturday).
   */
  workingDayOffset: number;
  /** Start hour on that day. With routes of at most 5 h, 08:00 keeps the 06:00–20:00 window. */
  startHour: number;
}

/**
 * The 10 baseline deliveries, two per store for stores 1–5 (store 6 has no eligible order).
 *
 * Each store runs its own truck (`truck_id = store_id`) with its first seeded driver and assistant
 * (IDs 1–5 map to stores 1–5). Assistant 9 at store 1 is a Member 4 test record and is avoided.
 * A store's two schedules fall on different days, so no truck, driver or assistant overlaps and
 * nobody approaches the 40 h / 60 h weekly caps — the baseline must pass `trg_validate_truck_schedule`
 * cleanly (spec §10).
 */
export const SEED_DELIVERIES: readonly SeedDelivery[] = [
  // Completed earlier this week — these three become the first current-quarter Delivered orders.
  { delivery_id: 1, order_id: 26, store_id: 1, route_id: 1, truck_id: 1, driver_id: 1, assistant_id: 1, outcome: 'completed', workingDayOffset: -3, startHour: 8 },
  { delivery_id: 2, order_id: 30, store_id: 2, route_id: 3, truck_id: 2, driver_id: 2, assistant_id: 2, outcome: 'completed', workingDayOffset: -2, startHour: 8 },
  { delivery_id: 3, order_id: 34, store_id: 3, route_id: 5, truck_id: 3, driver_id: 3, assistant_id: 3, outcome: 'completed', workingDayOffset: -1, startHour: 8 },

  // On the road today — left for Member 3 to complete through the deliveries page.
  { delivery_id: 4, order_id: 38, store_id: 4, route_id: 7, truck_id: 4, driver_id: 4, assistant_id: 4, outcome: 'in-progress', workingDayOffset: 0, startHour: 8 },
  { delivery_id: 5, order_id: 42, store_id: 5, route_id: 9, truck_id: 5, driver_id: 5, assistant_id: 5, outcome: 'in-progress', workingDayOffset: 0, startHour: 8 },

  // Booked for the next working days — orders stay At Store until the truck leaves.
  { delivery_id: 6, order_id: 25, store_id: 1, route_id: 1, truck_id: 1, driver_id: 1, assistant_id: 1, outcome: 'upcoming', workingDayOffset: 1, startHour: 8 },
  { delivery_id: 7, order_id: 29, store_id: 2, route_id: 3, truck_id: 2, driver_id: 2, assistant_id: 2, outcome: 'upcoming', workingDayOffset: 1, startHour: 8 },
  { delivery_id: 8, order_id: 33, store_id: 3, route_id: 5, truck_id: 3, driver_id: 3, assistant_id: 3, outcome: 'upcoming', workingDayOffset: 2, startHour: 8 },
  { delivery_id: 9, order_id: 37, store_id: 4, route_id: 7, truck_id: 4, driver_id: 4, assistant_id: 4, outcome: 'upcoming', workingDayOffset: 2, startHour: 8 },
  { delivery_id: 10, order_id: 41, store_id: 5, route_id: 9, truck_id: 5, driver_id: 5, assistant_id: 5, outcome: 'upcoming', workingDayOffset: 3, startHour: 8 }
];

/** Stores 1–6, one per destination city (spec §2). */
export const STORE_IDS = [1, 2, 3, 4, 5, 6] as const;

/** Baseline catalog products 1–12 (spec §3); product 13 is a Member 4 test record and is excluded. */
export const PRODUCT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Opening stock per product, the same at every store (spec §11, Decision C).
 *
 * Receipts from 10 orders alone would stock only a few products per store, so each store starts
 * from an `adjustment` balance and real receipts and dispatches move stock on top of it. Bulky
 * items open lower than small packaged goods.
 */
export const OPENING_QUANTITY: Readonly<Record<number, number>> = {
  1: 120, // Detergent Powder 1kg
  2: 150, // Dish Soap 500ml
  3: 180, // Biscuits Family Pack
  4: 90,  // Instant Noodles Box (24)
  5: 140, // Tea Powder 400g
  6: 100, // Coconut Oil 1L
  7: 80,  // Rice 5kg Bag
  8: 200, // Toothpaste 100g
  9: 60,  // Soft Drink Crate (24)
  10: 110, // Baby Diapers Pack
  11: 70, // Canned Fish 425g Case (24)
  12: 160 // Shampoo 400ml
};

/**
 * One deliberately low product per store, opened at `LOW_STOCK_QUANTITY` instead.
 *
 * Guarantees the dashboard's low-stock alert has a row to show at every store (spec §11). Each is
 * a product none of that store's seeded orders contain, so no receipt or dispatch moves it and
 * it is still ≤ 5 at the end of the stage.
 */
export const LOW_STOCK_PRODUCT_BY_STORE: Readonly<Record<number, number>> = {
  1: 6,  // store 1 orders use 2, 4, 7, 9, 12
  2: 8,  // store 2 orders use 3, 4, 5, 7, 10, 12
  3: 11, // store 3 orders use 2, 3, 4, 5, 7, 8, 9, 10, 12
  4: 1,  // store 4 orders use 2, 4, 7, 9, 12
  5: 9,  // store 5 orders use 3, 4, 5, 7, 10, 12
  6: 2   // store 6 has no seeded orders
};

/** Opening quantity for each store's low-stock product; must stay ≤ 5 to trigger the alert. */
export const LOW_STOCK_QUANTITY = 3;
