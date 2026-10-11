/**
 * @file tests/integration/trip-status-and-delivery-assignment.test.ts
 * @description Integration tests (real MySQL) for the two smoke-test gap fixes:
 *   - G2: changeTripStatus(): Scheduled → Departed → Arrived, with Pending orders moving to
 *         In Transit on departure.
 *   - G1: attachOrdersToSchedule(): turning At Store orders into Scheduled deliveries on a schedule.
 *
 * Isolation (same strategy as place-order-capacity.test.ts): every case runs inside a transaction that
 * is ALWAYS rolled back, creates its own synthetic trips, and places orders with a fixed far-future
 * order date (2040), so only those trips can be chosen and nothing is left in the shared database.
 * The service functions take the connection as a parameter precisely so they can run inside such a
 * transaction (the route handlers commit their own, which a test must not do).
 *
 * Authority: Docs/03_architecture.md §19, Docs/05_api-and-pages.md §A5 and §A7.
 * Owner: Member 1 (Dineth).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, withUserContext } from '@/lib/db';
import { changeTripStatus } from '@/app/api/train-trips/[id]/service';
import { attachOrdersToSchedule } from '@/app/api/truck-schedules/service';
import { GET as getEligibleOrders } from '@/app/api/truck-schedules/eligible-orders/route';

// Only authentication is mocked, so the real eligible-orders SQL can run against the database.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getSession: vi.fn().mockResolvedValue({
      user_id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@kandypack.lk',
      role: 'system_administrator',
      store_id: null,
      display_name: 'System Administrator',
    }),
  };
});

/** Bootstrap administrator used as the acting user (same account as the other integration tests). */
const TEST_ADMIN = {
  user_id: '00000000-0000-0000-0000-000000000001',
  role: 'system_administrator',
};

/** Fixed far-future order date and delivery date: no real trip departs after it. */
const ORDER_PLACED_AT = '2040-01-01 08:00:00';
const EXPECTED_DELIVERY_DATE = '2040-01-20';
/** Synthetic trip departures, trip A first. */
const TRIP_A_DEPARTURE = '2040-01-02 08:00:00';
const TRIP_B_DEPARTURE = '2040-01-09 08:00:00';
/** Start of the synthetic truck schedule (inside the 06:00–20:00 operating window). */
const SCHEDULE_START = '2040-01-03 08:00:00';

/** Delivery areas resolved from seed data: two areas that belong to DIFFERENT routes in one city. */
interface Targets {
  customerId: number;
  cityId: number;
  areaA: { name: string; routeId: number };
  areaB: { name: string; routeId: number };
  truckId: number;
  driverId: number;
  assistantId: number;
}

let t: Targets;

/**
 * Runs a callback in a user-context transaction that is always rolled back.
 *
 * @param callback - Test body receiving the transactional connection
 * @returns Resolves after the callback finishes and the transaction is rolled back
 */
async function inRolledBackTransaction(
  callback: (conn: PoolConnection) => Promise<void>
): Promise<void> {
  await withUserContext(TEST_ADMIN.user_id, TEST_ADMIN.role, async (conn) => {
    await conn.beginTransaction();
    try {
      await callback(conn);
    } finally {
      await conn.rollback();
    }
  });
}

/**
 * Inserts a synthetic Scheduled trip to the target city.
 *
 * @param conn - Transactional connection
 * @param departure - Departure datetime
 * @param capacity - Total cargo capacity
 * @returns The new trip_id
 */
async function createTrip(conn: PoolConnection, departure: string, capacity = 500): Promise<number> {
  const [r] = await conn.query<ResultSetHeader>(
    `INSERT INTO train_trips (destination_city_id, departure_datetime, arrival_datetime, total_capacity, status)
     VALUES (?, ?, DATE_ADD(?, INTERVAL 8 HOUR), ?, 'Scheduled')`,
    [t.cityId, departure, departure, capacity]
  );
  return r.insertId;
}

/**
 * Places an order through place_order() for the given area, product and quantity.
 *
 * @param conn - Transactional connection
 * @param areaName - Delivery area (decides the order's route)
 * @param productId - Product to order
 * @param quantity - Whole quantity
 * @returns The new order_id
 */
async function placeOrder(
  conn: PoolConnection,
  areaName: string,
  productId = 8,
  quantity = 5
): Promise<number> {
  await conn.query(
    `CALL place_order(?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, @trip_test_order_id)`,
    [
      t.customerId,
      'Trip status test address',
      areaName,
      t.cityId,
      EXPECTED_DELIVERY_DATE,
      JSON.stringify([{ product_id: productId, quantity }]),
      TEST_ADMIN.user_id,
      ORDER_PLACED_AT,
    ]
  );
  const [rows] = await conn.query<RowDataPacket[]>('SELECT @trip_test_order_id AS id');
  return Number(rows[0].id);
}

/**
 * Creates a truck schedule on a route through schedule_truck_delivery().
 *
 * @param conn - Transactional connection
 * @param routeId - Route to schedule
 * @returns The new schedule_id
 */
async function createSchedule(conn: PoolConnection, routeId: number): Promise<number> {
  await conn.query('CALL schedule_truck_delivery(?, ?, ?, ?, ?, @trip_test_schedule_id)', [
    t.truckId,
    t.driverId,
    t.assistantId,
    routeId,
    SCHEDULE_START,
  ]);
  const [rows] = await conn.query<RowDataPacket[]>('SELECT @trip_test_schedule_id AS id');
  return Number(rows[0].id);
}

/**
 * Reads an order's status.
 *
 * @param conn - Transactional connection
 * @param orderId - Order to read
 * @returns The status text
 */
async function orderStatus(conn: PoolConnection, orderId: number): Promise<string> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT status FROM orders WHERE order_id = ?', [
    orderId,
  ]);
  return String(rows[0].status);
}

/**
 * Forces an order's status directly (used to set up At Store / Cancelled orders without going
 * through the receive-goods flow, which needs an Arrived trip).
 *
 * @param conn - Transactional connection
 * @param orderId - Order to change
 * @param status - New status
 */
async function setOrderStatus(conn: PoolConnection, orderId: number, status: string): Promise<void> {
  await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);
}

describe('Integration / SQL: trip status and delivery assignment (rolled back)', () => {
  beforeAll(async () => {
    // Resolve seed data once. Two areas of one city on different routes make the route-mismatch case possible.
    const [customers] = await pool.query<RowDataPacket[]>(
      'SELECT customer_id FROM customers WHERE is_deleted = 0 ORDER BY customer_id LIMIT 1'
    );
    const [areas] = await pool.query<RowDataPacket[]>(
      `SELECT a.city_id, a.area_name, a.route_id
         FROM route_coverage_areas a
        WHERE a.city_id = (SELECT city_id FROM route_coverage_areas ORDER BY coverage_id LIMIT 1)
        ORDER BY a.coverage_id`
    );
    const routeIds = [...new Set(areas.map((a) => Number(a.route_id)))];
    expect(customers.length, 'seeded customer required').toBe(1);
    expect(routeIds.length, 'a city with two routes is required (seed data)').toBeGreaterThanOrEqual(2);

    const areaA = areas.find((a) => Number(a.route_id) === routeIds[0])!;
    const areaB = areas.find((a) => Number(a.route_id) === routeIds[1])!;
    const [trucks] = await pool.query<RowDataPacket[]>('SELECT truck_id FROM trucks WHERE is_deleted = 0 ORDER BY truck_id DESC LIMIT 1');
    const [drivers] = await pool.query<RowDataPacket[]>('SELECT driver_id FROM drivers WHERE is_deleted = 0 ORDER BY driver_id DESC LIMIT 1');
    const [assistants] = await pool.query<RowDataPacket[]>('SELECT assistant_id FROM assistants WHERE is_deleted = 0 ORDER BY assistant_id DESC LIMIT 1');

    t = {
      customerId: Number(customers[0].customer_id),
      cityId: Number(areaA.city_id),
      areaA: { name: String(areaA.area_name), routeId: Number(areaA.route_id) },
      areaB: { name: String(areaB.area_name), routeId: Number(areaB.route_id) },
      truckId: Number(trucks[0].truck_id),
      driverId: Number(drivers[0].driver_id),
      assistantId: Number(assistants[0].assistant_id),
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  // ───────────────────────────── G2: trip status ─────────────────────────────

  describe('changeTripStatus (G2)', () => {
    it('departure moves Pending orders to In Transit, leaves other orders alone, and writes the history', async () => {
      await inRolledBackTransaction(async (conn) => {
        const trip = await createTrip(conn, TRIP_A_DEPARTURE);
        const pending = await placeOrder(conn, t.areaA.name);
        const cancelled = await placeOrder(conn, t.areaA.name);
        await setOrderStatus(conn, cancelled, 'Cancelled');

        const result = await changeTripStatus(conn, trip, 'Departed');

        expect(result).toEqual({ trip_id: trip, status: 'Departed', orders_advanced: 1 });
        expect(await orderStatus(conn, pending)).toBe('In Transit');
        expect(await orderStatus(conn, cancelled)).toBe('Cancelled');

        const [history] = await conn.query<RowDataPacket[]>(
          `SELECT old_status, new_status, changed_by FROM order_status_history
            WHERE order_id = ? ORDER BY history_id DESC LIMIT 1`,
          [pending]
        );
        expect(history[0].old_status).toBe('Pending');
        expect(history[0].new_status).toBe('In Transit');
        expect(history[0].changed_by).toBe(TEST_ADMIN.user_id);

        const [tripRows] = await conn.query<RowDataPacket[]>('SELECT status FROM train_trips WHERE trip_id = ?', [trip]);
        expect(tripRows[0].status).toBe('Departed');
      });
    });

    it('arrival changes the trip only and advances no orders', async () => {
      await inRolledBackTransaction(async (conn) => {
        const trip = await createTrip(conn, TRIP_A_DEPARTURE);
        const order = await placeOrder(conn, t.areaA.name);
        await changeTripStatus(conn, trip, 'Departed');

        const result = await changeTripStatus(conn, trip, 'Arrived');

        expect(result).toEqual({ trip_id: trip, status: 'Arrived', orders_advanced: 0 });
        // The store manager's receive step, not arrival, moves the order to At Store.
        expect(await orderStatus(conn, order)).toBe('In Transit');
        const [tripRows] = await conn.query<RowDataPacket[]>('SELECT status FROM train_trips WHERE trip_id = ?', [trip]);
        expect(tripRows[0].status).toBe('Arrived');
      });
    });

    it('an order split across two trips becomes In Transit when its FIRST trip departs', async () => {
      await inRolledBackTransaction(async (conn) => {
        const tripA = await createTrip(conn, TRIP_A_DEPARTURE, 50);
        const tripB = await createTrip(conn, TRIP_B_DEPARTURE);
        // 60 x Rice 5kg (space 1.00 each) = 60 > 50, so 50 go on trip A and 10 on trip B.
        const order = await placeOrder(conn, t.areaA.name, 7, 60);

        const first = await changeTripStatus(conn, tripA, 'Departed');
        expect(first.orders_advanced).toBe(1);
        expect(await orderStatus(conn, order)).toBe('In Transit');

        // The second trip departing later finds the order already In Transit and changes nothing.
        const second = await changeTripStatus(conn, tripB, 'Departed');
        expect(second.orders_advanced).toBe(0);
        expect(await orderStatus(conn, order)).toBe('In Transit');
      });
    });

    it('rejects every illegal transition and an unknown trip', async () => {
      await inRolledBackTransaction(async (conn) => {
        const trip = await createTrip(conn, TRIP_A_DEPARTURE);

        // Scheduled cannot jump straight to Arrived.
        await expect(changeTripStatus(conn, trip, 'Arrived')).rejects.toMatchObject({
          code: 'INVALID_TRANSITION',
          httpStatus: 400,
          message: expect.stringContaining('can only be moved to Departed'),
        });

        await changeTripStatus(conn, trip, 'Departed');
        // Repeating the same status is rejected.
        await expect(changeTripStatus(conn, trip, 'Departed')).rejects.toMatchObject({
          code: 'INVALID_TRANSITION',
        });

        await changeTripStatus(conn, trip, 'Arrived');
        // Arrived is final: no going back and no repeat.
        await expect(changeTripStatus(conn, trip, 'Departed')).rejects.toMatchObject({
          code: 'INVALID_TRANSITION',
          message: expect.stringContaining('cannot change status any further'),
        });
        await expect(changeTripStatus(conn, trip, 'Arrived')).rejects.toMatchObject({
          code: 'INVALID_TRANSITION',
        });

        await expect(changeTripStatus(conn, 2147483000, 'Departed')).rejects.toMatchObject({
          code: 'TRIP_NOT_FOUND',
          httpStatus: 404,
        });
      });
    });
  });

  // ─────────────────────── G1: attaching orders to a schedule ───────────────────────

  describe('attachOrdersToSchedule (G1)', () => {
    it('creates one Scheduled delivery per At Store order, linked to the schedule', async () => {
      await inRolledBackTransaction(async (conn) => {
        await createTrip(conn, TRIP_A_DEPARTURE);
        const o1 = await placeOrder(conn, t.areaA.name);
        const o2 = await placeOrder(conn, t.areaA.name);
        await setOrderStatus(conn, o1, 'At Store');
        await setOrderStatus(conn, o2, 'At Store');
        const schedule = await createSchedule(conn, t.areaA.routeId);

        const deliveryIds = await attachOrdersToSchedule(conn, schedule, t.areaA.routeId, [o1, o2]);

        expect(deliveryIds).toHaveLength(2);
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT order_id, truck_schedule_id, status FROM deliveries
            WHERE delivery_id IN (?, ?) ORDER BY delivery_id`,
          deliveryIds
        );
        expect(rows.map((r) => [Number(r.order_id), Number(r.truck_schedule_id), r.status])).toEqual([
          [o1, schedule, 'Scheduled'],
          [o2, schedule, 'Scheduled'],
        ]);
      });
    });

    it('rejects an order that is not At Store and inserts nothing', async () => {
      await inRolledBackTransaction(async (conn) => {
        await createTrip(conn, TRIP_A_DEPARTURE);
        const pending = await placeOrder(conn, t.areaA.name); // stays Pending
        const schedule = await createSchedule(conn, t.areaA.routeId);

        await expect(
          attachOrdersToSchedule(conn, schedule, t.areaA.routeId, [pending])
        ).rejects.toThrow(/Order #\d+ is Pending; only orders that are At Store/);

        const [rows] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM deliveries WHERE truck_schedule_id = ?', [schedule]);
        expect(Number(rows[0].n)).toBe(0);
      });
    });

    it('rejects an order on a different route', async () => {
      await inRolledBackTransaction(async (conn) => {
        await createTrip(conn, TRIP_A_DEPARTURE);
        const otherRoute = await placeOrder(conn, t.areaB.name);
        await setOrderStatus(conn, otherRoute, 'At Store');
        const schedule = await createSchedule(conn, t.areaA.routeId);

        await expect(
          attachOrdersToSchedule(conn, schedule, t.areaA.routeId, [otherRoute])
        ).rejects.toThrow(/different delivery route/);
      });
    });

    it('rejects an order that already has an active delivery', async () => {
      await inRolledBackTransaction(async (conn) => {
        await createTrip(conn, TRIP_A_DEPARTURE);
        const order = await placeOrder(conn, t.areaA.name);
        await setOrderStatus(conn, order, 'At Store');
        const schedule = await createSchedule(conn, t.areaA.routeId);
        await attachOrdersToSchedule(conn, schedule, t.areaA.routeId, [order]);

        await expect(
          attachOrdersToSchedule(conn, schedule, t.areaA.routeId, [order])
        ).rejects.toThrow(/already has an active delivery/);
      });
    });

    it('rejects an unknown order, and a bad order among good ones inserts none of them', async () => {
      await inRolledBackTransaction(async (conn) => {
        await createTrip(conn, TRIP_A_DEPARTURE);
        const good = await placeOrder(conn, t.areaA.name);
        await setOrderStatus(conn, good, 'At Store');
        const pending = await placeOrder(conn, t.areaA.name); // not At Store
        const schedule = await createSchedule(conn, t.areaA.routeId);

        await expect(
          attachOrdersToSchedule(conn, schedule, t.areaA.routeId, [2147483000])
        ).rejects.toThrow(/was not found/);

        await expect(
          attachOrdersToSchedule(conn, schedule, t.areaA.routeId, [good, pending])
        ).rejects.toThrow(/only orders that are At Store/);

        // All checks run before any insert, so the good order was not attached either.
        const [rows] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM deliveries WHERE truck_schedule_id = ?', [schedule]);
        expect(Number(rows[0].n)).toBe(0);
      });
    });
  });

  // ────────────────── eligible-orders endpoint (real SQL, read only) ──────────────────

  describe('GET /api/truck-schedules/eligible-orders (real SQL)', () => {
    it('runs against the database and returns well-formed items', async () => {
      const res = await getEligibleOrders(
        new Request(`http://localhost:3000/api/truck-schedules/eligible-orders?route_id=${t.areaA.routeId}`) as never
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.total).toBe(body.items.length);
      for (const item of body.items) {
        expect(typeof item.order_id).toBe('number');
        expect(item.expected_delivery_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof item.total_space_required).toBe('number');
      }
    });
  });

  it('leaves no synthetic trips behind after the rollbacks', async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM train_trips WHERE departure_datetime >= ?',
      ['2040-01-01 00:00:00']
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
