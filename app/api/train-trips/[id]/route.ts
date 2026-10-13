/**
 * @file app/api/train-trips/[id]/route.ts
 * @description Status transition endpoint for a single cargo train trip.
 *
 * Endpoints:
 * - PATCH /api/train-trips/:id — moves a trip one step along Scheduled → Departed → Arrived.
 *
 * Why this exists (smoke-test gap G2, Docs/14_smoke-test-guide.md §3): before this route nothing
 * in the application could change a trip's status, so goods could never be received for a newly
 * placed order (`receive_goods_at_store` requires an `Arrived` trip) and orders never became
 * `In Transit` by themselves.
 *
 * Rules:
 * - Allowed moves are exactly `Scheduled → Departed` and `Departed → Arrived`. No skipping, no
 *   going back, no repeat of the current status. `Cancelled` exists in the schema but is not
 *   supported by this endpoint in version one.
 * - When a trip DEPARTS, every order with a booking on that trip that is still `Pending` becomes
 *   `In Transit` in the same transaction. An order split across two trips therefore becomes
 *   `In Transit` when its FIRST trip departs. Orders already past `Pending` are left alone.
 *   `trg_log_order_status_change` writes the status-history row using @current_user_id.
 * - When a trip ARRIVES nothing changes on orders: the store manager still receives the goods,
 *   and `receive_goods_at_store` moves the order to `At Store` once every booking has arrived.
 * - Only `logistics_manager` and `system_administrator` may change a trip's status.
 *
 * Concurrency: the trip row is locked with SELECT … FOR UPDATE inside an explicit transaction, so
 * two simultaneous requests cannot both apply the same transition.
 *
 * Known gap (accepted decision, Docs/03_architecture.md §19): `train_trips` has no audit trigger,
 * so a status change is not recorded in `audit_log`. The order status-history rows ARE recorded.
 *
 * Authority: Docs/03_architecture.md §7 and §19, Docs/05_api-and-pages.md §A5.
 * Owner: Member 1 (Dineth) for this endpoint; trip creation and listing belong to Member 2.
 */

import { NextResponse } from 'next/server';
import { withUserContext } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { changeTripStatus, TripStatusError, type TargetTripStatus } from './service';

/**
 * Builds the standard JSON error response used across the API.
 *
 * @param code - Machine-readable error code
 * @param message - User-facing explanation
 * @param status - HTTP status code
 * @param field - Optional name of the offending request field
 * @returns A NextResponse carrying `{ error: { code, message, field? } }`
 */
function errorResponse(code: string, message: string, status: number, field?: string): NextResponse {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status });
}

/**
 * Handles PATCH /api/train-trips/:id.
 *
 * Flow:
 * 1. Authenticate and require the `train_trips:update` permission (logistics manager, administrator).
 * 2. Validate the trip ID and the requested target status.
 * 3. In one transaction: lock the trip, check the transition is legal, update the status and, for a
 *    departure, advance the trip's `Pending` orders to `In Transit`.
 *
 * Note: Next.js 16 passes route params as a Promise.
 *
 * @param req - Incoming request with JSON body `{ "status": "Departed" | "Arrived" }`
 * @param context - Route context holding the `id` URL parameter
 * @returns 200 `{ trip_id, status, orders_advanced }`; 400 invalid input or illegal transition;
 *          401/403 on auth failure; 404 unknown trip; 500 unexpected error
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // 1. Authentication and role check
    const session = await getSession();
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required. Please log in.', 401);
    }
    if (!hasPermission(session.role, 'train_trips', 'update')) {
      return errorResponse(
        'FORBIDDEN',
        `Role '${session.role}' is not authorized to change a train trip's status.`,
        403
      );
    }

    // 2. Validate the trip ID
    const { id } = await context.params;
    const tripId = Number(id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return errorResponse('INVALID_TRIP_ID', 'Invalid train trip ID provided.', 400, 'id');
    }

    // Validate the request body and the requested status
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
    }
    const requested = (body as { status?: unknown } | null)?.status;
    if (requested !== 'Departed' && requested !== 'Arrived') {
      return errorResponse(
        'INVALID_STATUS',
        "Status must be 'Departed' or 'Arrived'. Other status changes are not supported.",
        400,
        'status'
      );
    }
    const targetStatus: TargetTripStatus = requested;

    // 3. Transition inside an explicit transaction, under the caller's identity so the order
    //    status-history trigger records who departed the trip. The rules live in the service.
    const result = await withUserContext(session.user_id, session.role, async (conn) => {
      await conn.beginTransaction();
      try {
        const outcome = await changeTripStatus(conn, tripId, targetStatus);
        await conn.commit();
        return outcome;
      } catch (txError) {
        await conn.rollback();
        throw txError;
      }
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    // Expected rejections carry their own status code and message.
    if (error instanceof TripStatusError) {
      return errorResponse(error.code, error.message, error.httpStatus);
    }
    console.error('Error changing train trip status:', error);
    return errorResponse(
      'SERVER_ERROR',
      'Failed to change the train trip status. Please try again.',
      500
    );
  }
}
