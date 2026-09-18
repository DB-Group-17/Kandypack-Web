/**
 * @file scripts/seed/train-trips.ts
 * @description Baseline train trips (Docs/06_seed-data-spec.md §8).
 *
 * 36 trips: 6 weekly trips per destination city, from 3 weeks before to 3 weeks after the
 * seed-run week, departing Monday 08:00 from Kandy.
 *
 * Why dates are computed in SQL: `place_order` searches for trips with
 * `departure_datetime > NOW()` using the database server clock (UTC on Aiven). Building dates
 * with JavaScript `Date` would use the developer's local clock (UTC+5:30 in Sri Lanka), so a trip
 * could look future locally but past to the procedure. `CURDATE()` keeps both on one clock.
 *
 * Dates are fixed at first run: `insertMissing` never modifies existing trips, so re-running
 * later does not move them forward (documented in the seed spec and local-setup guide).
 *
 * Owner: Member 1 (Dineth)
 */

import type { PoolConnection } from 'mysql2/promise';
import { insertMissing, sql, type SeedRow } from './helpers';
import { DESTINATIONS } from './data/locations';

/** Week offsets relative to the seed-run week. There is deliberately no trip in the current week. */
export const WEEK_OFFSETS = [-3, -2, -1, 1, 2, 3] as const;

/** The +2 week trip (8–14 days ahead, "roughly 10 days out") is the small overflow-test trip. */
export const OVERFLOW_WEEK_OFFSET = 2;

const STANDARD_CAPACITY = 500;
const OVERFLOW_CAPACITY = 50;
export const DEPARTURE_HOUR = 8;
export const HOURS_PER_WEEK = 7 * 24;

/**
 * SQL for Monday 00:00 of the seed-run week. `WEEKDAY()` returns 0 for Monday … 6 for Sunday,
 * matching the Monday–Sunday calendar used by `fn_week_start`.
 *
 * Exported (with the offsets and departure hour below) so the overflow test order in
 * scripts/seed/orders.ts can date itself against the same Monday. Duplicating the arithmetic there
 * would let the two drift, and that order's whole purpose depends on landing between two specific
 * trips' departures.
 */
export const THIS_MONDAY = 'DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)';

/**
 * Builds the 36 train-trip rows.
 *
 * - `trip_id = city_index × 6 + offset_index + 1`, giving stable IDs 1–36.
 * - Past trips are `Arrived`: even the latest past trip (last week, up to 10 h travel) arrived
 *   before the current week began. Future trips are `Scheduled`, the only status `place_order` books.
 * - Arrival = departure + the city's travel hours, satisfying `chk_tt_arrival`.
 *
 * @returns Seed rows for `train_trips`
 */
export function buildTrainTrips(): SeedRow[] {
  return DESTINATIONS.flatMap((city) =>
    WEEK_OFFSETS.map((offset, offsetIndex) => {
      const departureHours = offset * HOURS_PER_WEEK + DEPARTURE_HOUR;
      return {
        trip_id: city.index * WEEK_OFFSETS.length + offsetIndex + 1,
        destination_city_id: city.cityId,
        departure_datetime: sql(`DATE_ADD(${THIS_MONDAY}, INTERVAL ? HOUR)`, departureHours),
        arrival_datetime: sql(`DATE_ADD(${THIS_MONDAY}, INTERVAL ? HOUR)`, departureHours + city.travelHours),
        total_capacity: offset === OVERFLOW_WEEK_OFFSET ? OVERFLOW_CAPACITY : STANDARD_CAPACITY,
        status: offset < 0 ? 'Arrived' : 'Scheduled'
      };
    })
  );
}

/**
 * Inserts any missing baseline train trips. `booked_space` is left at its default of 0;
 * bookings (and therefore booked space) are created later by `place_order` or the order seed.
 *
 * @param conn - Transactional connection with user context applied
 * @returns Number of trips inserted
 */
export async function seedTrainTrips(conn: PoolConnection): Promise<number> {
  return insertMissing(conn, 'train_trips', 'trip_id', buildTrainTrips());
}
