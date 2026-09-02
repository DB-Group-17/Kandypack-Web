# Kandypack — Seed Data Specification

> Status: Active
> Authority: Supporting
> Primary source: `Docs/04_database-schema-v4.md`
> Last reviewed: 2026-08-25

Defines the **exact** baseline dataset every member develops and tests against. Nobody invents their own test rows — if you need more data for a specific test, add it in your own migration/seed increment on top of this, never by editing the shared baseline.

Meets the project minimums: 40+ orders, 10+ routes, valid train schedule with defined capacities.

All dates below are **relative to seed run time** (`CURDATE()` / `NOW()`), not fixed dates, so the dataset stays valid (e.g. still respects the 7-day order rule) no matter when someone runs the seed script.

Execution mechanism: Baseline and bootstrap seed data are decoupled from schema migrations and executed via `npm run db:seed` (`scripts/seed.ts`).

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

| product_id | product_name | category | unit_of_measure | unit_price | space_rate |
|---|---|---|---|---|---|
| 1 | Detergent Powder 1kg | Household | box | 450.00 | 0.50 |
| 2 | Dish Soap 500ml | Household | bottle | 180.00 | 0.20 |
| 3 | Biscuits Family Pack | Food | pack | 220.00 | 0.15 |
| 4 | Instant Noodles Box (24) | Food | box | 1200.00 | 0.80 |
| 5 | Tea Powder 400g | Food | pack | 350.00 | 0.10 |
| 6 | Coconut Oil 1L | Food | bottle | 650.00 | 0.30 |
| 7 | Rice 5kg Bag | Food | bag | 900.00 | 1.00 |
| 8 | Toothpaste 100g | Personal Care | tube | 210.00 | 0.05 |
| 9 | Soft Drink Crate (24) | Beverages | crate | 1800.00 | 1.50 |
| 10 | Baby Diapers Pack | Personal Care | pack | 950.00 | 0.40 |
| 11 | Canned Fish 425g Case (24) | Food | case | 2400.00 | 0.90 |
| 12 | Shampoo 400ml | Personal Care | bottle | 480.00 | 0.15 |

*Space rates deliberately span 0.05–1.50 so capacity-overflow test scenarios (see §8) are easy to construct.*

## 4. Customers — 24 rows (`customer_id` 1–24), 4 per destination city (2 retail + 2 wholesale)

Pattern per city (repeat for Colombo, Negombo, Galle, Matara, Jaffna, Trincomalee):
- `{City} Retail Mart` — customer_type: retail
- `{City} Family Store` — customer_type: retail
- `{City} Wholesale Distributors` — customer_type: wholesale
- `{City} Trading Co.` — customer_type: wholesale

Each with a realistic phone (`07XXXXXXXX`), `registered_city_id` matching their city, and a plausible local address.

## 5. Routes — 12 rows (`route_id` 1–12), 2 per city

Pattern per city: two routes per store covering different local areas, e.g. for Colombo (`store_id 1`):
- `Colombo North Route` — coverage areas: Colombo 1–7, `max_delivery_time_hours = 4`
- `Colombo South Route` — coverage areas: Colombo 8–15, Dehiwala, Mount Lavinia, `max_delivery_time_hours = 5`

Repeat the same "North/South" or "City/Suburb" split pattern for all 6 cities → 12 routes total, each with 2–4 `route_coverage_areas` rows.

## 6. Employees — 31 rows + 1 bootstrap admin

| Role | Count | Notes |
|---|---|---|
| system_administrator | 1 | Seeded separately as the bootstrap admin (see §9), not part of the 31 |
| logistics_manager | 2 | Not store-bound |
| order_entry_clerk | 3 | Not store-bound |
| store_manager | 6 | One per store, `home_store_id` set accordingly |
| fleet_supervisor | 3 | Not store-bound |
| driver | 8 | `home_store_id` distributed roughly evenly across the 6 stores |
| assistant | 8 | Same distribution as drivers |

Every `driver`/`assistant` employee row also gets a matching row in `drivers`/`assistants` (license number/expiry for drivers — use a future expiry date, e.g. +18 months from seed time).

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

---

## Ground Rules

- This spec is the single source of truth for IDs 1–N in every table. If your feature needs additional rows, **append** with higher IDs — never renumber or delete baseline rows, or you'll break someone else's tests.
- Anyone adding to the shared seed script does so via Member 1 (per the migration-ownership rule in `workload-division.md`), same as any other schema/seed change.
- Re-running the seed script should be idempotent (truncate-and-reinsert or `ON DUPLICATE KEY` guards) so everyone can reset to a known state at any time.
