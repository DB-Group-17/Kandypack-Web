# Kandypack — Seed Data Specification

> Status: Active
> Authority: Supporting
> Primary source: `Docs/04_database-schema-v4.md`
> Last reviewed: 2026-09-17

Defines the **exact** baseline dataset every member develops and tests against. Nobody invents their own test rows — if you need more data for a specific test, add it in your own migration/seed increment on top of this, never by editing the shared baseline.

Meets the project minimums: 40+ orders, 10+ routes, valid train schedule with defined capacities.

All dates below are **relative to seed run time** (`CURDATE()` / `NOW()`), not fixed dates, so the dataset stays valid (e.g. still respects the 7-day order rule) no matter when someone runs the seed script.

Execution mechanism: Baseline and bootstrap seed data are decoupled from schema migrations and executed via `npm run db:seed` (`scripts/seed.ts`). The script entry point delegates to modules in `scripts/seed/` (logic) and `scripts/seed/data/` (the row constants that implement this spec). Sections 1–8 and 12 are implemented; sections 9–11 are planned.

---

## 1. Cities — 7 rows (`city_id` 1–7)

| city_id | city_name | is_origin | is_destination |
|---|---|---|---|
| 1 | Kandy | 1 | 0 |
| 2 | Colombo | 0 | 1 |
| 3 | Negombo | 0 | 1 |
| 4 | Galle | 0 | 1 |
| 5 | Matara | 0 | 1 |
| 6 | Jaffna | 0 | 1 |
| 7 | Trincomalee | 0 | 1 |

## 2. Stores — 6 rows (`store_id` 1–6), one per destination city

| store_id | store_name | city_id |
|---|---|---|
| 1 | Colombo Station Store | 2 |
| 2 | Negombo Station Store | 3 |
| 3 | Galle Station Store | 4 |
| 4 | Matara Station Store | 5 |
| 5 | Jaffna Station Store | 6 |
| 6 | Trincomalee Station Store | 7 |

## 3. Products — 12 rows (`product_id` 1–12)

| product_id | sku | product_name | category | unit_of_measure | unit_price | space_rate |
|---|---|---|---|---|---|---|
| 1 | KP-HH-001 | Detergent Powder 1kg | Household | box | 450.00 | 0.50 |
| 2 | KP-HH-002 | Dish Soap 500ml | Household | bottle | 180.00 | 0.20 |
| 3 | KP-FD-003 | Biscuits Family Pack | Food | pack | 220.00 | 0.15 |
| 4 | KP-FD-004 | Instant Noodles Box (24) | Food | box | 1200.00 | 0.80 |
| 5 | KP-FD-005 | Tea Powder 400g | Food | pack | 350.00 | 0.10 |
| 6 | KP-FD-006 | Coconut Oil 1L | Food | bottle | 650.00 | 0.30 |
| 7 | KP-FD-007 | Rice 5kg Bag | Food | bag | 900.00 | 1.00 |
| 8 | KP-PC-008 | Toothpaste 100g | Personal Care | tube | 210.00 | 0.05 |
| 9 | KP-BV-009 | Soft Drink Crate (24) | Beverages | crate | 1800.00 | 1.50 |
| 10 | KP-PC-010 | Baby Diapers Pack | Personal Care | pack | 950.00 | 0.40 |
| 11 | KP-FD-011 | Canned Fish 425g Case (24) | Food | case | 2400.00 | 0.90 |
| 12 | KP-PC-012 | Shampoo 400ml | Personal Care | bottle | 480.00 | 0.15 |

*Space rates deliberately span 0.05–1.50 so capacity-overflow test scenarios (see §8) are easy to construct.*

**SKU pattern:** `KP-<category code>-<product_id padded to 3 digits>`. Category codes: `HH` Household, `FD` Food, `PC` Personal Care, `BV` Beverages. Products added later by the application should follow the same pattern with the next free number.

## 4. Customers — 24 rows (`customer_id` 1–24), 4 per destination city (2 retail + 2 wholesale)

Pattern per city (repeat for Colombo, Negombo, Galle, Matara, Jaffna, Trincomalee):
- `{City} Retail Mart` — customer_type: retail
- `{City} Family Store` — customer_type: retail
- `{City} Wholesale Distributors` — customer_type: wholesale
- `{City} Trading Co.` — customer_type: wholesale

Each with a realistic phone (`07XXXXXXXX`), `registered_city_id` matching their city, and a plausible local address.

## 5. Routes — 12 rows (`route_id` 1–12), 2 per city

Two routes per store covering different local areas. Every coverage area's `city_id` is the store's city, and area names are unique within a city (`uq_coverage_area_per_city`).

| route_id | route_name | store_id | city_id | max_delivery_time_hours | Coverage areas (`area_name`) |
|---|---|---|---|---|---|
| 1 | Colombo North Route | 1 | 2 | 4 | Fort, Kollupitiya, Bambalapitiya, Wellawatte |
| 2 | Colombo South Route | 1 | 2 | 5 | Borella, Nugegoda, Dehiwala, Mount Lavinia |
| 3 | Negombo City Route | 2 | 3 | 3 | Negombo Town, Lewis Place, Periyamulla |
| 4 | Negombo Suburb Route | 2 | 3 | 4 | Katunayake, Seeduwa, Kochchikade |
| 5 | Galle City Route | 3 | 4 | 3 | Galle Fort, Kaluwella, Karapitiya |
| 6 | Galle Suburb Route | 3 | 4 | 4.5 | Unawatuna, Hikkaduwa, Baddegama |
| 7 | Matara City Route | 4 | 5 | 3 | Matara Town, Nupe, Pamburana |
| 8 | Matara Suburb Route | 4 | 5 | 4 | Weligama, Dikwella, Akuressa |
| 9 | Jaffna City Route | 5 | 6 | 3 | Jaffna Town, Nallur, Chundikuli |
| 10 | Jaffna Suburb Route | 5 | 6 | 5 | Chavakachcheri, Point Pedro, Kankesanthurai |
| 11 | Trincomalee City Route | 6 | 7 | 3 | Trincomalee Town, Uppuveli, Orr's Hill |
| 12 | Trincomalee Suburb Route | 6 | 7 | 5 | Kinniya, Nilaveli, Kantale |

38 `route_coverage_areas` rows (`coverage_id` 1–38, in table order). `place_order` matches `delivery_area` against these names exactly (case-insensitive), so order-entry forms and seeded orders must use these spellings.

## 6. Employees — 30 rows + 1 bootstrap admin

*Corrected 2026-09-17: the role counts below sum to 30; the earlier heading said 31.*

| Role | Count | Notes |
|---|---|---|
| system_administrator | 1 | Seeded separately as the bootstrap admin (no `employees` row), not part of the 30 |
| logistics_manager | 2 | Not store-bound |
| order_entry_clerk | 3 | Not store-bound |
| store_manager | 6 | One per store, `home_store_id` set accordingly |
| fleet_supervisor | 3 | Not store-bound |
| driver | 8 | `home_store_id` distributed roughly evenly across the 6 stores |
| assistant | 8 | Same distribution as drivers |

Every `driver`/`assistant` employee row also gets a matching row in `drivers`/`assistants` (license number/expiry for drivers — use a future expiry date, e.g. +18 months from seed time).

**ID layout:** `employee_id` 1–2 logistics managers, 3–5 order-entry clerks, 6–11 store managers (store 1–6 in order), 12–14 fleet supervisors, 15–22 drivers (`driver_id` 1–8), 23–30 assistants (`assistant_id` 1–8). Driver and assistant home stores follow the order 1, 2, 3, 4, 5, 6, 1, 2.

## 7. Trucks — 6 rows (`truck_id` 1–6), one per store

| truck_id | plate_number | capacity_kg | home_store_id |
|---|---|---|---|
| 1 | NB-1001 | 3000 | 1 |
| 2 | NB-1002 | 3000 | 2 |
| 3 | NB-1003 | 2500 | 3 |
| 4 | NB-1004 | 2500 | 4 |
| 5 | NB-1005 | 3000 | 5 |
| 6 | NB-1006 | 2500 | 6 |

## 8. Train Trips — 36 rows, 6 per destination city

For each destination city, 6 trips spaced weekly, spanning **from 3 weeks in the past to 3 weeks in the future** relative to seed time (so both historical orders and upcoming test orders have valid trips to book against):
- `total_capacity = 500` units for 5 of the 6 trips per city
- **One deliberately small-capacity trip per city** (`total_capacity = 50`) placed roughly 10 days out — this is the dedicated overflow-test trip (see below)
- `departure_datetime` = weekly cadence, e.g. every Monday 08:00 from Kandy; `arrival_datetime` = departure + 6–10 hours depending on distance (Colombo/Negombo shorter, Jaffna/Trincomalee longer)
- `status`: `Departed`/`Arrived` for past trips, `Scheduled` for future ones

**Implementation:** week offsets `-3, -2, -1, +1, +2, +3` from the Monday of the seed-run week, departing 08:00 server time (dates are computed in SQL so they use the same clock as `place_order`). Past trips are `Arrived`; the `+2` trip is the 50-unit overflow trip. Travel time: 6 h Colombo/Negombo, 8 h Galle/Matara, 10 h Jaffna/Trincomalee. `trip_id = city_index × 6 + offset_index + 1` (city_index 0 = Colombo … 5 = Trincomalee), giving IDs 1–36.

**Dates are fixed at first run.** The seed never modifies existing rows, so re-running it later does not move trips forward; once the "future" trips have departed, append new trips with higher IDs rather than editing the baseline.

**Overflow test case:** seed one order (see §9 below) whose `total_space_required` exceeds the 50-unit small trip's remaining capacity, so `place_order`'s overflow-to-next-trip logic is exercised and verifiable by every member without writing a custom test order themselves.

## 9. Orders — 45 rows (`order_id` 1–45)

**Status distribution** (covers every status, satisfies "≥5 pending deliveries"):

| Status | Count |
|---|---|
| Delivered | 20 |
| Cancelled | 3 |
| Out for Delivery | 5 |
| At Store | 5 |
| In Transit | 7 |
| Pending | 5 |

**Date spread:** split across two quarters relative to seed time — roughly 25 orders dated in the *previous* completed quarter (all `Delivered`/`Cancelled`, so quarterly reports have real historical data), and 20 orders dated in the *current* quarter (the mix of in-progress statuses above).

**Line items:** average 3 items per order (range 1–6), drawn from the 12-product catalog, quantities between 5 and 100 depending on `customer_type` (wholesale orders skew larger).

**Overflow test order:** one specific order (e.g. `order_id 46`... — insert as an extra 46th row, or reuse one of the 45) targeting the small-capacity trip from §8, with enough total space to require splitting across two `train_bookings` rows. Document this order's ID in your seed script comments so QA can reference it directly (e.g. *"Order #46 — capacity overflow test case, booked across Trip #X and Trip #Y"*).

**Route matching:** every order's `delivery_area`/`destination_city_id` must actually match one of the 12 seeded routes' coverage areas — don't hand-write an order that `place_order` would reject.

## 10. Truck Schedules & Deliveries

- ~20 truck schedules, only for orders in `At Store`, `Out for Delivery`, or `Delivered` status (orders still `Pending`/`In Transit` haven't reached truck scheduling yet).
- Roster rules respected in the baseline data: no driver/assistant double-booked, no one over their weekly hour cap. **This baseline must pass validation cleanly** — if you need a rule-violation scenario for testing, construct it in a disposable test, not in the shared seed.
- One `deliveries` row per truck schedule tied to a `Delivered`/`Out for Delivery` order; `Delivered` orders' deliveries are `status: Completed` with a `delivered_at` timestamp before "now".

## 11. Store Inventory & Transactions

- Derived, not hand-entered: for every `train_bookings` row tied to a trip with `status = Arrived`, generate a matching `inventory_transactions` row (`transaction_type = receive`) and roll it into `store_inventory.quantity_on_hand`.
- For every completed delivery, generate a matching `dispatch` transaction reducing `quantity_on_hand`.
- End state: every store should have a **non-trivial, non-zero** stock level across most products — this is what Member 4 tests the Inventory page against, and what the Dashboard's low-stock alert logic needs at least one deliberately-low row to display (seed one product per store at quantity ≤ 5 to guarantee the low-stock alert has something to show).

## 12. Test Role Accounts — 4 rows (development only)

One login per non-admin role so role scoping can be tested. Each is a `users` row plus a `user_profiles` row linked to a seeded employee (`display_name_override` stays NULL).

| user_id | email | app_role | employee_id |
|---|---|---|---|
| `00000000-0000-0000-0000-000000000002` | `logistics@kandypack.lk` | logistics_manager | 1 |
| `00000000-0000-0000-0000-000000000003` | `clerk@kandypack.lk` | order_entry_clerk | 3 |
| `00000000-0000-0000-0000-000000000004` | `store.colombo@kandypack.lk` | store_manager | 6 (Colombo, store 1) |
| `00000000-0000-0000-0000-000000000005` | `fleet@kandypack.lk` | fleet_supervisor | 12 |

- All four share the password in the `SEED_TEST_PASSWORD` environment variable. There is **no default**: if it is unset, the accounts are skipped with a warning.
- The accounts are never created when `NODE_ENV=production`.

---

## Ground Rules

- This spec is the single source of truth for IDs 1–N in every table. If your feature needs additional rows, **append** with higher IDs — never renumber or delete baseline rows, or you'll break someone else's tests.
- Anyone adding to the shared seed script does so via Member 1 (per the migration-ownership rule in `workload-division.md`), same as any other schema/seed change.
- Re-running the seed script is idempotent by **inserting only rows whose primary key is missing**. `DELETE`/`TRUNCATE` are blocked by the hard-delete triggers and foreign keys, `INSERT IGNORE` would hide constraint violations, and `ON DUPLICATE KEY UPDATE` would write an audit row on every run. Existing rows are never modified.
- Master data, train trips and test accounts are inserted in one transaction as the bootstrap admin (so `audit_log.user_id` is set); any failure rolls the whole stage back.
- Use `npx tsx scripts/seed.ts --dry-run` to execute every insert against the database and then roll back, before running against the shared dev DB. The dry run requires the bootstrap admin to exist already.
