/**
 * @file scripts/seed/data/locations.ts
 * @description Baseline cities, stores, routes and route coverage areas.
 *
 * Implements Docs/06_seed-data-spec.md §1, §2 and §5. IDs are explicit so every member's
 * tests can rely on them (e.g. store 1 is always Colombo). Constraints respected here:
 * - `uq_stores_city`: one store per destination city; Kandy (origin) has none.
 * - `uq_coverage_area_per_city`: an area name appears once per city.
 * - Coverage-area `city_id` equals the route's store city, so `place_order` matches correctly.
 *
 * Owner: Member 1 (Dineth)
 */

import type { SeedRow } from '../helpers';

/** City IDs used across the data files, named for readability. */
export const CITY = {
  KANDY: 1,
  COLOMBO: 2,
  NEGOMBO: 3,
  GALLE: 4,
  MATARA: 5,
  JAFFNA: 6,
  TRINCOMALEE: 7
} as const;

/** §1 — 7 cities: Kandy is the rail origin, the other six are destinations. */
export const CITIES: SeedRow[] = [
  { city_id: CITY.KANDY, city_name: 'Kandy', is_origin: 1, is_destination: 0 },
  { city_id: CITY.COLOMBO, city_name: 'Colombo', is_origin: 0, is_destination: 1 },
  { city_id: CITY.NEGOMBO, city_name: 'Negombo', is_origin: 0, is_destination: 1 },
  { city_id: CITY.GALLE, city_name: 'Galle', is_origin: 0, is_destination: 1 },
  { city_id: CITY.MATARA, city_name: 'Matara', is_origin: 0, is_destination: 1 },
  { city_id: CITY.JAFFNA, city_name: 'Jaffna', is_origin: 0, is_destination: 1 },
  { city_id: CITY.TRINCOMALEE, city_name: 'Trincomalee', is_origin: 0, is_destination: 1 }
];

/**
 * Destination cities in spec order, with the rail travel time from Kandy.
 * `index` is the city_index used for customer and train-trip ID arithmetic; `storeId`
 * is that city's store. Travel hours follow §8 (shorter to Colombo/Negombo, longer north/east).
 */
export const DESTINATIONS = [
  { index: 0, cityId: CITY.COLOMBO, storeId: 1, name: 'Colombo', travelHours: 6 },
  { index: 1, cityId: CITY.NEGOMBO, storeId: 2, name: 'Negombo', travelHours: 6 },
  { index: 2, cityId: CITY.GALLE, storeId: 3, name: 'Galle', travelHours: 8 },
  { index: 3, cityId: CITY.MATARA, storeId: 4, name: 'Matara', travelHours: 8 },
  { index: 4, cityId: CITY.JAFFNA, storeId: 5, name: 'Jaffna', travelHours: 10 },
  { index: 5, cityId: CITY.TRINCOMALEE, storeId: 6, name: 'Trincomalee', travelHours: 10 }
] as const;

/** §2 — 6 stores, one beside each destination railway station. */
export const STORES: SeedRow[] = [
  { store_id: 1, city_id: CITY.COLOMBO, store_name: 'Colombo Station Store', railway_station_name: 'Colombo Fort', address_line: 'Olcott Mawatha, Colombo 11', contact_phone: '0112000001' },
  { store_id: 2, city_id: CITY.NEGOMBO, store_name: 'Negombo Station Store', railway_station_name: 'Negombo', address_line: 'Station Road, Negombo', contact_phone: '0312000002' },
  { store_id: 3, city_id: CITY.GALLE, store_name: 'Galle Station Store', railway_station_name: 'Galle', address_line: 'Main Street, Galle', contact_phone: '0912000003' },
  { store_id: 4, city_id: CITY.MATARA, store_name: 'Matara Station Store', railway_station_name: 'Matara', address_line: 'Station Road, Matara', contact_phone: '0412000004' },
  { store_id: 5, city_id: CITY.JAFFNA, store_name: 'Jaffna Station Store', railway_station_name: 'Jaffna', address_line: 'Stanley Road, Jaffna', contact_phone: '0212000005' },
  { store_id: 6, city_id: CITY.TRINCOMALEE, store_name: 'Trincomalee Station Store', railway_station_name: 'Trincomalee', address_line: 'Dockyard Road, Trincomalee', contact_phone: '0262000006' }
];

/** Shape of one route definition before it is split into `routes` and `route_coverage_areas` rows. */
interface RouteDefinition {
  routeId: number;
  storeId: number;
  cityId: number;
  name: string;
  description: string;
  maxHours: number;
  areas: string[];
}

/**
 * §5 — 12 routes (two per store) with their exact coverage-area names.
 * `place_order` matches `orders.delivery_area` against these names (case-insensitive),
 * so order forms and seeded orders must use the same spellings.
 */
const ROUTE_DEFINITIONS: RouteDefinition[] = [
  { routeId: 1, storeId: 1, cityId: CITY.COLOMBO, name: 'Colombo North Route', description: 'Central and coastal Colombo (Colombo 1–7)', maxHours: 4, areas: ['Fort', 'Kollupitiya', 'Bambalapitiya', 'Wellawatte'] },
  { routeId: 2, storeId: 1, cityId: CITY.COLOMBO, name: 'Colombo South Route', description: 'Inner suburbs and southern coast', maxHours: 5, areas: ['Borella', 'Nugegoda', 'Dehiwala', 'Mount Lavinia'] },
  { routeId: 3, storeId: 2, cityId: CITY.NEGOMBO, name: 'Negombo City Route', description: 'Negombo town and lagoon area', maxHours: 3, areas: ['Negombo Town', 'Lewis Place', 'Periyamulla'] },
  { routeId: 4, storeId: 2, cityId: CITY.NEGOMBO, name: 'Negombo Suburb Route', description: 'Airport corridor and northern suburbs', maxHours: 4, areas: ['Katunayake', 'Seeduwa', 'Kochchikade'] },
  { routeId: 5, storeId: 3, cityId: CITY.GALLE, name: 'Galle City Route', description: 'Galle Fort and city centre', maxHours: 3, areas: ['Galle Fort', 'Kaluwella', 'Karapitiya'] },
  { routeId: 6, storeId: 3, cityId: CITY.GALLE, name: 'Galle Suburb Route', description: 'Coastal and inland suburbs', maxHours: 4.5, areas: ['Unawatuna', 'Hikkaduwa', 'Baddegama'] },
  { routeId: 7, storeId: 4, cityId: CITY.MATARA, name: 'Matara City Route', description: 'Matara town centre', maxHours: 3, areas: ['Matara Town', 'Nupe', 'Pamburana'] },
  { routeId: 8, storeId: 4, cityId: CITY.MATARA, name: 'Matara Suburb Route', description: 'Southern coast and inland towns', maxHours: 4, areas: ['Weligama', 'Dikwella', 'Akuressa'] },
  { routeId: 9, storeId: 5, cityId: CITY.JAFFNA, name: 'Jaffna City Route', description: 'Jaffna town and Nallur', maxHours: 3, areas: ['Jaffna Town', 'Nallur', 'Chundikuli'] },
  { routeId: 10, storeId: 5, cityId: CITY.JAFFNA, name: 'Jaffna Suburb Route', description: 'Peninsula towns', maxHours: 5, areas: ['Chavakachcheri', 'Point Pedro', 'Kankesanthurai'] },
  { routeId: 11, storeId: 6, cityId: CITY.TRINCOMALEE, name: 'Trincomalee City Route', description: 'Trincomalee town and harbour', maxHours: 3, areas: ['Trincomalee Town', 'Uppuveli', "Orr's Hill"] },
  { routeId: 12, storeId: 6, cityId: CITY.TRINCOMALEE, name: 'Trincomalee Suburb Route', description: 'Coastal and inland suburbs', maxHours: 5, areas: ['Kinniya', 'Nilaveli', 'Kantale'] }
];

/** §5 — `routes` rows derived from the route definitions. */
export const ROUTES: SeedRow[] = ROUTE_DEFINITIONS.map((route) => ({
  route_id: route.routeId,
  store_id: route.storeId,
  route_name: route.name,
  coverage_description: route.description,
  max_delivery_time_hours: route.maxHours
}));

/**
 * §5 — `route_coverage_areas` rows. `coverage_id` is assigned sequentially in definition
 * order (1–38) so IDs stay stable as long as the list above is only appended to.
 */
export const ROUTE_COVERAGE_AREAS: SeedRow[] = ROUTE_DEFINITIONS.flatMap((route) =>
  route.areas.map((area) => ({ route_id: route.routeId, city_id: route.cityId, area_name: area }))
).map((row, i) => ({ coverage_id: i + 1, ...row }));

/**
 * Looks up the coverage areas for a route. Used by customer data so each customer's
 * address sits inside an area that a seeded route actually covers.
 *
 * @param routeId - Route whose areas to return
 * @returns The route's area names, in definition order
 * @throws If the route ID is not defined (a programming error in the seed data)
 */
export function areasForRoute(routeId: number): string[] {
  const route = ROUTE_DEFINITIONS.find((r) => r.routeId === routeId);
  if (!route) throw new Error(`Seed data error: route ${routeId} is not defined.`);
  return route.areas;
}
