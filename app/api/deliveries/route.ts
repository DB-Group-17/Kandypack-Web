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
 *   - date_from  YYYY-MM-DD — deliveries created on or after this date
 *   - date_to    YYYY-MM-DD — deliveries created on or before this date
 * Response 200: { items: DeliveryItem[], total: number }
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
    // Step 1 — Auth: verify session and check deliveries read permission
    const session = await getSession();
    requirePermission(session, 'deliveries', 'read');

    // Step 2 — Parse optional filter query params
    const { searchParams } = new URL(request.url);
    const status   = searchParams.get('status');     // Scheduled | In Progress | Completed | Failed | Cancelled
    const dateFrom = searchParams.get('date_from');  // YYYY-MM-DD
    const dateTo   = searchParams.get('date_to');    // YYYY-MM-DD

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
