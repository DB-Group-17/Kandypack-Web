/**
 * @file scripts/seed/data/catalog.ts
 * @description Baseline products and customers.
 *
 * Implements Docs/06_seed-data-spec.md §3 and §4. Constraints respected here:
 * - `uq_products_sku`, `chk_products_price` (>= 0), `chk_products_space` (> 0).
 * - `chk_customer_type`: lowercase `retail` / `wholesale` only.
 *
 * Owner: Member 1 (Dineth)
 */

import type { SeedRow } from '../helpers';
import { DESTINATIONS, areasForRoute } from './locations';

/** Category → SKU code used in the `KP-<code>-<nnn>` SKU pattern (spec §3). */
const CATEGORY_CODE: Record<string, string> = {
  Household: 'HH',
  Food: 'FD',
  'Personal Care': 'PC',
  Beverages: 'BV'
};

/** §3 — product definitions in spec order (product_id = position + 1). */
const PRODUCT_DEFINITIONS: Array<[name: string, category: string, unit: string, price: number, spaceRate: number]> = [
  ['Detergent Powder 1kg', 'Household', 'box', 450.0, 0.5],
  ['Dish Soap 500ml', 'Household', 'bottle', 180.0, 0.2],
  ['Biscuits Family Pack', 'Food', 'pack', 220.0, 0.15],
  ['Instant Noodles Box (24)', 'Food', 'box', 1200.0, 0.8],
  ['Tea Powder 400g', 'Food', 'pack', 350.0, 0.1],
  ['Coconut Oil 1L', 'Food', 'bottle', 650.0, 0.3],
  ['Rice 5kg Bag', 'Food', 'bag', 900.0, 1.0],
  ['Toothpaste 100g', 'Personal Care', 'tube', 210.0, 0.05],
  ['Soft Drink Crate (24)', 'Beverages', 'crate', 1800.0, 1.5],
  ['Baby Diapers Pack', 'Personal Care', 'pack', 950.0, 0.4],
  ['Canned Fish 425g Case (24)', 'Food', 'case', 2400.0, 0.9],
  ['Shampoo 400ml', 'Personal Care', 'bottle', 480.0, 0.15]
];

/** §3 — 12 `products` rows with SKUs derived from category and ID. */
export const PRODUCTS: SeedRow[] = PRODUCT_DEFINITIONS.map(([name, category, unit, price, spaceRate], i) => {
  const productId = i + 1;
  return {
    product_id: productId,
    sku: `KP-${CATEGORY_CODE[category]}-${String(productId).padStart(3, '0')}`,
    product_name: name,
    category,
    unit_of_measure: unit,
    unit_price: price,
    space_rate: spaceRate
  };
});

/**
 * §4 — the four customer archetypes per city. `routeOffset` 0 places the customer on the
 * city route and 1 on the suburb route; `areaIndex` picks an area within that route, so every
 * customer's address lies in an area a seeded route really covers.
 */
const CUSTOMER_ARCHETYPES = [
  { suffix: 'Retail Mart', type: 'retail', routeOffset: 0, areaIndex: 0, street: 'Main Street' },
  { suffix: 'Family Store', type: 'retail', routeOffset: 0, areaIndex: 1, street: 'Temple Road' },
  { suffix: 'Wholesale Distributors', type: 'wholesale', routeOffset: 1, areaIndex: 0, street: 'Industrial Road' },
  { suffix: 'Trading Co.', type: 'wholesale', routeOffset: 1, areaIndex: 1, street: 'Market Lane' }
] as const;

/**
 * §4 — 24 `customers` rows: 4 per destination city, IDs `city_index × 4 + archetype + 1`.
 * Phones follow `07XXXXXXXX` (10 digits) and are unique by construction.
 */
export const CUSTOMERS: SeedRow[] = DESTINATIONS.flatMap((city) =>
  CUSTOMER_ARCHETYPES.map((archetype, a) => {
    const customerId = city.index * 4 + a + 1;
    // Each city owns routes city_index*2+1 (city) and city_index*2+2 (suburb)
    const routeId = city.index * 2 + 1 + archetype.routeOffset;
    const area = areasForRoute(routeId)[archetype.areaIndex];
    // "Trincomalee Trading Co." → "trincomalee.tradingco" (strip the trailing dot of "Co." so the address stays valid)
    const slug = `${city.name}.${archetype.suffix}`.toLowerCase().replace(/[^a-z0-9.]+/g, '').replace(/\.+$/, '');

    return {
      customer_id: customerId,
      customer_name: `${city.name} ${archetype.suffix}`,
      customer_type: archetype.type,
      phone: `07${city.index + 1}${String(customerId).padStart(7, '0')}`,
      email: `${slug}@example.lk`,
      registered_city_id: city.cityId,
      address_line: `${10 + customerId} ${archetype.street}, ${area}, ${city.name}`
    };
  })
);
