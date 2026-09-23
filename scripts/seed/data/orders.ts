/**
 * @file scripts/seed/data/orders.ts
 * @description Baseline order definitions (Docs/06_seed-data-spec.md §9).
 *
 * Pure data: this module performs no database access and resolves no dates. It declares
 * *what* the 45 baseline orders are; the inserter stages decide how to write them.
 *
 * Design decisions this file implements (both recorded in spec §9):
 * - **Decision A** — the previous-quarter orders carry no train bookings, so they are written
 *   by direct insert and must therefore supply `route_id` themselves. Every order below derives
 *   its city, area and route from its own customer, so `route_id` is always known and the
 *   coverage-area match can never fail.
 * - **Decision B** — every order is inserted as `Pending` and walked to its target status so
 *   `trg_log_order_status_change` writes the history. `STATUS_WALK` holds those paths.
 *
 * Two properties are load-bearing and deliberately enforced here:
 * - **Determinism.** No `Math.random()`. `insertMissing` only writes rows whose primary key is
 *   absent, so a re-run against a partially seeded database must reproduce identical rows, or two
 *   members' databases would silently disagree about what order #31 contains.
 * - **Dates as offsets, not values.** Offsets are resolved to SQL against the database clock by
 *   the inserter, for the same reason train trips are (see scripts/seed/train-trips.ts): building
 *   dates from the developer's local clock drifts them against the trips and against `place_order`.
 *
 * Owner: Member 1 (Dineth)
 */

import { CUSTOMERS, PRODUCTS } from './catalog';
import { DESTINATIONS, areasForRoute } from './locations';

/** The six values allowed by `chk_orders_status`. */
export type OrderStatus =
  | 'Pending'
  | 'In Transit'
  | 'At Store'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

/**
 * Which date an order's `placedOffsetDays` counts from. Resolved to SQL by the inserter so both
 * anchors evaluate on the database server's clock.
 *
 * - `previous-quarter-start` — the first day of the last completed calendar quarter.
 * - `today` — `CURDATE()`.
 */
export type DateAnchor = 'previous-quarter-start' | 'today';

/** One `order_items` line, before price and space rate are snapshotted by the trigger. */
export interface SeedOrderItem {
  product_id: number;
  /** Units ordered; always at least 5 and space-capped (see `MAX_LINE_SPACE`). */
  quantity: number;
}

/** One baseline order, with dates still expressed as offsets. */
export interface SeedOrder {
  order_id: number;
  customer_id: number;
  /** Drives the quantity band; mirrors the customer's own `customer_type`. */
  customer_type: 'retail' | 'wholesale';
  destination_city_id: number;
  /** Exactly matches a `route_coverage_areas.area_name` for this city. */
  delivery_area: string;
  /** Resolved here because Decision A's direct inserts cannot rely on `place_order` to set it. */
  route_id: number;
  delivery_address: string;
  anchor: DateAnchor;
  /** Days from `anchor` to `order_placed_at`. Negative counts backwards from `today`. */
  placedOffsetDays: number;
  /** Days from `order_placed_at` to `expected_delivery_date`; always 7 or more (`chk_orders_min_lead`). */
  deliveryLeadDays: number;
  /** The status the walk finishes at, not the status the row is inserted with. */
  status: OrderStatus;
  items: SeedOrderItem[];
}

/** §9 — the exact status distribution the baseline must produce. */
export const REQUIRED_STATUS_COUNTS: Record<OrderStatus, number> = {
  Delivered: 20,
  'In Transit': 7,
  'At Store': 5,
  'Out for Delivery': 5,
  Pending: 5,
  Cancelled: 3
};

/**
 * Status transitions applied after the initial `Pending` insert, in order (Decision B).
 * A `Delivered` order therefore produces four `order_status_history` rows, a `Pending` one none.
 */
export const STATUS_WALK: Record<OrderStatus, OrderStatus[]> = {
  Pending: [],
  Cancelled: ['Cancelled'],
  'In Transit': ['In Transit'],
  'At Store': ['In Transit', 'At Store'],
  'Out for Delivery': ['In Transit', 'At Store', 'Out for Delivery'],
  Delivered: ['In Transit', 'At Store', 'Out for Delivery', 'Delivered']
};

/** Orders 1–23 are the previous-quarter set (all Delivered or Cancelled) — spec §9 Decision A. */
const HISTORICAL_COUNT = 23;
/** Orders 24–45 are the current-quarter set, carrying the in-progress statuses. */
const CURRENT_COUNT = 22;
const TOTAL_ORDERS = HISTORICAL_COUNT + CURRENT_COUNT;

/** Positions (0-based, within the historical block) that are `Cancelled` rather than `Delivered`. */
const CANCELLED_POSITIONS = new Set([6, 13, 20]);

/**
 * Upper bound on one line's `quantity × space_rate`.
 *
 * The current-quarter orders are booked onto real 500-unit trips by `place_order`, so an
 * unbounded quantity on a high-space product (Soft Drink Crate, 1.50 per unit) would produce a
 * single order too large to fit any trip. Capping the line rather than the order keeps the
 * quantity bands in spec (5–100) while holding a worst-case 6-line order to 210 units.
 */
const MAX_LINE_SPACE = 35;

/** Line counts cycled by order index: 1–6 items, averaging ~3.2 as spec §9 requires. */
const LINE_COUNT_CYCLE = [3, 2, 4, 3, 1, 5, 3, 2, 4, 6, 3, 2];

/** `product_id` → `space_rate`, used to apply `MAX_LINE_SPACE`. */
const SPACE_RATE_BY_PRODUCT = new Map<number, number>(
  PRODUCTS.map((product) => [Number(product.product_id), Number(product.space_rate)])
);

/**
 * Derives a customer's city, route, coverage area and address from their ID.
 *
 * Mirrors the archetype arithmetic in `catalog.ts` (`customer_id = city_index × 4 + archetype + 1`,
 * archetypes 0–1 on the city route and 2–3 on the suburb route). Deriving rather than parsing keeps
 * the order's `delivery_area` identical to the area the customer's address was built from, which is
 * what makes the coverage match structurally guaranteed instead of coincidental.
 *
 * @param customerId - 1–24, a seeded customer
 * @returns That customer's city, route, area, address and type
 * @throws If the derived values contradict the seeded customer row (i.e. `catalog.ts` changed shape)
 */
function customerContext(customerId: number): {
  cityId: number;
  routeId: number;
  area: string;
  address: string;
  customerType: 'retail' | 'wholesale';
} {
  const cityIndex = Math.floor((customerId - 1) / 4);
  const archetype = (customerId - 1) % 4;
  const city = DESTINATIONS[cityIndex];

  // Archetypes 0–1 live on the city route, 2–3 on the suburb route; the area index alternates.
  const routeId = cityIndex * 2 + 1 + (archetype < 2 ? 0 : 1);
  const area = areasForRoute(routeId)[archetype % 2];
  const customerType = archetype < 2 ? 'retail' : 'wholesale';

  const customer = CUSTOMERS[customerId - 1];
  const address = String(customer.address_line);

  // Fail fast if catalog.ts's archetype layout drifts away from the arithmetic above, rather than
  // seeding orders whose delivery area no longer matches the customer they belong to.
  if (Number(customer.registered_city_id) !== city.cityId) {
    throw new Error(`Seed data error: customer ${customerId} city mismatch with derived city ${city.name}.`);
  }
  if (String(customer.customer_type) !== customerType) {
    throw new Error(`Seed data error: customer ${customerId} type mismatch with derived ${customerType}.`);
  }
  if (!address.includes(area)) {
    throw new Error(`Seed data error: customer ${customerId} address does not lie in derived area "${area}".`);
  }

  return { cityId: city.cityId, routeId, area, address, customerType };
}

/**
 * Builds one order's line items deterministically.
 *
 * Products step by 5 (coprime with the 12-product catalog) so no product repeats within an order.
 * Quantities sit in a band chosen by customer type — wholesale skews larger per spec §9 — and are
 * then clamped so no single line exceeds `MAX_LINE_SPACE` units of train space.
 *
 * @param orderId      - 1-based order number, used as the deterministic seed
 * @param customerType - Selects the quantity band
 * @returns Between 1 and 6 item lines, each with a distinct product
 * @throws If a generated product ID has no seeded space rate
 */
function buildItems(orderId: number, customerType: 'retail' | 'wholesale'): SeedOrderItem[] {
  const lineCount = LINE_COUNT_CYCLE[(orderId - 1) % LINE_COUNT_CYCLE.length];

  return Array.from({ length: lineCount }, (_, lineIndex) => {
    const productId = ((orderId * 3 + lineIndex * 5) % PRODUCTS.length) + 1;

    // Deterministic spread within the band; wholesale 30–100, retail 5–40 (spec §9).
    const rawQuantity =
      customerType === 'wholesale'
        ? 30 + ((orderId * 13 + lineIndex * 9) % 71)
        : 5 + ((orderId * 11 + lineIndex * 7) % 36);

    const spaceRate = SPACE_RATE_BY_PRODUCT.get(productId);
    if (spaceRate === undefined) {
      throw new Error(`Seed data error: product ${productId} has no space rate.`);
    }

    // chk_oi_quantity requires > 0 and spec §9 requires at least 5, so the cap never floors below 5.
    const spaceCap = Math.max(5, Math.floor(MAX_LINE_SPACE / spaceRate));

    return { product_id: productId, quantity: Math.min(rawQuantity, spaceCap) };
  });
}

/**
 * Produces the current-quarter status sequence with exactly the counts spec §9 requires.
 *
 * Statuses are interleaved round-robin rather than blocked together so each destination city ends
 * up with a mix of in-progress orders — otherwise whole cities would show only `Pending`, and the
 * Orders list page's status filter would have nothing interesting to filter.
 *
 * @returns 22 statuses, in assignment order
 */
function buildCurrentStatusSequence(): OrderStatus[] {
  const buckets: Array<{ status: OrderStatus; remaining: number }> = [
    { status: 'In Transit', remaining: REQUIRED_STATUS_COUNTS['In Transit'] },
    { status: 'At Store', remaining: REQUIRED_STATUS_COUNTS['At Store'] },
    { status: 'Out for Delivery', remaining: REQUIRED_STATUS_COUNTS['Out for Delivery'] },
    { status: 'Pending', remaining: REQUIRED_STATUS_COUNTS.Pending }
  ];

  const sequence: OrderStatus[] = [];
  while (sequence.length < CURRENT_COUNT) {
    for (const bucket of buckets) {
      if (bucket.remaining === 0) continue;
      sequence.push(bucket.status);
      bucket.remaining--;
    }
  }
  return sequence;
}

/**
 * Builds all 45 baseline orders.
 *
 * Customers cycle 1–24 across the 45 orders, so every customer has at least one order and the six
 * destination cities are evenly represented in both the historical and current blocks.
 *
 * Date handling:
 * - Historical orders spread across the first 80 days of the previous completed quarter, keeping
 *   `order_placed_at` inside that quarter so `v_quarterly_sales` buckets them together.
 * - Current orders are placed within the last 18 days, with 10–21 day leads, so the trips
 *   `place_order` books them onto are the `+1`/`+3` week trips from §8.
 *
 * @returns The 45 orders in ID order
 * @throws If the produced status distribution does not match spec §9 exactly
 */
export function buildSeedOrders(): SeedOrder[] {
  const currentStatuses = buildCurrentStatusSequence();

  const orders = Array.from({ length: TOTAL_ORDERS }, (_, index) => {
    const orderId = index + 1;
    const customerId = (index % CUSTOMERS.length) + 1;
    const context = customerContext(customerId);
    const isHistorical = orderId <= HISTORICAL_COUNT;

    let status: OrderStatus;
    let anchor: DateAnchor;
    let placedOffsetDays: number;
    let deliveryLeadDays: number;

    if (isHistorical) {
      status = CANCELLED_POSITIONS.has(index) ? 'Cancelled' : 'Delivered';
      anchor = 'previous-quarter-start';
      // Spread evenly over days 0–80 of the ~90-day quarter, leaving room for the delivery lead.
      placedOffsetDays = Math.round((index * 80) / (HISTORICAL_COUNT - 1));
      deliveryLeadDays = 7 + (index % 8);
    } else {
      const currentIndex = index - HISTORICAL_COUNT;
      status = currentStatuses[currentIndex];
      anchor = 'today';
      // Negative: counts backwards from today, so these stay inside the current quarter.
      placedOffsetDays = -Math.round((currentIndex * 18) / (CURRENT_COUNT - 1));
      deliveryLeadDays = 10 + (currentIndex % 12);
    }

    return {
      order_id: orderId,
      customer_id: customerId,
      customer_type: context.customerType,
      destination_city_id: context.cityId,
      delivery_area: context.area,
      route_id: context.routeId,
      delivery_address: context.address,
      anchor,
      placedOffsetDays,
      deliveryLeadDays,
      status,
      items: buildItems(orderId, context.customerType)
    };
  });

  assertStatusDistribution(orders);
  return orders;
}

/**
 * Verifies the generated orders match spec §9's status table exactly.
 *
 * Guards the project minimum of at least five pending deliveries, and catches the case where a
 * later edit to the counts or the interleave quietly changes the distribution.
 *
 * @param orders - The generated orders
 * @throws If any status count differs from `REQUIRED_STATUS_COUNTS`
 */
function assertStatusDistribution(orders: SeedOrder[]): void {
  const actual = new Map<OrderStatus, number>();
  for (const order of orders) {
    actual.set(order.status, (actual.get(order.status) ?? 0) + 1);
  }

  for (const [status, expected] of Object.entries(REQUIRED_STATUS_COUNTS) as Array<[OrderStatus, number]>) {
    const count = actual.get(status) ?? 0;
    if (count !== expected) {
      throw new Error(`Seed data error: expected ${expected} ${status} orders per spec §9, built ${count}.`);
    }
  }
}

/** §9 — the 45 baseline orders, built once at module load so the assertions run early. */
export const SEED_ORDERS: SeedOrder[] = buildSeedOrders();

/**
 * §9 — the capacity-overflow test order (`order_id` 46), and the Phase 1 gate case in
 * `Docs/09_task-tracker.md`: `place_order()` must be verified against the small-capacity trip.
 *
 * Deliberately **not** part of `SEED_ORDERS`. Spec §9 calls it "an extra 46th row", and its
 * `Pending` status would otherwise push that bucket to 6 and fail `assertStatusDistribution`.
 *
 * How the split is forced: `place_order` books the earliest `Scheduled` trip departing after the
 * order's placement time. Colombo's trips are IDs 1–6 at week offsets −3, −2, −1, +1, +2, +3, so
 * trip 4 is `+1` week, trip 5 is the 50-unit trip at `+2`, and trip 6 is `+3`. Dating this order
 * *after trip 4 departs* makes the search start at trip 5, which cannot hold the whole order — so
 * the remainder overflows onto trip 6, producing the two `train_bookings` rows the gate requires.
 *
 * Consequence: `order_placed_at` is a few days in the future. That is deliberate and is the only
 * way to have the order evaluated against the small trip first, as spec §8 words the requirement
 * ("exceeds the 50-unit small trip's remaining capacity"). The alternative — a much larger order
 * placed today that cascades out of trip 4 — would make the split depend on how much the other
 * Colombo orders happened to consume, so editing the baseline would silently change what the gate
 * test proves.
 *
 * Sizing: 80 crates × 1.50 space = 120.00 units. Trip 5 takes `FLOOR(50 / 1.5) = 33` crates
 * (49.50 units — the allocator floors to whole units, so it does not land on exactly 50.00) and
 * the remaining 47 crates become 70.50 units on trip 6.
 */
export const OVERFLOW_TEST_ORDER = {
  /** Expected ID once the 45 baseline orders exist; asserted at seed time. */
  order_id: 46,
  /** Colombo Retail Mart — city route 1, area "Fort" (see `customerContext`). */
  customer_id: 1,
  destination_city_id: 2,
  delivery_area: 'Fort',
  route_id: 1,
  delivery_address: '11 Main Street, Fort, Colombo',
  /** Hours past this week's Monday 00:00: one week plus an hour after the 08:00 departure. */
  placedHoursAfterThisMonday: 7 * 24 + 9,
  /** Days after placement; satisfies `chk_orders_min_lead` and `trg_validate_order_date`. */
  deliveryLeadDays: 10,
  /** Soft Drink Crate (`product_id` 9) has the catalog's highest space rate, 1.50 per unit. */
  items: [{ product_id: 9, quantity: 80 }] as SeedOrderItem[],
  /** Trips the split is expected to land on, for the verification assertions and QA reference. */
  expectedTripIds: [5, 6] as const
};
