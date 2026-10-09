/**
 * @file app/api/deliveries/route.ts
 * @description GET /api/deliveries — filterable list of customer order deliveries.
 *
 * Owner: Member 3 (Fleet & Deliveries)
 *
 * ── GET /api/deliveries ──────────────────────────────────────────────────────
 * Auth: Any authenticated role with 'deliveries' → 'read' permission
 *       (fleet_supervisor, system_administrator, logistics_manager,
 *        order_entry_clerk, store_manager — per PERMISSION_MATRIX).
 * Query params (all optional):
 *   - status     string  — Scheduled | In Progress | Completed | Failed | Cancelled
 *                          (any other value is rejected with 400)
 *   - date_from  YYYY-MM-DD — deliveries CREATED on or after this date
 *   - date_to    YYYY-MM-DD — deliveries CREATED on or before this date
 *                (created_at is used because delivered_at is null until completion)
 * Response 200: { items: DeliveryItem[], total: number }
 * Response 400: invalid status or date format
 * Response 401: no valid session; 403: role may not read deliveries
 *
 * References:
 *   - Docs/05_api-and-pages.md §A8 (Deliveries)
 *   - db/migrations/08_fleet.sql (deliveries table)
 *   - db/migrations/20_delivery_status_cancelled.sql (Cancelled status)
 *   - types/fleet.ts DeliveryItem, DeliveryStatus
 *   - lib/rbac.ts PERMISSION_MATRIX.deliveries.read
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { fetchDeliveriesFromDB } from './service';

/** Allowed delivery statuses — mirrors the chk_del_status CHECK constraint. */
const DELIVERY_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Failed', 'Cancelled'] as const;

/** Strict YYYY-MM-DD shape for the date_from / date_to filters. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// ─── GET ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/deliveries
 *
 * Returns a filterable list of deliveries with denormalized display names
 * for customer, truck plate, and driver. Follows the same auth/error
 * pattern as GET /api/truck-schedules.
 *
 * @param request - Incoming Next.js request (used to read query params)
 * @returns 200 { items: DeliveryItem[], total: number }
 * @returns 401/403 on auth failure
 * @returns 500 on unexpected error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
    requirePermission(session, 'deliveries', 'read');

    // Step 2 — Parse and validate optional filter query params
    const { searchParams } = new URL(request.url);
    const status   = searchParams.get('status')?.trim() || null;   // Scheduled | In Progress | Completed | Failed | Cancelled
    const dateFrom = searchParams.get('date_from')?.trim() || null; // YYYY-MM-DD
    const dateTo   = searchParams.get('date_to')?.trim() || null;   // YYYY-MM-DD

    // An unknown status would silently return an empty list; reject it instead (mirrors chk_del_status).
    if (status && !(DELIVERY_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: `status must be one of: ${DELIVERY_STATUSES.join(', ')}.`,
            field: 'status',
          },
        },
        { status: 400 }
      );
    }

    // Malformed dates would reach the SQL as garbage timestamps; reject them too.
    for (const [field, value] of [['date_from', dateFrom], ['date_to', dateTo]] as const) {
      if (value && !DATE_ONLY.test(value)) {
        return NextResponse.json(
          { error: { code: 'BAD_REQUEST', message: `${field} must be a date in YYYY-MM-DD format.`, field } },
          { status: 400 }
        );
      }
    }

    // Step 3 — Fetch deliveries from database with filters
    const items = await fetchDeliveriesFromDB({
      status,
      dateFrom,
      dateTo,
    });

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    // ── 401/403: Auth or RBAC failure (ForbiddenError from requirePermission) ─
    if (err instanceof Error && 'status' in err) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: (err as { status: number }).status }
      );
    }

    // ── 500: Unexpected error (DB, network, etc.) ────────────────────────
    console.error('[GET /api/deliveries]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
      { status: 500 }
    );
  }
}
