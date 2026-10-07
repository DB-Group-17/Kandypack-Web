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
 * Response 400: business-rule violation (delivery not found, already completed)
 * Response 401/403: auth failure
 * Response 500: unexpected error
 *
 * Business logic:
 *   1. Validate delivery_id from URL and optional notes from body
 *   2. Call `CALL complete_delivery(delivery_id, notes)` inside withUserContext
 *      (sets @current_user_id / @current_app_role for the procedure's role guard)
 *   3. The procedure:
 *      - Validates delivery exists and isn't already completed
 *      - Sets deliveries.status = 'Completed', notes = COALESCE(notes, existing)
 *      - Writes dispatch inventory_transactions rows (negative change_qty)
 *      - trg_delivery_complete_order fires → sets orders.status = 'Delivered'
 *   4. No Redis lock needed — the procedure is idempotent (SIGNALs on re-complete)
 *
 * References:
 *   - Docs/05_api-and-pages.md §A8 (PATCH /api/deliveries/:id/complete)
 *   - db/migrations/18_proc_remaining.sql complete_delivery()
 *   - lib/rbac.ts PERMISSION_MATRIX.deliveries.complete_delivery
 *   - lib/db.ts withUserContext
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { withUserContext } from '@/lib/db';

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

// ─── PATCH ──────────────────────────────────────────────────────────────────

/**
 * PATCH /api/deliveries/:id/complete
 *
 * Marks a delivery as completed by calling the complete_delivery() stored
 * procedure. The procedure validates the delivery exists, is not already
 * completed, writes dispatch inventory_transactions, and the trigger
 * automatically flips the linked order status to 'Delivered'.
 *
 * @param request - Incoming Next.js request (contains optional { notes } body)
 * @param context - Route segment context with params.id (delivery_id)
 * @returns 200 { delivery_id, status, order_status } on success
 * @returns 400 on business-rule violation from the DB procedure
 * @returns 401/403 on auth failure
 * @returns 500 on unexpected error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Step 1 — Auth: verify session and check complete_delivery permission
    const session = await getSession();
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

    // Step 4 — Call complete_delivery() with user context for role guard + audit
    // withUserContext sets @current_user_id and @current_app_role on the connection,
    // which the procedure uses for its role authorization check (line 89 of 18_proc_remaining.sql)
    await withUserContext(
      session.user_id,
      session.role,
      async (conn) => {
        await conn.execute(
          'CALL complete_delivery(?, ?)',
          [deliveryId, notes] as Parameters<typeof conn.execute>[1]
        );
      }
    );

    // Step 5 — Return success response per doc A8 shape
    // The trigger trg_delivery_complete_order has already flipped the order to 'Delivered'
    return NextResponse.json({
      delivery_id: deliveryId,
      status: 'Completed',
      order_status: 'Delivered',
    });
  } catch (err) {
    // ── 400: Intentional business-rule violation from the procedure ────────
    // complete_delivery SIGNALs '45000' for: delivery not found, already completed, role not authorized
    if (isSqlSignal(err)) {
      return NextResponse.json(
        { error: { code: 'BUSINESS_RULE_VIOLATION', message: extractSqlSignalMessage(err) } },
        { status: 400 }
      );
    }

    // ── 401/403: Auth or RBAC failure (ForbiddenError from requirePermission) ─
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
