/**
 * @file tests/integration/place-order-capacity.test.ts
 * @description Integration tests for the exact-capacity boundary of the place_order procedure.
 *
 * Verifies that:
 * - An order that fills a trip exactly books one booking and leaves remaining capacity of 0.
 * - An order one unit over the trip's capacity is split across two trips, conserving quantity.
 * - A trip that is already full is skipped by the next order.
 *
 * Isolation strategy:
 * - Every case creates its own synthetic trips inside a transaction that ALWAYS rolls back.
 * - Orders are placed with a fixed far-future order date (2040), and place_order only considers
 *   trips departing after the order date, so real seeded trips can never be selected, locked or
 *   changed by these tests. The cases therefore do not depend on seed dates or on orders that
 *   other team members place against the shared development database.
 *
 * Authority: Docs/03_architecture.md §16 Priority 2, Docs/09_task-tracker.md Phase 4 (Member 1 stretch goal).
 * Owner: Member 1 (Dineth)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool, withUserContext } from '@/lib/db';

/** Bootstrap admin used for the session context, same account as place-order.test.ts. */
const TEST_ADMIN = {
  user_id: '00000000-0000-0000-0000-000000000001',
  role: 'system_administrator',
};

/** Fixed far-future order date: no real trip departs after it, so only synthetic trips qualify. */
const ORDER_PLACED_AT = '2040-01-01 08:00:00';

/** Expected delivery date, 19 days after ORDER_PLACED_AT so the 7-day rule is satisfied. */
const EXPECTED_DELIVERY_DATE = '2040-01-20';

/** Synthetic trip departures, both after ORDER_PLACED_AT and ordered so trip A is picked first. */
const TRIP_A_DEPARTURE = '2040-01-02 08:00:00';
const TRIP_B_DEPARTURE = '2040-01-09 08:00:00';

/** Capacity of the synthetic trips, in space units. */
const TRIP_CAPACITY = 50;

/** Product used for all orders. Its space rate is read from the database and verified below. */
const PRODUCT_ID = 1;

/** Space rate the cases are sized for (0.50 units per item): 100 items fill a 50-unit trip exactly. */
const EXPECTED_SPACE_RATE = 0.5;

/** Quantity that fills a TRIP_CAPACITY trip exactly at EXPECTED_SPACE_RATE. */
const EXACT_FIT_QUANTITY = TRIP_CAPACITY / EXPECTED_SPACE_RATE;

/** Master data resolved once from the database: a customer plus a valid delivery area and its city. */
interface OrderTarget {
  customerId: number;
  cityId: number;
  areaName: string;
}

let target: OrderTarget;

/**
 * Runs a callback on a user-context connection inside a transaction that is always rolled back,
 * guaranteeing the shared development database is left unchanged whatever the callback does.
 *
 * @param callback - Test body that receives the transactional connection.
 * @returns Resolves once the callback has finished and the transaction has been rolled back.
 */
async function withRolledBackTransaction(
  callback: (conn: PoolConnection) => Promise<void>
): Promise<void> {
  await withUserContext(TEST_ADMIN.user_id, TEST_ADMIN.role, async (conn) => {
    await conn.beginTransaction();
    try {
      await callback(conn);
    } finally {
      // ALWAYS roll back so no synthetic trip, order or booking survives the test
      await conn.rollback();
    }
  });
}

/**
 * Inserts a synthetic Scheduled train trip for the target city.
 *
 * @param conn - Transactional connection.
 * @param departure - Departure datetime ('YYYY-MM-DD HH:MM:SS'); arrival is set 8 hours later.
 * @returns The new trip_id.
 */
async function createTrip(conn: PoolConnection, departure: string): Promise<number> {
  const [result] = await conn.query<import('mysql2').ResultSetHeader>(
    `INSERT INTO train_trips
       (destination_city_id, departure_datetime, arrival_datetime, total_capacity, status)
     VALUES (?, ?, DATE_ADD(?, INTERVAL 8 HOUR), ?, 'Scheduled')`,
    [target.cityId, departure, departure, TRIP_CAPACITY]
  );
  return result.insertId;
}

/**
 * Places an order for PRODUCT_ID through the place_order procedure using the fixed far-future dates.
 *
 * @param conn - Transactional connection (the procedure must run inside the caller's transaction).
 * @param quantity - Whole number of items to order.
 * @returns The new order_id.
 */
async function placeTestOrder(conn: PoolConnection, quantity: number): Promise<number> {
  await conn.query(
    `CALL place_order(?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, @capacity_test_order_id)`,
    [
      target.customerId,
      'Capacity Test Address',
      target.areaName,
      target.cityId,
      EXPECTED_DELIVERY_DATE,
      JSON.stringify([{ product_id: PRODUCT_ID, quantity }]),
      TEST_ADMIN.user_id,
      ORDER_PLACED_AT,
    ]
  );
  const [rows] = await conn.query<RowDataPacket[]>('SELECT @capacity_test_order_id AS order_id');
  return Number(rows[0].order_id);
}

/**
 * Reads an order's train bookings ordered by trip, so index 0 is trip A when both are used.
 *
 * @param conn - Transactional connection.
 * @param orderId - Order whose bookings are returned.
 * @returns Rows with trip_id, space_booked and the total quantity shipped on that booking.
 */
async function getBookings(
  conn: PoolConnection,
  orderId: number
): Promise<{ trip_id: number; space_booked: number; quantity: number }[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT b.trip_id, b.space_booked, SUM(bi.quantity_shipped) AS quantity
       FROM train_bookings b
       JOIN train_booking_items bi ON bi.booking_id = b.booking_id
      WHERE b.order_id = ?
      GROUP BY b.booking_id, b.trip_id, b.space_booked
      ORDER BY b.trip_id`,
    [orderId]
  );
  return rows.map((r) => ({
    trip_id: Number(r.trip_id),
    space_booked: Number(r.space_booked),
    quantity: Number(r.quantity),
  }));
}

/**
 * Reads a trip's current booked and total capacity, as maintained by the booking triggers.
 *
 * @param conn - Transactional connection.
 * @param tripId - Trip to read.
 * @returns booked_space and total_capacity as numbers.
 */
async function getTrip(
  conn: PoolConnection,
  tripId: number
): Promise<{ booked_space: number; total_capacity: number }> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT booked_space, total_capacity FROM train_trips WHERE trip_id = ?',
    [tripId]
  );
  return {
    booked_space: Number(rows[0].booked_space),
    total_capacity: Number(rows[0].total_capacity),
  };
}

describe('Integration / SQL: place_order() exact-capacity boundary', () => {
  beforeAll(async () => {
    // Resolve master data once; fail with a clear message if the shared DB is not seeded
    const [customers] = await pool.query<RowDataPacket[]>(
      'SELECT customer_id FROM customers WHERE is_deleted = 0 ORDER BY customer_id LIMIT 1'
    );
    const [areas] = await pool.query<RowDataPacket[]>(
      'SELECT city_id, area_name FROM route_coverage_areas ORDER BY coverage_id LIMIT 1'
    );
    const [products] = await pool.query<RowDataPacket[]>(
      'SELECT space_rate FROM products WHERE product_id = ?',
      [PRODUCT_ID]
    );

    expect(customers.length, 'seeded customer required (npm run db:seed)').toBe(1);
    expect(areas.length, 'seeded route coverage area required (npm run db:seed)').toBe(1);
    // The cases are sized for this exact rate; a changed product must fail loudly, not confusingly
    expect(Number(products[0]?.space_rate), `product ${PRODUCT_ID} space_rate`).toBe(
      EXPECTED_SPACE_RATE
    );

    target = {
      customerId: Number(customers[0].customer_id),
      cityId: Number(areas[0].city_id),
      areaName: String(areas[0].area_name),
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('books an order that fills a trip exactly as one booking with 0 remaining capacity', async () => {
    await withRolledBackTransaction(async (conn) => {
      const tripA = await createTrip(conn, TRIP_A_DEPARTURE);
      await createTrip(conn, TRIP_B_DEPARTURE);

      const orderId = await placeTestOrder(conn, EXACT_FIT_QUANTITY);

      const bookings = await getBookings(conn, orderId);
      expect(bookings).toHaveLength(1);
      expect(bookings[0].trip_id).toBe(tripA);
      expect(bookings[0].space_booked).toBe(TRIP_CAPACITY);
      expect(bookings[0].quantity).toBe(EXACT_FIT_QUANTITY);

      const trip = await getTrip(conn, tripA);
      expect(trip.booked_space).toBe(trip.total_capacity);
    });
  });

  it('splits an order one unit over capacity across two trips without losing quantity', async () => {
    await withRolledBackTransaction(async (conn) => {
      const tripA = await createTrip(conn, TRIP_A_DEPARTURE);
      const tripB = await createTrip(conn, TRIP_B_DEPARTURE);

      const orderId = await placeTestOrder(conn, EXACT_FIT_QUANTITY + 1);

      const bookings = await getBookings(conn, orderId);
      expect(bookings).toHaveLength(2);
      expect(bookings.map((b) => b.trip_id)).toEqual([tripA, tripB]);
      expect(bookings[0].space_booked).toBe(TRIP_CAPACITY);
      expect(bookings[1].space_booked).toBe(EXPECTED_SPACE_RATE);

      // Quantity is conserved across the split and trip A is never over capacity
      expect(bookings.reduce((sum, b) => sum + b.quantity, 0)).toBe(EXACT_FIT_QUANTITY + 1);
      const trip = await getTrip(conn, tripA);
      expect(trip.booked_space).toBeLessThanOrEqual(trip.total_capacity);
    });
  });

  it('skips a full trip and books the next order on the following trip', async () => {
    await withRolledBackTransaction(async (conn) => {
      const tripA = await createTrip(conn, TRIP_A_DEPARTURE);
      const tripB = await createTrip(conn, TRIP_B_DEPARTURE);

      await placeTestOrder(conn, EXACT_FIT_QUANTITY);
      const nextOrderId = await placeTestOrder(conn, 10);

      const bookings = await getBookings(conn, nextOrderId);
      expect(bookings).toHaveLength(1);
      expect(bookings[0].trip_id).toBe(tripB);

      // The full trip is untouched by the second order
      const full = await getTrip(conn, tripA);
      expect(full.booked_space).toBe(full.total_capacity);
    });
  });

  it('leaves no synthetic trips behind after the transactions roll back', async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM train_trips WHERE departure_datetime >= ?',
      ['2040-01-01 00:00:00']
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
