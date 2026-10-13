/**
 * @file app/api/train-trips/[id]/service.ts
 * @description Business logic for changing a train trip's status (smoke-test gap G2).
 *
 * Kept separate from the route handler so the SQL can be exercised by integration tests inside a
 * transaction that is rolled back. The caller owns the transaction: it must `beginTransaction()`
 * before calling `changeTripStatus` and `commit()` or `rollback()` afterwards.
 *
 * Authority: Docs/03_architecture.md §7 and §19, Docs/05_api-and-pages.md §A5.
 * Owner: Member 1 (Dineth).
 */

import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

/** Trip statuses the status endpoint can set. `Scheduled` is the start state; `Cancelled` is unsupported. */
export type TargetTripStatus = 'Departed' | 'Arrived';

/**
 * The only legal transitions: current status → the single status it may move to.
 * A status missing from this map (Arrived, Cancelled) has no further transitions.
 */
const NEXT_STATUS: Record<string, TargetTripStatus | undefined> = {
  Scheduled: 'Departed',
  Departed: 'Arrived',
};

/**
 * Error for an expected, user-facing rejection (unknown trip or illegal transition). It carries the
 * code and HTTP status so the route can answer precisely instead of with a generic 500.
 */
export class TripStatusError extends Error {
  /** Machine-readable error code returned in the JSON body. */
  readonly code: string;
  /** HTTP status code to answer with. */
  readonly httpStatus: number;

  /**
   * @param code - Machine-readable error code
   * @param message - User-facing explanation
   * @param httpStatus - HTTP status to return
   */
  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Result of a successful status change. */
export interface TripStatusResult {
  trip_id: number;
  status: TargetTripStatus;
  /** How many Pending orders moved to In Transit (always 0 for an arrival). */
  orders_advanced: number;
}

/**
 * Moves a trip one step forward and, on departure, advances its Pending orders to In Transit.
 *
 * Rules:
 * - Only `Scheduled → Departed` and `Departed → Arrived` are legal.
 * - On departure, every order with a booking on this trip that is still `Pending` becomes
 *   `In Transit`. An order split across trips moves when its FIRST trip departs. Orders already
 *   past `Pending`, or cancelled, are left alone.
 * - `trg_log_order_status_change` writes the status history, using `@current_user_id` from the
 *   connection's session (set by `withUserContext`).
 * - The trip row is locked (`FOR UPDATE`) so two requests cannot apply the same transition.
 *
 * Must run inside the caller's open transaction.
 *
 * @param conn - Connection with an open transaction and the caller's user context
 * @param tripId - Trip to change
 * @param target - The requested new status
 * @returns The trip, its new status and how many orders were advanced
 * @throws TripStatusError for an unknown trip (404) or an illegal transition (400)
 */
export async function changeTripStatus(
  conn: PoolConnection,
  tripId: number,
  target: TargetTripStatus
): Promise<TripStatusResult> {
  const [tripRows] = await conn.execute<RowDataPacket[]>(
    'SELECT trip_id, status FROM train_trips WHERE trip_id = ? FOR UPDATE',
    [tripId]
  );
  if (tripRows.length === 0) {
    throw new TripStatusError('TRIP_NOT_FOUND', `Train trip #${tripId} was not found.`, 404);
  }

  // Enforce the one-step-forward state machine.
  const currentStatus = String(tripRows[0].status);
  const allowed = NEXT_STATUS[currentStatus];
  if (allowed !== target) {
    throw new TripStatusError(
      'INVALID_TRANSITION',
      allowed
        ? `Trip #${tripId} is ${currentStatus}; it can only be moved to ${allowed}.`
        : `Trip #${tripId} is ${currentStatus} and cannot change status any further.`,
      400
    );
  }

  await conn.execute('UPDATE train_trips SET status = ? WHERE trip_id = ?', [target, tripId]);

  // A departure puts the goods on the move: Pending orders booked on this trip become In Transit.
  let ordersAdvanced = 0;
  if (target === 'Departed') {
    const [advance] = await conn.execute<ResultSetHeader>(
      `UPDATE orders o
         JOIN train_bookings b ON b.order_id = o.order_id
          SET o.status = 'In Transit'
        WHERE b.trip_id = ? AND o.status = 'Pending'`,
      [tripId]
    );
    ordersAdvanced = advance.affectedRows;
  }

  return { trip_id: tripId, status: target, orders_advanced: ordersAdvanced };
}
