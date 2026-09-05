/**
 * @file app/api/train-trips/route.ts
 * @description API route handler for managing cargo train trips between Kandy and destination cities.
 * 
 * Endpoints:
 * - GET /api/train-trips: Lists scheduled and past train trips with optional city, date, and status filters.
 * - POST /api/train-trips: Creates a new bulk cargo train departure from Kandy to a regional destination.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A5
 * Copy Source: Docs/07_content-copy.md §/train-schedule
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { query, queryOne, execute, QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Interface representing a train trip row joined with the destination city name.
 */
interface TrainTripRow {
  trip_id: number;
  destination_city_id: number;
  destination_city: string;
  departure_datetime: string | Date;
  arrival_datetime: string | Date;
  total_capacity: number;
  booked_space: number;
  remaining_capacity: number;
  status: 'Scheduled' | 'Departed' | 'Arrived' | 'Cancelled';
}

/**
 * Interface representing city record for validation.
 */
interface CityRow {
  city_id: number;
  city_name: string;
  is_destination: number;
}

/**
 * Handles GET requests to /api/train-trips.
 * Supports filtering by city_id, status, date_from, and date_to.
 * 
 * @param req - Incoming HTTP Request with query parameters
 * @returns JSON Response containing list of matching train trips
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.'
          }
        },
        { status: 401 }
      );
    }

    // Verify RBAC permissions: logistics_manager, store_manager, system_administrator
    if (!hasPermission(session.role, 'train_trips', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view train trips.`
          }
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const cityIdParam = searchParams.get('city_id');
    const statusParam = searchParams.get('status');
    const dateFromParam = searchParams.get('date_from');
    const dateToParam = searchParams.get('date_to');

    // Build parameterized query dynamically
    let sql = `
      SELECT 
        t.trip_id,
        t.destination_city_id,
        c.city_name AS destination_city,
        t.departure_datetime,
        t.arrival_datetime,
        CAST(t.total_capacity AS DOUBLE) AS total_capacity,
        CAST(t.booked_space AS DOUBLE) AS booked_space,
        CAST((t.total_capacity - t.booked_space) AS DOUBLE) AS remaining_capacity,
        t.status
      FROM train_trips t
      JOIN cities c ON t.destination_city_id = c.city_id
      WHERE 1=1
    `;
    const params: QueryParam[] = [];

    // Filter by destination city if specified and valid
    if (cityIdParam && !isNaN(Number(cityIdParam))) {
      sql += ` AND t.destination_city_id = ?`;
      params.push(Number(cityIdParam));
    }

    // Filter by trip status if not 'All'
    if (statusParam && statusParam !== 'All') {
      sql += ` AND t.status = ?`;
      params.push(statusParam);
    }

    // Filter by departure date start
    if (dateFromParam) {
      sql += ` AND t.departure_datetime >= ?`;
      params.push(dateFromParam);
    }

    // Filter by departure date end
    if (dateToParam) {
      sql += ` AND t.departure_datetime <= ?`;
      params.push(dateToParam);
    }

    // Order by departure date descending (upcoming and recent departures first)
    sql += ` ORDER BY t.departure_datetime DESC, t.trip_id DESC`;

    const trips = await query<TrainTripRow[]>(sql, params);

    // Format timestamps as ISO strings
    const items = trips.map((trip) => ({
      trip_id: trip.trip_id,
      destination_city_id: trip.destination_city_id,
      destination_city: trip.destination_city,
      departure_datetime:
        trip.departure_datetime instanceof Date
          ? trip.departure_datetime.toISOString()
          : new Date(trip.departure_datetime).toISOString(),
      arrival_datetime:
        trip.arrival_datetime instanceof Date
          ? trip.arrival_datetime.toISOString()
          : new Date(trip.arrival_datetime).toISOString(),
      total_capacity: Number(trip.total_capacity),
      booked_space: Number(trip.booked_space),
      remaining_capacity: Number(trip.remaining_capacity),
      status: trip.status
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching train trips:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve train trips. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests to /api/train-trips.
 * Creates a new train cargo trip from Kandy to a destination station store.
 * 
 * Validations:
 * - Role permission: logistics_manager, system_administrator
 * - Required fields: destination_city_id, departure_datetime, arrival_datetime, total_capacity
 * - arrival_datetime > departure_datetime (enforces chk_tt_arrival)
 * - total_capacity > 0 (enforces chk_tt_capacity)
 * - destination city must be a valid destination (is_destination = 1)
 * 
 * @param req - Incoming HTTP Request with JSON payload
 * @returns JSON Response containing the created train trip row with HTTP 201
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.'
          }
        },
        { status: 401 }
      );
    }

    // Verify RBAC permissions: logistics_manager, system_administrator
    if (!hasPermission(session.role, 'train_trips', 'create')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to schedule train trips.`
          }
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      destination_city_id,
      departure_datetime,
      arrival_datetime,
      total_capacity
    } = body;

    // 1. Validate required fields
    if (
      !destination_city_id ||
      !departure_datetime ||
      !arrival_datetime ||
      total_capacity === undefined ||
      total_capacity === null
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'All fields (destination city, departure datetime, arrival datetime, total capacity) are required.'
          }
        },
        { status: 400 }
      );
    }

    const capacityNum = Number(total_capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CAPACITY',
            message: 'Total cargo capacity must be greater than zero.',
            field: 'total_capacity'
          }
        },
        { status: 400 }
      );
    }

    const depDate = new Date(departure_datetime);
    const arrDate = new Date(arrival_datetime);

    if (isNaN(depDate.getTime()) || isNaN(arrDate.getTime())) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_DATETIME',
            message: 'Invalid departure or arrival date and time format.'
          }
        },
        { status: 400 }
      );
    }

    // 2. Enforce chronological order (chk_tt_arrival)
    if (arrDate <= depDate) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SCHEDULE',
            message: 'Arrival time must be after departure time.',
            field: 'arrival_datetime'
          }
        },
        { status: 400 }
      );
    }

    // 3. Verify destination city exists and is designated as a destination
    const city = await queryOne<CityRow>(
      'SELECT city_id, city_name, is_destination FROM cities WHERE city_id = ?',
      [destination_city_id]
    );

    if (!city) {
      return NextResponse.json(
        {
          error: {
            code: 'CITY_NOT_FOUND',
            message: 'The selected destination city does not exist.',
            field: 'destination_city_id'
          }
        },
        { status: 400 }
      );
    }

    if (city.is_destination !== 1) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_DESTINATION',
            message: `${city.city_name} is not configured as a cargo destination city.`,
            field: 'destination_city_id'
          }
        },
        { status: 400 }
      );
    }

    // 4. Format dates for MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
    const formatSqlDatetime = (d: Date): string => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const sqlDeparture = formatSqlDatetime(depDate);
    const sqlArrival = formatSqlDatetime(arrDate);

    // 5. Insert new train trip record
    const insertResult = await execute(
      `INSERT INTO train_trips 
        (destination_city_id, departure_datetime, arrival_datetime, total_capacity, booked_space, status)
       VALUES (?, ?, ?, ?, 0, 'Scheduled')`,
      [city.city_id, sqlDeparture, sqlArrival, capacityNum]
    );

    const newTripId = insertResult.insertId;

    // 6. Return the newly created trip details
    const createdTrip = {
      trip_id: newTripId,
      destination_city_id: city.city_id,
      destination_city: city.city_name,
      departure_datetime: depDate.toISOString(),
      arrival_datetime: arrDate.toISOString(),
      total_capacity: capacityNum,
      booked_space: 0,
      remaining_capacity: capacityNum,
      status: 'Scheduled' as const
    };

    return NextResponse.json(createdTrip, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating train trip:', error);

    // Check if error is a MySQL SIGNAL or constraint violation
    if (error && typeof error === 'object' && 'sqlMessage' in error) {
      const mysqlError = error as { sqlMessage?: string };
      return NextResponse.json(
        {
          error: {
            code: 'DATABASE_CONSTRAINT_VIOLATION',
            message: mysqlError.sqlMessage || 'A database constraint prevented scheduling this trip.'
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create train trip. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
