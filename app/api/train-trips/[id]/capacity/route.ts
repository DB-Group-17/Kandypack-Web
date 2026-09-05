/**
 * @file app/api/train-trips/[id]/capacity/route.ts
 * @description Capacity query endpoint for a specific cargo train trip.
 * 
 * Endpoints:
 * - GET /api/train-trips/:id/capacity: Returns total, booked, and remaining cargo units for a trip.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A5
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Shape of the database capacity row.
 */
interface TripCapacityRow {
  trip_id: number;
  total_capacity: number;
  booked_space: number;
  remaining_capacity: number;
}

/**
 * Handles GET requests to /api/train-trips/[id]/capacity.
 * Queries current cargo capacity utilization, utilizing the get_available_capacity function.
 * 
 * Note: Next.js 16 expects params to be a Promise.
 * 
 * @param req - Incoming HTTP Request
 * @param context - Route context containing URL parameters
 * @returns JSON Response with capacity breakdown or 404 if trip not found
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession();

    // Verify RBAC permissions: all authenticated roles may read capacity
    if (session && !hasPermission(session.role, 'train_trips', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to inspect train capacities.`
          }
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const tripId = Number(id);

    if (isNaN(tripId) || tripId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TRIP_ID',
            message: 'Invalid train trip ID provided.',
            field: 'id'
          }
        },
        { status: 400 }
      );
    }

    // Query trip capacity using stored function get_available_capacity
    const capacityInfo = await queryOne<TripCapacityRow>(
      `SELECT 
         trip_id,
         CAST(total_capacity AS DOUBLE) AS total_capacity,
         CAST(booked_space AS DOUBLE) AS booked_space,
         CAST(get_available_capacity(trip_id) AS DOUBLE) AS remaining_capacity
       FROM train_trips
       WHERE trip_id = ?`,
      [tripId]
    );

    if (!capacityInfo) {
      return NextResponse.json(
        {
          error: {
            code: 'TRIP_NOT_FOUND',
            message: `Train trip with ID #${tripId} was not found.`
          }
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        trip_id: capacityInfo.trip_id,
        total_capacity: Number(capacityInfo.total_capacity),
        booked_space: Number(capacityInfo.booked_space),
        remaining_capacity: Number(capacityInfo.remaining_capacity)
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error fetching train trip capacity:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve train trip capacity. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
