/**
 * @file app/api/deliveries/[id]/complete/route.ts
 * @description PATCH /api/deliveries/:id/complete — marks a delivery as completed
 *              by calling the stored procedure complete_delivery().
 *
 * Owner: Member 3 (Fleet & Deliveries)
 *
 * ── PATCH /api/deliveries/:id/complete ───────────────────────────────────────
 * Auth: fleet_supervisor, system_administrator, logistics_manager
 *       (PERMISSION_MATRIX.deliveries.complete_delivery)
 * Path param: id — delivery_id (positive integer)
 * Request body (optional): { "notes"?: string }
 * Response 200: { delivery_id, status: "Completed", order_status: "Delivered" }
 * Response 400: bad id, or a business-rule violation raised by the database
 *               (delivery not found, already completed, insufficient store stock)
 * Response 401: no valid session
 * Response 403: role not allowed to complete deliveries
 * Response 409: another request is completing the same delivery right now
 * Response 500: unexpected error
 *
 * Business logic:
 *   1. Validate delivery_id from the URL and the optional notes from the body.
 *   2. Take a Redis lock on the delivery (REDIS_KEYS.LOCK_DELIVERY_COMPLETE) so a
 *      double-click or retry cannot run two completions at once.
 *   3. Inside the lock, open an explicit database transaction and
 *      `CALL complete_delivery(delivery_id, notes)` under withUserContext (sets
 *      @current_user_id / @current_app_role for the procedure's role guard).
 *      The procedure:
 *        - validates the delivery exists and is not already Completed,
 *        - sets deliveries.status = 'Completed' (notes = COALESCE(notes, existing)),
 *        - writes dispatch inventory_transactions rows (negative change_qty),
 *        - trg_delivery_complete_order fires and sets orders.status = 'Delivered'.
 *   4. The transaction is REQUIRED, not optional. The procedure updates the delivery
 *      first and writes the stock dispatch last; under MySQL autocommit each statement
 *      commits separately, so a dispatch rejected for insufficient stock would leave a
 *      committed "Completed" delivery and a "Delivered" order with no stock movement,
 *      and a retry would fail with "already Completed". With the transaction, any
 *      failure rolls the delivery and the order back together (same rule as
 *      POST /api/orders, see Docs/03_architecture.md §19.1).
 *   5. The transaction is committed INSIDE the lock so the next caller sees the
 *      final state before it can take the lock.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A8 (PATCH /api/deliveries/:id/complete)
 *   - db/migrations/18_proc_remaining.sql complete_delivery()
 *   - lib/rbac.ts PERMISSION_MATRIX.deliveries.complete_delivery
 *   - lib/db.ts withUserContext, lib/redis.ts withLock / REDIS_KEYS
 */

import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { withUserContext } from '@/lib/db';
import { REDIS_KEYS, withLock } from '@/lib/redis';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true when the thrown error is a MySQL SIGNAL raised intentionally by a
 * stored procedure or trigger (SQLSTATE '45000').
 * Only these errors carry a user-safe message; all other DB errors should be
 * treated as unexpected and must not expose raw MySQL internals to the client.
 *
 * @param err - Any thrown error value
 * @returns true if the error originated from a SIGNAL SQLSTATE '45000' statement
 */
function isSqlSignal(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return e.sqlState === '45000';
  }
  return false;
}

/**
 * Extracts the user-facing message from a MySQL SIGNAL SQLSTATE '45000' error.
 * Call this ONLY after confirming isSqlSignal(err) === true.
 * mysql2 surfaces the message in err.sqlMessage (preferred) or err.message.
 *
 * @param err - A confirmed SIGNAL error value
 * @returns User-safe message string from the procedure or trigger
 */
function extractSqlSignalMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.sqlMessage === 'string') return e.sqlMessage;
    if (typeof e.message === 'string') return e.message;
  }
  return 'A business rule violation occurred.';
}

/**
 * Returns true when the error was thrown by withLock() because the lock is held
 * by another request. withLock reports this as a plain Error whose message
 * contains "currently locked" (the same check POST /api/orders relies on).
 *
 * @param err - Any thrown error value
 * @returns true if the lock could not be acquired
 */
function isLockContention(err: unknown): boolean {
  return err instanceof Error && err.message.includes('currently locked');
}

/** Row returned by the post-completion read-back of the linked order. */
interface CompletedRow extends RowDataPacket {
  delivery_status: string;
  order_status: string;
}

// ─── PATCH ──────────────────────────────────────────────────────────────────

/**
 * PATCH /api/deliveries/:id/complete
 *
 * Marks a delivery as completed by calling the complete_delivery() stored
 * procedure inside a Redis lock and a database transaction. The procedure
 * validates the delivery exists, is not already completed, writes dispatch
 * inventory_transactions, and the trigger automatically flips the linked order
 * to 'Delivered'. If any step fails the whole change is rolled back.
 *
 * @param request - Incoming Next.js request (contains optional { notes } body)
 * @param context - Route segment context with params.id (delivery_id)
 * @returns 200 { delivery_id, status, order_status } on success
 * @returns 400 on a bad id or a business-rule violation from the DB procedure
 * @returns 401 when unauthenticated, 403 when the role may not complete deliveries
 * @returns 409 when the delivery is already being completed by another request
 * @returns 500 on unexpected error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Step 1 — Auth: a missing session is a 401; a wrong role is a 403.
    // requirePermission alone would report both as 403, so check the session first.
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required. Please log in.' } },
        { status: 401 }
      );
    }
    requirePermission(session, 'deliveries', 'complete_delivery');

    // Step 2 — Parse and validate delivery_id from URL path param
    const { id } = await params;
    const deliveryId = Number(id);
    if (!Number.isFinite(deliveryId) || deliveryId <= 0 || !Number.isInteger(deliveryId)) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Delivery ID must be a positive integer.' } },
        { status: 400 }
      );
    }

    // Step 3 — Parse optional notes from request body
    // Body may be empty or contain { "notes": "..." }
    let notes: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.notes === 'string' && body.notes.trim().length > 0) {
        notes = body.notes.trim();
      }
    } catch {
      // Empty body or invalid JSON is fine — notes are optional
    }

    // Step 4 — Lock the delivery, then complete it in one transaction.
    const result = await withLock(
      REDIS_KEYS.LOCK_DELIVERY_COMPLETE(deliveryId),
      () =>
        // withUserContext sets @current_user_id and @current_app_role on the connection,
        // which the procedure uses for its role authorization check.
        withUserContext(session.user_id, session.role, async (conn) => {
          await conn.beginTransaction();
          try {
            await conn.execute(
              'CALL complete_delivery(?, ?)',
              [deliveryId, notes] as Parameters<typeof conn.execute>[1]
            );

            // Read back the real state (the trigger flipped the order) rather than
            // assuming it, so the response reflects what was actually committed.
            const [rows] = await conn.execute<CompletedRow[]>(
              `SELECT d.status AS delivery_status, o.status AS order_status
                 FROM deliveries d
                 JOIN orders o ON o.order_id = d.order_id
                WHERE d.delivery_id = ?`,
              [deliveryId]
            );
            const row = rows[0];
            if (!row) {
              throw new Error(`Delivery #${deliveryId} was completed but could not be read back.`);
            }

            // Commit inside the lock so the next caller sees the final state.
            await conn.commit();
            return row;
          } catch (error) {
            // Every failure path (including a rejected stock dispatch) undoes the
            // delivery and order update. The pooled connection must never be
            // returned with a transaction still open.
            await conn.rollback();
            throw error;
          }
        }),
      { ttlSeconds: 10 }
    );

    // Step 5 — Return success response per doc A8 shape
    return NextResponse.json({
      delivery_id: deliveryId,
      status: result.delivery_status,
      order_status: result.order_status,
    });
  } catch (err) {
    // ── 409: another request holds the lock for this delivery ──────────────
    if (isLockContention(err)) {
      return NextResponse.json(
        {
          error: {
            code: 'LOCK_CONTENTION',
            message: 'This delivery is already being completed. Please wait a moment and refresh.',
          },
        },
        { status: 409 }
      );
    }

    // ── 400: Intentional business-rule violation from the procedure or trigger ──
    // complete_delivery SIGNALs '45000' for: delivery not found, already completed,
    // role not authorized; trg_check_inventory_before_dispatch for insufficient stock.
    if (isSqlSignal(err)) {
      return NextResponse.json(
        { error: { code: 'BUSINESS_RULE_VIOLATION', message: extractSqlSignalMessage(err) } },
        { status: 400 }
      );
    }

    // ── 403: RBAC failure (ForbiddenError from requirePermission) ──────────
    if (err instanceof Error && 'status' in err) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: (err as { status: number }).status }
      );
    }

    // ── 500: Unexpected error (DB, network, etc.) ────────────────────────
    console.error('[PATCH /api/deliveries/:id/complete]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
