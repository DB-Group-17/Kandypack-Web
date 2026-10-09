/**
 * @file tests/api/receive-goods-concurrency.test.ts
 * @description Concurrency and integration tests for POST /api/stores/:id/receive-goods.
 *
 * Verifies that:
 * - Simultaneous concurrent submissions for the same train booking are serialized via
 *   `SELECT ... FOR UPDATE` on train_bookings.
 * - The first request completes successfully (HTTP 200) and executes `receive_goods_at_store()`.
 * - The second concurrent request is blocked until the first commits, detects the newly committed
 *   `inventory_transactions` receipt record, rolls back, and returns HTTP 400 BUSINESS_RULE_VIOLATION.
 * - Inventory stock on hand is incremented exactly once (not doubled).
 * - Subsequent sequential calls are also rejected as duplicates.
 * - All test records are cleanly purged in afterAll, preserving zero database residue.
 *
 * Authority: Docs/03_architecture.md §16 Priority 2, Docs/05_api-and-pages.md §A6.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { POST } from '@/app/api/stores/[id]/receive-goods/route';
import { pool } from '@/lib/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// Mock session to authenticate as system_administrator with full rights
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

describe('API Route: POST /api/stores/:id/receive-goods Concurrency Guard', () => {
  const STORE_ID = 1;
  const TRIP_ID = 4; // Seed Trip 4 is 'Arrived' at Store 1 (Colombo, city_id = 2)
  const PRODUCT_ID = 1;
  const SHIPPED_QTY = 10;

  let testOrderId: number | null = null;
  let testOrderItemId: number | null = null;
  let testBookingId: number | null = null;
  let initialStock = 0;

  /**
   * Helper to construct incoming Request for receive-goods endpoint.
   */
  function createReceiveRequest(bookingId: number): Request {
    return new Request(`http://localhost:3000/api/stores/${STORE_ID}/receive-goods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ train_booking_id: bookingId }),
    });
  }

  beforeAll(async () => {
    // 1. Verify database connectivity
    const [aliveRows] = await pool.query<RowDataPacket[]>('SELECT 1 AS alive');
    expect(aliveRows[0]?.alive).toBe(1);

    // Clean up any stale test records from previous aborted runs
    const [staleOrders] = await pool.query<RowDataPacket[]>(
      "SELECT order_id FROM orders WHERE delivery_address = '123 Concurrency Test St'"
    );
    for (const row of staleOrders) {
      const oid = row.order_id;
      const [bookings] = await pool.query<RowDataPacket[]>(
        'SELECT booking_id FROM train_bookings WHERE order_id = ?',
        [oid]
      );
      for (const b of bookings) {
        await pool.query('DELETE FROM inventory_transactions WHERE train_booking_id = ?', [b.booking_id]);
        await pool.query('DELETE FROM train_booking_items WHERE booking_id = ?', [b.booking_id]);
      }
      await pool.query('DELETE FROM train_bookings WHERE order_id = ?', [oid]);
      await pool.query('DELETE FROM order_status_history WHERE order_id = ?', [oid]);
      await pool.query('DELETE FROM order_items WHERE order_id = ?', [oid]);
      await pool.query('DELETE FROM orders WHERE order_id = ?', [oid]);
    }

    // 2. Query initial stock level for PRODUCT_ID at STORE_ID
    const [invRows] = await pool.query<RowDataPacket[]>(
      'SELECT quantity_on_hand FROM store_inventory WHERE store_id = ? AND product_id = ?',
      [STORE_ID, PRODUCT_ID]
    );
    initialStock = Number(invRows[0]?.quantity_on_hand ?? 0);

    // 3. Create isolated test order header
    const [orderRes] = await pool.query<ResultSetHeader>(
      `INSERT INTO orders (
        customer_id, delivery_address, delivery_area, destination_city_id,
        route_id, order_placed_at, expected_delivery_date, status,
        total_value, total_space_required, created_by
      ) VALUES (
        1, '123 Concurrency Test St', 'Fort', 2,
        1, NOW(), CURDATE() + INTERVAL 10 DAY, 'Pending',
        100.00, 1.00, '00000000-0000-0000-0000-000000000001'
      )`
    );
    testOrderId = orderRes.insertId;

    // 4. Create test order line item
    const [itemRes] = await pool.query<ResultSetHeader>(
      `INSERT INTO order_items (
        order_id, product_id, quantity, unit_price_at_order,
        space_rate_at_order
      ) VALUES (
        ?, ?, ?, 10.00, 0.10
      )`,
      [testOrderId, PRODUCT_ID, SHIPPED_QTY]
    );
    testOrderItemId = itemRes.insertId;

    // 5. Create test train booking on arrived Trip 4
    const [bookingRes] = await pool.query<ResultSetHeader>(
      `INSERT INTO train_bookings (
        trip_id, order_id, space_booked, booked_at
      ) VALUES (
        ?, ?, 1.00, NOW()
      )`,
      [TRIP_ID, testOrderId]
    );
    testBookingId = bookingRes.insertId;

    // 6. Create test train booking item
    await pool.query(
      `INSERT INTO train_booking_items (
        booking_id, order_item_id, quantity_shipped, space_consumed
      ) VALUES (
        ?, ?, ?, 1.00
      )`,
      [testBookingId, testOrderItemId, SHIPPED_QTY]
    );
  });

  afterAll(async () => {
    try {
      if (testBookingId) {
        // Clean up created inventory transactions for this test booking
        await pool.query(
          'DELETE FROM inventory_transactions WHERE train_booking_id = ?',
          [testBookingId]
        );

        // Delete test booking items and booking
        await pool.query(
          'DELETE FROM train_booking_items WHERE booking_id = ?',
          [testBookingId]
        );
        await pool.query(
          'DELETE FROM train_bookings WHERE booking_id = ?',
          [testBookingId]
        );
      }

      if (testOrderId) {
        // Delete test status history, order items, and order header
        await pool.query(
          'DELETE FROM order_status_history WHERE order_id = ?',
          [testOrderId]
        );
        await pool.query(
          'DELETE FROM order_items WHERE order_id = ?',
          [testOrderId]
        );
        await pool.query(
          'DELETE FROM orders WHERE order_id = ?',
          [testOrderId]
        );
      }

      // Restore initial store inventory stock level
      await pool.query(
        'UPDATE store_inventory SET quantity_on_hand = ? WHERE store_id = ? AND product_id = ?',
        [initialStock, STORE_ID, PRODUCT_ID]
      );
    } finally {
      await pool.end();
    }
  });

  it('prevents concurrent duplicate receiving: only one request succeeds and stock is not doubled', async () => {
    expect(testBookingId).toBeDefined();
    if (!testBookingId) return;

    // Fire two requests simultaneously targeting the exact same booking ID
    const routeContext = { params: Promise.resolve({ id: String(STORE_ID) }) };
    const [res1, res2] = await Promise.all([
      POST(createReceiveRequest(testBookingId), routeContext),
      POST(createReceiveRequest(testBookingId), routeContext),
    ]);

    const results = [
      { status: res1.status, body: await res1.json() },
      { status: res2.status, body: await res2.json() },
    ];

    // Exactly one request must succeed with HTTP 200
    const successful = results.find((r) => r.status === 200);
    expect(successful).toBeDefined();
    expect(successful?.body).toEqual({ updated_products: 1 });

    // Exactly one request must be rejected with HTTP 400 BUSINESS_RULE_VIOLATION
    const rejected = results.find((r) => r.status === 400);
    expect(rejected).toBeDefined();
    expect(rejected?.body?.error?.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(rejected?.body?.error?.message).toMatch(/already been received/i);

    // Verify in database: exactly ONE receive transaction exists for this booking
    const [txnRows] = await pool.query<RowDataPacket[]>(
      `SELECT transaction_id, change_qty, transaction_type 
       FROM inventory_transactions 
       WHERE train_booking_id = ? AND transaction_type = 'receive'`,
      [testBookingId]
    );
    expect(txnRows.length).toBe(1);
    expect(Number(txnRows[0].change_qty)).toBe(SHIPPED_QTY);

    // Verify in database: stock on hand increased by exactly SHIPPED_QTY, NOT doubled
    const [invRows] = await pool.query<RowDataPacket[]>(
      'SELECT quantity_on_hand FROM store_inventory WHERE store_id = ? AND product_id = ?',
      [STORE_ID, PRODUCT_ID]
    );
    const updatedStock = Number(invRows[0]?.quantity_on_hand ?? 0);
    expect(updatedStock).toBe(initialStock + SHIPPED_QTY);
  });

  it('rejects subsequent sequential duplicate receiving requests with HTTP 400', async () => {
    expect(testBookingId).toBeDefined();
    if (!testBookingId) return;

    const routeContext = { params: Promise.resolve({ id: String(STORE_ID) }) };
    const res = await POST(createReceiveRequest(testBookingId), routeContext);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body?.error?.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(body?.error?.message).toMatch(/already been received/i);
  });
});
