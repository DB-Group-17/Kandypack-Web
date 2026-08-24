# Kandypack Database Schema — Design & Implementation (v3.0)

**Platform:** Supabase (PostgreSQL 15/16) · **App layer:** Next.js

---

## Changelog: v2 → v3

The following changes were made in this version based on a formal normalization review and correctness audit of v2. Every change is traced to the specific finding that motivated it.

**3NF fixes**

1. `truck_schedules.store_id` removed. This column was transitively determined by `route_id` via `routes.store_id` — a textbook 3NF violation with no snapshot justification. Every read of `truck_schedules.store_id` is now replaced by a join through `route_id → routes.store_id`. The `schedule_truck_delivery()` procedure already proved the redundancy by reading `store_id` from `routes` and then immediately copying it into the insert — that copy step is now gone entirely. Affected: §5.7 (DDL), §9.2 (`schedule_truck_delivery()`), §11 Report 3 view join, §17.4 data-flow table.

2. `user_profiles.full_name` removed. This column was a live, unsynced duplicate of `employees.full_name`, transitively determined through `employee_id`. No trigger kept them aligned, so any correction to an employee's name in `employees` would silently leave `user_profiles` stale. All five `app_role` values correspond to internal staff roles, so `employee_id` is effectively always populated. Display names are now always sourced via a join to `employees`. A `CHECK` constraint ensures `full_name` cannot be supplied when `employee_id` is also present — covering the edge case of a login with no employee record. Affected: §5.2 (DDL), §10.2 `current_app_role()` helper note.

3. `orders.route_id` retained, now formally documented as an intentional point-in-time snapshot. The column is derivable from `(destination_city_id, delivery_area)` via the unique index on `route_coverage_areas`, which is a technical 3NF violation. However, this follows exactly the same pattern as `order_items.unit_price_at_order` and `space_rate_at_order`: if `route_coverage_areas` is later re-zoned, old orders must continue to reference the route they actually shipped on rather than silently resolving to whatever covers that zone today. The violation is accepted on purpose and is now formally documented alongside the other intentional snapshots in §1 and §12.

**Referential integrity fix**

4. `inventory_transactions.reference_table` and `reference_id` replaced with two typed, nullable FK columns: `train_booking_id` (references `train_bookings`) and `delivery_id` (references `deliveries`). A `CHECK` constraint enforces that exactly one is non-null, matching the transaction type. This restores real referential integrity — the previous polymorphic text-column pattern made it impossible for Postgres to enforce that `reference_id` pointed at anything real. The old `idx_inventory_txn_reference` index is replaced by two specific FK indexes. Affected: §5.6 (DDL), §6 (index summary), §9.2 `receive_goods_at_store()`, new `complete_delivery()` dispatch logic.

**Functional correctness fix (highest priority)**

5. Inventory dispatch added to `complete_delivery()`. In v2, `store_inventory.quantity_on_hand` only ever increased — goods arriving via `receive_goods_at_store()` incremented it, but nothing decremented it when goods left on a truck. This meant stock levels were simply wrong: a store would appear to have unlimited stock as the same goods were received and dispatched repeatedly. `complete_delivery()` now inserts one `inventory_transactions` row per order item, with a negative `change_qty`, using the new `delivery_id` FK column. `trg_check_inventory_before_dispatch` and `trg_apply_inventory_transaction` handle the stock-level check and decrement automatically. Affected: §9.2 `complete_delivery()`, §17.4 data-flow table.

**Subtype integrity fix**

6. Triggers added to enforce that `employees.employee_type` matches the subtype table being inserted into. In v2 nothing prevented a `drivers` row pointing at a `store_manager` employee, or an `employee_type` being changed away from `driver` while a `drivers` row still existed. Two new triggers close this gap: `trg_validate_driver_subtype` on INSERT to `drivers`, and `trg_validate_assistant_subtype` on INSERT to `assistants`, each checking the linked employee's type. Two additional triggers on UPDATE to `employees` block changing `employee_type` away from `driver`/`assistant` while a subtype row exists. Affected: §8 (new §8.6).

**Audit coverage fix**

7. `trg_audit_row` now attached to `stores` and `employees`. These two master-data tables were the only ones among the eight soft-deletable tables not covered by the audit trigger in v2. A change to `employees.full_name` or `employees.home_store_id` left no audit trail. Both are now audited identically to the other six. Affected: §8.5.

**Deliveries uniqueness fix**

8. Partial unique index added to `deliveries` on `(order_id)` where `status IN ('Scheduled','In Progress')`. This prevents two simultaneously active delivery attempts for the same order while still allowing re-delivery after a `Failed` or `Completed` row exists. Affected: §5.7 (DDL).

**What did not change**

The following items from the review were evaluated and deliberately left unchanged:

- The duplicate 7-day rule (CHECK constraint + trigger): this is standard defense-in-depth, not a bug. The trigger exists to produce the user-friendly error message required by REQ-NF-007; the CHECK is a database-level backstop. Both are correct and intentional.
- The trigger-maintained caches (`orders.total_value`, `orders.total_space_required`, `train_trips.booked_space`, `store_inventory.quantity_on_hand`, `order_items.line_value`, `order_items.line_space`): legitimate, trigger-controlled denormalization, unchanged.
- Lock-scope scalability in `trg_validate_truck_schedule`: acknowledged backlog item, low risk at current scale, not changed.
- Missing `train_trips.origin_city_id`: the domain-decisions table explicitly scopes v1 to a single Kandy origin; this is a stated assumption, not an oversight.

---

## 0. How to use this document

Every SQL block below is meant to be run **in order** (the numbering in the section headers is the intended file/run order). Copy each block into a Supabase SQL Editor migration, or save them as `01_master.sql`, `02_people.sql`, … and run with `psql` / the Supabase CLI migration runner. Section 16 has a one-paragraph deployment checklist for the two Supabase-specific hookups (`auth.users`, `auth.uid()`) you'll need before this works outside the test harness used here. If you just want to know "what happens in the database when a user does X," skip straight to §17 — it walks through every major task and lists exactly which tables get read and written, with a worked example for each.

---

## 1. Recap of the domain decisions this design is built on

| # | Question | Decision |
|---|---|---|
| 1 | Can an order span multiple destination cities? | No — exactly one destination city per order. |
| 2 | Overflow splitting | An order can split across **more than one** future train trip, not just the "next" one. |
| 3 | Can a route span multiple cities? | Yes — a route's *origin* is always one store/city, but its *coverage* can include named zones in a neighbouring city that has no rail service of its own. |
| 4 | Driver/assistant data model | One shared `employees` table for common fields; `drivers` and `assistants` are separate subtype tables (1-to-1 with `employees`) because only those two roles carry roster rules. |
| 5 | Item-level trip tracking | Yes — `train_booking_items` records exactly which order items (and what quantity) travelled on which trip. |
| 6 | Stores per city | Exactly one store per destination city (enforced with a `UNIQUE` constraint). |
| 7 | "Consecutive" definition for assistants | Same 2-hour gap rule as drivers. |
| 8 | Week boundary | Monday 00:00 to Sunday 23:59 (ISO week; `date_trunc('week', …)` in Postgres is already Monday-based). |
| 9 | RLS | Included, for the 5 SRS user classes (§2.3 of the SRS). |
| 10 | Delete strategy | **Soft delete** (`is_deleted`/`deleted_at`) for master data (customers, products, stores, employees, drivers, assistants, trucks, routes). **Hard delete + `ON DELETE CASCADE`** only for `order_items` relative to `orders`. **`RESTRICT`** (Postgres default) everywhere else. Orders themselves are never deleted — cancellation is a `status` value. |
| 11 | `orders.route_id` snapshot | **Intentional 3NF trade-off.** `route_id` is technically derivable from `(destination_city_id, delivery_area)` via `route_coverage_areas`, which is a transitive dependency. It is retained as a point-in-time snapshot for the same reason `order_items` snapshots `unit_price_at_order` and `space_rate_at_order`: if route coverage zones are re-mapped later, historical orders must keep pointing at the route they actually shipped on. This is accepted knowingly and documented here, not an oversight. |

---

## 2. Entity-by-entity rationale

### Identity & reference data
- **`cities`** — Normalises Kandy (rail origin) and the six destination cities so every other table references an ID instead of repeating a spelled city name.
- **`customers`** — Wholesale/retail buyers. Soft-deleted so historical orders and reports remain intact.
- **`products`** — The FMCG catalogue. Carries the *current* `unit_price`/`space_rate`; `order_items` snapshots these at order time.
- **`stores`** — One per destination city (`UNIQUE(city_id)`), the physical warehouse next to each railway station.

### People
- **`employees`** — Shared HR fields for every staff member. `employee_type` classifies them.
- **`drivers` / `assistants`** — One row per employee of the matching type. Subject to roster rules. Subtype integrity enforced by trigger (§8.6 — new in v3).
- **`trucks`** — The delivery fleet.
- **`user_profiles`** — Maps Supabase `auth.users` to a business role and (always in practice) an employee record. `full_name` column removed in v3 — always sourced via join to `employees` to eliminate the unsynced duplicate.

### Routes
- **`routes`** — A predefined last-mile path from one store. `max_delivery_time_hours` computes a truck schedule's `end_time`.
- **`route_coverage_areas`** — Named delivery zones a route serves, potentially spanning more than one city.

### Rail & cargo
- **`train_trips`** — One scheduled rail trip to one city. `booked_space` maintained by trigger.
- **`train_bookings`** — Cargo-space reservation on one trip for one order (or part of one).
- **`train_booking_items`** — Item-level detail: which order line went on which trip in what quantity.

### Orders
- **`orders`** — One customer order. `route_id` is a snapshot of the route at order time (see §1 decision 11). `total_value`/`total_space_required` are denormalised summaries maintained by trigger.
- **`order_items`** — One product line per order. Price and space-rate snapshotted at insert time.
- **`order_status_history`** — Every status transition, logged automatically by trigger.

### Store & inventory
- **`store_inventory`** — Current stock per (store, product). A trigger-maintained cache, now correctly decremented by truck dispatch (v3 fix).
- **`inventory_transactions`** — Append-only ledger with typed FK columns `train_booking_id` and `delivery_id` replacing the previous polymorphic `reference_table`/`reference_id` pair (v3 fix). Real referential integrity now enforced.

### Fleet & delivery
- **`truck_schedules`** — One truck+driver+assistant assignment to one route. `store_id` removed in v3 — derived via `route_id → routes.store_id`. All roster rules enforced by trigger.
- **`deliveries`** — Links an order to its truck schedule. Partial unique index added in v3 to prevent duplicate active deliveries.

### Audit
- **`audit_log`** — Before/after image of every relevant change. Now covers all eight master-data tables including `stores` and `employees` (v3 fix).

---

## 3. Relationship summary (text ERD)

```
cities ──< stores ──< routes ──< route_coverage_areas
                 │        │
                 │        └──< truck_schedules >── drivers / assistants / trucks
                 │                    │               (store resolved via routes.store_id — no stored FK)
                 │                    └──< deliveries >── orders
                 │
customers ──< orders ──< order_items ──< train_booking_items >── train_bookings >── train_trips
                 │  │                                                                     │
                 │  └──< order_status_history                              (destination_city_id → cities)
                 │
                 └── delivery routed via delivery_area → route_coverage_areas → routes (snapshot in orders.route_id)

employees ──< drivers          (subtype integrity enforced by trigger in v3)
employees ──< assistants       (subtype integrity enforced by trigger in v3)
employees ── user_profiles (0/1, via employee_id; full_name removed from user_profiles in v3)

stores ──< store_inventory >── products
stores ──< inventory_transactions >── products
inventory_transactions.train_booking_id → train_bookings  (typed FK, replaces polymorphic pair — v3)
inventory_transactions.delivery_id      → deliveries      (typed FK, replaces polymorphic pair — v3)
```

---

## 4. Conventions used throughout

- **Surrogate keys:** `bigint generated always as identity` everywhere.
- **Timestamps:** `timestamptz` for points in time; plain `date` for calendar-date business fields.
- **Money:** `numeric(12,2)` / `numeric(14,2)` — never `float`.
- **Space units:** `numeric(10,2)`/`numeric(10,4)` for fractional space rates.
- **Status fields:** `text` + `CHECK (... in (...))` rather than Postgres `ENUM`.
- **`citext`** for columns matched case-insensitively: emails, `delivery_area`/`area_name`.
- **Soft delete columns** (`is_deleted`, `deleted_at`) on the 8 master-data tables only.

---

## 5. Full DDL

### 5.1 Extensions, cities, customers, products, stores

```sql
-- =========================================================
-- 01_master.sql
-- =========================================================
create extension if not exists citext;
create extension if not exists pgcrypto;

create table cities (
    city_id        bigint generated always as identity primary key,
    city_name      citext not null unique,
    is_origin      boolean not null default false,
    is_destination boolean not null default false,
    created_at     timestamptz not null default now()
);

comment on table cities is 'Lookup of Kandy (rail origin) and the six destination cities.';

create table customers (
    customer_id        bigint generated always as identity primary key,
    customer_name      text not null,
    customer_type      text not null default 'retail' check (customer_type in ('retail','wholesale')),
    phone              text not null,
    email              citext,
    registered_city_id bigint references cities(city_id),
    address_line       text,
    is_deleted         boolean not null default false,
    deleted_at         timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

comment on table customers is 'Master data for wholesale/retail customers. Soft-deleted so historical orders and reports remain intact.';

create table products (
    product_id      bigint generated always as identity primary key,
    sku             text not null unique,
    product_name    text not null,
    category        text,
    unit_of_measure text not null default 'unit',
    unit_price      numeric(12,2) not null check (unit_price >= 0),
    space_rate      numeric(10,4) not null check (space_rate > 0),
    is_deleted      boolean not null default false,
    deleted_at      timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table products is 'FMCG product catalogue. unit_price and space_rate are current values; order_items snapshots them at order time.';
comment on column products.space_rate is 'Train cargo space units consumed per 1 unit of this product. 1 space unit = one standard 50kg sack of rice.';

create table stores (
    store_id             bigint generated always as identity primary key,
    city_id              bigint not null unique references cities(city_id),
    store_name           text not null,
    railway_station_name text,
    address_line         text,
    contact_phone        text,
    is_deleted           boolean not null default false,
    deleted_at           timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table stores is 'City-based warehouse next to the railway station. UNIQUE(city_id) enforces exactly one store per city.';
```

### 5.2 Employees, drivers, assistants, trucks, user_profiles

```sql
-- =========================================================
-- 02_people.sql
-- v3 change: user_profiles.full_name removed (3NF fix).
-- v3 change: CHECK on user_profiles prevents full_name being
--            supplied when employee_id is present.
-- =========================================================

create table employees (
    employee_id   bigint generated always as identity primary key,
    full_name     text not null,
    nic_number    text not null unique,
    phone         text not null,
    email         citext,
    hire_date     date not null default current_date,
    employee_type text not null check (employee_type in
                      ('driver','assistant','store_manager','logistics_manager',
                       'fleet_supervisor','order_entry_clerk','system_administrator')),
    home_store_id bigint references stores(store_id),
    is_deleted    boolean not null default false,
    deleted_at    timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table employees is 'Common fields for every staff member. Subtype integrity (employee_type matching drivers/assistants rows) enforced by triggers in section 8.6.';

create table drivers (
    driver_id      bigint generated always as identity primary key,
    employee_id    bigint not null unique references employees(employee_id),
    license_number text not null unique,
    license_expiry date,
    is_deleted     boolean not null default false,
    deleted_at     timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

comment on table drivers is 'Driver-specific attributes. One row per employee whose employee_type = driver. INSERT trigger enforces the type match.';

create table assistants (
    assistant_id bigint generated always as identity primary key,
    employee_id  bigint not null unique references employees(employee_id),
    is_deleted   boolean not null default false,
    deleted_at   timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table assistants is 'Assistant-specific attributes. One row per employee whose employee_type = assistant. INSERT trigger enforces the type match.';

create table trucks (
    truck_id      bigint generated always as identity primary key,
    plate_number  text not null unique,
    capacity_kg   numeric(10,2),
    home_store_id bigint references stores(store_id),
    is_deleted    boolean not null default false,
    deleted_at    timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table trucks is 'Delivery fleet.';

-- ---------------------------------------------------------
-- user_profiles: maps Supabase auth.users -> employee + role
-- v3: full_name column removed. Names are always sourced via
--     join to employees.full_name so there is no unsynced
--     duplicate. A CHECK prevents supplying full_name when
--     employee_id is present, and requires full_name only
--     when employee_id IS NULL (the rare case of an
--     administrative login with no employee record).
-- ---------------------------------------------------------
create table user_profiles (
    user_id     uuid primary key,  -- references auth.users(id) on live Supabase project
    employee_id bigint unique references employees(employee_id),
    app_role    text not null check (app_role in
                    ('logistics_manager','order_entry_clerk','store_manager',
                     'fleet_supervisor','system_administrator')),
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    -- full_name removed: always join to employees.full_name
    -- The constraint below keeps the table self-consistent:
    -- if employee_id is null (no linked employee) a display
    -- name must be stored separately; if employee_id is set
    -- the name comes from employees.
    display_name_override text,
    check (
        (employee_id is not null and display_name_override is null)
        or
        (employee_id is null and display_name_override is not null)
    )
);

comment on table user_profiles is 'One row per login account. app_role drives all RLS policies. employee_id links to the HR record; display_name_override is only populated when no employee record exists (should be rare for internal staff roles).';
```

### 5.3 Routes and coverage areas

```sql
-- =========================================================
-- 03_routes.sql
-- =========================================================

create table routes (
    route_id                bigint generated always as identity primary key,
    store_id                bigint not null references stores(store_id),
    route_name              text not null,
    coverage_description    text,
    max_delivery_time_hours numeric(4,2) not null check (max_delivery_time_hours > 0),
    is_deleted              boolean not null default false,
    deleted_at              timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

comment on table routes is 'A predefined last-mile delivery path from one origin store. Coverage areas live in route_coverage_areas.';

create table route_coverage_areas (
    coverage_id bigint generated always as identity primary key,
    route_id    bigint not null references routes(route_id) on delete cascade,
    city_id     bigint not null references cities(city_id),
    area_name   citext not null,
    created_at  timestamptz not null default now()
);

comment on table route_coverage_areas is 'Named delivery zones a route serves. A route may cover zones in more than one city.';

create unique index uq_coverage_area_per_city
    on route_coverage_areas (city_id, area_name);
```

### 5.4 Orders domain

```sql
-- =========================================================
-- 04_orders.sql
-- =========================================================

create table orders (
    order_id               bigint generated always as identity primary key,
    customer_id            bigint not null references customers(customer_id),
    delivery_address       text not null,
    delivery_area          citext not null,
    destination_city_id    bigint not null references cities(city_id),
    route_id               bigint references routes(route_id),
    -- route_id is an intentional point-in-time snapshot (see §1 decision 11).
    -- It is the route that covered this delivery_area at the time the order was placed.
    -- If route coverage zones are re-mapped later, historical orders retain the original
    -- route. This follows the same snapshot pattern as order_items.unit_price_at_order.
    order_placed_at        timestamptz not null default now(),
    expected_delivery_date date not null,
    status                 text not null default 'Pending'
                               check (status in
                                   ('Pending','In Transit','At Store','Out for Delivery','Delivered','Cancelled')),
    total_value            numeric(14,2) not null default 0 check (total_value >= 0),
    total_space_required   numeric(10,2) not null default 0 check (total_space_required >= 0),
    created_by             uuid references user_profiles(user_id),
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    check (expected_delivery_date >= (order_placed_at::date + 7))
);

comment on table orders is 'One customer order. total_value/total_space_required are denormalised summaries maintained by trigger. route_id is a snapshot of the route at order time, not a live FK to the current zone mapping.';

create index idx_orders_customer       on orders (customer_id);
create index idx_orders_status         on orders (status);
create index idx_orders_expected_delivery on orders (expected_delivery_date);
create index idx_orders_city_placed    on orders (destination_city_id, order_placed_at);

create table order_items (
    order_item_id       bigint generated always as identity primary key,
    order_id            bigint not null references orders(order_id) on delete cascade,
    product_id          bigint not null references products(product_id),
    quantity            numeric(10,2) not null check (quantity > 0),
    unit_price_at_order numeric(12,2) not null check (unit_price_at_order >= 0),
    space_rate_at_order numeric(10,4) not null check (space_rate_at_order > 0),
    line_space          numeric(10,2) generated always as (quantity * space_rate_at_order) stored,
    line_value          numeric(14,2) generated always as (quantity * unit_price_at_order) stored
);

comment on table order_items is 'One product line per order. Prices and space rates are snapshotted at insert time. ON DELETE CASCADE is the only cascade in the schema.';

create index idx_order_items_order   on order_items (order_id);
create index idx_order_items_product on order_items (product_id);

create table order_status_history (
    history_id bigint generated always as identity primary key,
    order_id   bigint not null references orders(order_id),
    old_status text,
    new_status text not null,
    changed_at timestamptz not null default now(),
    changed_by uuid references user_profiles(user_id),
    notes      text
);

comment on table order_status_history is 'Full audit trail of every order status transition, populated by trigger.';

create index idx_order_status_history_order on order_status_history (order_id);
```

### 5.5 Train domain

```sql
-- =========================================================
-- 05_train.sql
-- =========================================================

create table train_trips (
    trip_id             bigint generated always as identity primary key,
    destination_city_id bigint not null references cities(city_id),
    departure_datetime  timestamptz not null,
    arrival_datetime    timestamptz not null,
    total_capacity      numeric(10,2) not null check (total_capacity > 0),
    booked_space        numeric(10,2) not null default 0 check (booked_space >= 0),
    status              text not null default 'Scheduled'
                            check (status in ('Scheduled','Departed','Arrived','Cancelled')),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    check (arrival_datetime > departure_datetime),
    check (booked_space <= total_capacity)
);

comment on table train_trips is 'One scheduled Sri Lanka Railways trip from Kandy to a destination city. booked_space maintained by trigger. Origin is always Kandy (v1 assumption).';

create index idx_train_trips_dest_departure on train_trips (destination_city_id, departure_datetime);

create table train_bookings (
    booking_id   bigint generated always as identity primary key,
    trip_id      bigint not null references train_trips(trip_id),
    order_id     bigint not null references orders(order_id),
    space_booked numeric(10,2) not null check (space_booked > 0),
    booked_at    timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

comment on table train_bookings is 'Cargo-space reservation on one trip for one order (or part of one, if the order overflows across trips).';

create index idx_train_bookings_trip  on train_bookings (trip_id);
create index idx_train_bookings_order on train_bookings (order_id);

create table train_booking_items (
    booking_item_id  bigint generated always as identity primary key,
    booking_id       bigint not null references train_bookings(booking_id) on delete cascade,
    order_item_id    bigint not null references order_items(order_item_id),
    quantity_shipped numeric(10,2) not null check (quantity_shipped > 0),
    space_consumed   numeric(10,2) not null check (space_consumed > 0)
);

comment on table train_booking_items is 'Item-level detail: which order items went on which trip in what quantity.';

create index idx_booking_items_booking    on train_booking_items (booking_id);
create index idx_booking_items_order_item on train_booking_items (order_item_id);
```

### 5.6 Store inventory

```sql
-- =========================================================
-- 06_inventory.sql
-- v3 change: reference_table / reference_id replaced with
--   typed nullable FK columns train_booking_id and delivery_id
--   so real referential integrity can be enforced.
--   A CHECK ensures exactly one FK is populated per row,
--   matching the transaction_type.
--   The old idx_inventory_txn_reference index is replaced
--   by two specific FK indexes.
-- =========================================================

create table store_inventory (
    inventory_id     bigint generated always as identity primary key,
    store_id         bigint not null references stores(store_id),
    product_id       bigint not null references products(product_id),
    quantity_on_hand numeric(12,2) not null default 0 check (quantity_on_hand >= 0),
    updated_at       timestamptz not null default now(),
    unique (store_id, product_id)
);

comment on table store_inventory is 'Current running stock per (store, product). Incremented by receive_goods_at_store() and decremented by complete_delivery() via inventory_transactions. Trigger-maintained cache of inventory_transactions.';

create index idx_store_inventory_store on store_inventory (store_id);

create table inventory_transactions (
    transaction_id   bigint generated always as identity primary key,
    store_id         bigint not null references stores(store_id),
    product_id       bigint not null references products(product_id),
    change_qty       numeric(12,2) not null,  -- positive = receive, negative = dispatch/adjustment-down
    transaction_type text not null check (transaction_type in ('receive','dispatch','adjustment')),
    -- v3: typed FK columns replace the polymorphic reference_table/reference_id pair.
    -- Exactly one must be non-null (enforced by CHECK below), matching the type:
    --   receive   -> train_booking_id must be set
    --   dispatch  -> delivery_id must be set
    --   adjustment -> both null (manual correction)
    train_booking_id bigint references train_bookings(booking_id),
    delivery_id      bigint references deliveries(delivery_id),
    check (
        (transaction_type = 'receive'    and train_booking_id is not null and delivery_id is null)
        or
        (transaction_type = 'dispatch'   and delivery_id is not null and train_booking_id is null)
        or
        (transaction_type = 'adjustment' and train_booking_id is null and delivery_id is null)
    ),
    created_by  uuid references user_profiles(user_id),
    created_at  timestamptz not null default now()
);

comment on table inventory_transactions is 'Append-only ledger of every stock movement. train_booking_id and delivery_id are typed FKs (v3) replacing the previous polymorphic reference_table/reference_id columns, restoring real referential integrity.';

create index idx_inventory_txn_store_product  on inventory_transactions (store_id, product_id);
create index idx_inventory_txn_booking        on inventory_transactions (train_booking_id);
create index idx_inventory_txn_delivery       on inventory_transactions (delivery_id);
```

### 5.7 Fleet & delivery

```sql
-- =========================================================
-- 07_fleet.sql
-- v3 change: store_id removed from truck_schedules.
--   It was transitively determined by route_id via
--   routes.store_id (3NF violation). Every read now joins
--   through route_id -> routes.store_id instead.
-- v3 change: partial unique index added to deliveries
--   to prevent two simultaneously active delivery attempts
--   for the same order.
-- =========================================================

create table truck_schedules (
    schedule_id  bigint generated always as identity primary key,
    truck_id     bigint not null references trucks(truck_id),
    driver_id    bigint not null references drivers(driver_id),
    assistant_id bigint not null references assistants(assistant_id),
    route_id     bigint not null references routes(route_id),
    -- store_id removed in v3: derive via route_id -> routes.store_id
    start_time   timestamptz not null,
    end_time     timestamptz not null,
    status       text not null default 'Scheduled'
                     check (status in ('Scheduled','In Progress','Completed','Cancelled')),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    check (end_time > start_time),
    check (start_time >= (start_time::date + time '06:00')
           and end_time   <= (start_time::date + time '20:00'))
);

comment on table truck_schedules is 'One truck+driver+assistant assignment to one route for one time slot. store_id removed in v3 (3NF fix) — use routes.store_id via route_id. All roster rules enforced by trg_validate_truck_schedule.';

create index idx_truck_schedules_truck_time     on truck_schedules (truck_id, start_time, end_time);
create index idx_truck_schedules_driver_time    on truck_schedules (driver_id, start_time, end_time);
create index idx_truck_schedules_assistant_time on truck_schedules (assistant_id, start_time, end_time);
create index idx_truck_schedules_start_end      on truck_schedules (start_time, end_time);

create table deliveries (
    delivery_id       bigint generated always as identity primary key,
    order_id          bigint not null references orders(order_id),
    truck_schedule_id bigint not null references truck_schedules(schedule_id),
    status            text not null default 'Scheduled'
                          check (status in ('Scheduled','In Progress','Completed','Failed')),
    delivered_at      timestamptz,
    notes             text,
    exception_reason  text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

comment on table deliveries is 'Links one order to the truck_schedule carrying it. trg_delivery_complete_order cascades Completed status to the parent order. inventory_transactions.delivery_id FK introduced in v3 enables the dispatch stock decrement.';

create index idx_deliveries_order    on deliveries (order_id);
create index idx_deliveries_schedule on deliveries (truck_schedule_id);

-- v3: prevent two simultaneously active delivery attempts for the same order.
-- Allows re-delivery (a new row) after a Failed or Completed row exists.
create unique index uq_deliveries_active_per_order
    on deliveries (order_id)
    where status in ('Scheduled','In Progress');
```

### 5.8 Audit log

```sql
-- =========================================================
-- 08_audit.sql
-- =========================================================

create table audit_log (
    log_id     bigint generated always as identity primary key,
    table_name text not null,
    record_id  bigint,
    action     text not null check (action in ('INSERT','UPDATE','DELETE')),
    user_id    uuid references user_profiles(user_id),
    old_data   jsonb,
    new_data   jsonb,
    created_at timestamptz not null default now()
);

comment on table audit_log is 'Row-change log (REQ-NF-012). Populated by trg_audit_row on all eight master-data tables (now including stores and employees, fixed in v3) plus transactional tables.';

create index idx_audit_log_table_record on audit_log (table_name, record_id);
create index idx_audit_log_created_at   on audit_log (created_at);
```

---

## 6. Indexing summary

| Index | Why |
|---|---|
| `idx_train_trips_dest_departure (destination_city_id, departure_datetime)` | `get_next_available_trip()` filters by exactly these two columns. |
| `idx_orders_status`, `idx_orders_expected_delivery`, `idx_orders_city_placed` | Order-list screens filter by status; report/7-day checks filter by date; Report 3 groups by city. |
| `idx_truck_schedules_truck_time` / `_driver_time` / `_assistant_time` | Overlap checks in `trg_validate_truck_schedule` hit these on every INSERT. |
| `uq_coverage_area_per_city` (unique) | Route lookup by `(city_id, area_name)` in `place_order()` — both a performance index and the uniqueness constraint that makes matching unambiguous. |
| `idx_store_inventory_store` | Store Inventory screen filtered by store. |
| `idx_inventory_txn_store_product` | Stock movement history by store+product. |
| `idx_inventory_txn_booking` | Trace a receive transaction back to its train booking (v3 — replaces polymorphic index). |
| `idx_inventory_txn_delivery` | Trace a dispatch transaction back to its delivery (v3 — replaces polymorphic index). |
| `idx_audit_log_table_record`, `idx_audit_log_created_at` | Audit lookups by record or time range. |
| `uq_deliveries_active_per_order` (partial unique) | Prevents two simultaneously active deliveries for the same order (v3). |

---

## 7. Functions

```sql
-- =========================================================
-- 09_functions.sql
-- =========================================================

create or replace function fn_week_start(p_ts timestamptz)
returns timestamptz
language sql
immutable
as $$
    select date_trunc('week', p_ts);
$$;

comment on function fn_week_start is 'Returns the Monday 00:00 that begins the calendar week containing p_ts (ISO-8601, Monday-based).';

create or replace function calculate_order_space(p_order_id bigint)
returns numeric
language sql
stable
as $$
    select coalesce(sum(oi.quantity * oi.space_rate_at_order), 0)
    from order_items oi
    where oi.order_id = p_order_id;
$$;

comment on function calculate_order_space is 'REQ-FR-004: total space units for an order.';

create or replace function get_available_capacity(p_trip_id bigint)
returns numeric
language sql
stable
as $$
    select (total_capacity - booked_space)
    from train_trips
    where trip_id = p_trip_id;
$$;

comment on function get_available_capacity is 'REQ-FR-012: free space on a trip.';

create or replace function get_next_available_trip(
    p_city_id    bigint,
    p_after_date timestamptz,
    p_min_space  numeric default 0
)
returns table (trip_id bigint, departure_datetime timestamptz, available_space numeric)
language sql
stable
as $$
    select t.trip_id, t.departure_datetime, (t.total_capacity - t.booked_space) as available_space
    from train_trips t
    where t.destination_city_id = p_city_id
      and t.departure_datetime > p_after_date
      and t.status = 'Scheduled'
      and (t.total_capacity - t.booked_space) > p_min_space
    order by t.departure_datetime asc
    limit 1;
$$;

comment on function get_next_available_trip is 'REQ-FR-013: earliest Scheduled trip to a city with free space.';

create or replace function get_driver_weekly_hours(p_driver_id bigint, p_week_start timestamptz)
returns numeric
language sql
stable
as $$
    select coalesce(sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0), 0)
    from truck_schedules ts
    where ts.driver_id = p_driver_id
      and ts.status <> 'Cancelled'
      and ts.start_time >= fn_week_start(p_week_start)
      and ts.start_time <  fn_week_start(p_week_start) + interval '7 days';
$$;

comment on function get_driver_weekly_hours is 'Total scheduled hours for a driver in the ISO week containing p_week_start. Used to enforce the 40 hr limit (BR-006) and by Report 4.';

create or replace function get_assistant_weekly_hours(p_assistant_id bigint, p_week_start timestamptz)
returns numeric
language sql
stable
as $$
    select coalesce(sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0), 0)
    from truck_schedules ts
    where ts.assistant_id = p_assistant_id
      and ts.status <> 'Cancelled'
      and ts.start_time >= fn_week_start(p_week_start)
      and ts.start_time <  fn_week_start(p_week_start) + interval '7 days';
$$;

comment on function get_assistant_weekly_hours is 'Total scheduled hours for an assistant in the ISO week. Used to enforce the 60 hr limit (BR-007) and by Report 4.';

create or replace function fn_consecutive_chain_length(
    p_person_column text,
    p_person_id     bigint,
    p_new_start     timestamptz,
    p_new_end       timestamptz
)
returns int
language plpgsql
stable
as $$
declare
    v_chain        int := 1;
    v_cursor_start timestamptz := p_new_start;
    v_cursor_end   timestamptz := p_new_end;
    v_found        record;
    v_sql          text;
begin
    loop
        v_sql := format(
            'select start_time, end_time from truck_schedules
             where %I = $1 and status <> ''Cancelled''
               and end_time <= $2 and end_time > $2 - interval ''2 hours''
             order by end_time desc limit 1', p_person_column);
        execute v_sql into v_found using p_person_id, v_cursor_start;
        exit when v_found is null;
        v_chain := v_chain + 1;
        v_cursor_start := v_found.start_time;
    end loop;

    loop
        v_sql := format(
            'select start_time, end_time from truck_schedules
             where %I = $1 and status <> ''Cancelled''
               and start_time >= $2 and start_time < $2 + interval ''2 hours''
             order by start_time asc limit 1', p_person_column);
        execute v_sql into v_found using p_person_id, v_cursor_end;
        exit when v_found is null;
        v_chain := v_chain + 1;
        v_cursor_end := v_found.end_time;
    end loop;

    return v_chain;
end;
$$;

comment on function fn_consecutive_chain_length is 'Chain length of back-to-back (<2h gap) schedules if a new slot were added. Drivers: limit 1. Assistants: limit 2.';

-- ---------------------------------------------------------
-- Helper: resolve a user's display name (v3).
-- Replaces the stale user_profiles.full_name column.
-- Returns employees.full_name if employee_id is set,
-- otherwise returns display_name_override.
-- ---------------------------------------------------------
create or replace function get_user_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(e.full_name, up.display_name_override)
    from user_profiles up
    left join employees e on e.employee_id = up.employee_id
    where up.user_id = p_user_id;
$$;

comment on function get_user_display_name is 'v3: returns the display name for a login, sourced from employees.full_name (preferred) or user_profiles.display_name_override (fallback when no employee record exists). Replaces the removed user_profiles.full_name column.';
```

---

## 8. Triggers

### 8.1 Generic: `updated_at` stamping + hard-delete prevention

```sql
-- =========================================================
-- 10_trg_generic.sql
-- =========================================================

create or replace function trg_fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger trg_touch_updated_at before update on customers
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on products
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on stores
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on employees
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on drivers
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on assistants
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on trucks
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on routes
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on orders
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on train_trips
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on truck_schedules
    for each row execute function trg_fn_touch_updated_at();
create trigger trg_touch_updated_at before update on deliveries
    for each row execute function trg_fn_touch_updated_at();

create or replace function trg_fn_prevent_hard_delete()
returns trigger language plpgsql as $$
begin
    raise exception
        'Hard delete is not allowed on %. Set is_deleted = true, deleted_at = now() instead.',
        tg_table_name;
end;
$$;

create trigger trg_prevent_hard_delete before delete on customers
    for each row execute function trg_fn_prevent_hard_delete();
create trigger trg_prevent_hard_delete before delete on products
    for each row execute function trg_fn_prevent_hard_delete();
create trigger trg_prevent_hard_delete before delete on stores
    for each row execute function trg_fn_prevent_hard_delete();
create trigger trg_prevent_hard_delete before delete on employees
    for each row execute function trg_fn_prevent_hard_delete();
create trigger trg_prevent_hard_delete before delete on drivers
    for each row execute function trg_fn_prevent_hard_delete();
create trigger trg_prevent_hard_delete before delete on assistants
    for each row execute function trg_fn_prevent_hard_delete();
create trigger trg_prevent_hard_delete before delete on trucks
    for each row execute function trg_fn_prevent_hard_delete();
create trigger trg_prevent_hard_delete before delete on routes
    for each row execute function trg_fn_prevent_hard_delete();
```

### 8.2 Order date, price snapshot, order totals, status history, train capacity

```sql
-- =========================================================
-- 11_trg_orders_train.sql
-- =========================================================

create or replace function trg_fn_validate_order_date()
returns trigger language plpgsql as $$
begin
    if new.expected_delivery_date < (new.order_placed_at::date + 7) then
        raise exception
            'Order rejected: expected_delivery_date (%) must be at least 7 calendar days after the order date (%).',
            new.expected_delivery_date, new.order_placed_at::date;
    end if;
    return new;
end;
$$;

create trigger trg_validate_order_date
    before insert on orders
    for each row execute function trg_fn_validate_order_date();

create or replace function trg_fn_snapshot_order_item_prices()
returns trigger language plpgsql as $$
declare
    v_price numeric(12,2);
    v_space numeric(10,4);
begin
    select unit_price, space_rate into v_price, v_space
    from products where product_id = new.product_id;

    if v_price is null then
        raise exception 'Product % not found or has no price', new.product_id;
    end if;

    new.unit_price_at_order := coalesce(new.unit_price_at_order, v_price);
    new.space_rate_at_order := coalesce(new.space_rate_at_order, v_space);
    return new;
end;
$$;

create trigger trg_snapshot_order_item_prices
    before insert on order_items
    for each row execute function trg_fn_snapshot_order_item_prices();

create or replace function trg_fn_maintain_order_totals()
returns trigger language plpgsql as $$
declare
    v_order_id bigint := coalesce(new.order_id, old.order_id);
begin
    update orders
    set total_value          = (select coalesce(sum(line_value), 0) from order_items where order_id = v_order_id),
        total_space_required = (select coalesce(sum(line_space), 0) from order_items where order_id = v_order_id)
    where order_id = v_order_id;
    return null;
end;
$$;

create trigger trg_maintain_order_totals
    after insert or update or delete on order_items
    for each row execute function trg_fn_maintain_order_totals();

create or replace function trg_fn_log_order_status_change()
returns trigger language plpgsql as $$
begin
    if new.status is distinct from old.status then
        insert into order_status_history (order_id, old_status, new_status, changed_by)
        values (new.order_id, old.status, new.status, auth.uid());
    end if;
    return new;
end;
$$;

create trigger trg_log_order_status_change
    after update on orders
    for each row execute function trg_fn_log_order_status_change();

create or replace function trg_fn_check_trip_capacity()
returns trigger language plpgsql as $$
declare
    v_capacity numeric(10,2);
    v_booked   numeric(10,2);
begin
    select total_capacity, booked_space into v_capacity, v_booked
    from train_trips
    where trip_id = new.trip_id
    for update;

    if v_capacity is null then
        raise exception 'Train trip % does not exist', new.trip_id;
    end if;

    if v_booked + new.space_booked > v_capacity then
        raise exception
            'Booking rejected: trip % has % space units free but % were requested.',
            new.trip_id, (v_capacity - v_booked), new.space_booked;
    end if;

    return new;
end;
$$;

create trigger trg_check_trip_capacity
    before insert on train_bookings
    for each row execute function trg_fn_check_trip_capacity();

create or replace function trg_fn_update_trip_booked_space()
returns trigger language plpgsql as $$
begin
    if tg_op = 'INSERT' then
        update train_trips set booked_space = booked_space + new.space_booked where trip_id = new.trip_id;
    elsif tg_op = 'UPDATE' then
        update train_trips set booked_space = booked_space - old.space_booked + new.space_booked where trip_id = new.trip_id;
    elsif tg_op = 'DELETE' then
        update train_trips set booked_space = booked_space - old.space_booked where trip_id = old.trip_id;
    end if;
    return null;
end;
$$;

create trigger trg_update_trip_booked_space
    after insert or update or delete on train_bookings
    for each row execute function trg_fn_update_trip_booked_space();
```

### 8.3 Truck schedule roster validation

```sql
-- =========================================================
-- 12_trg_truck_schedule.sql
-- v3 change: trg_fn_validate_truck_schedule no longer
--   references new.store_id (column removed from table).
-- =========================================================

create or replace function trg_fn_validate_truck_schedule()
returns trigger language plpgsql as $$
declare
    v_conflict        record;
    v_driver_chain    int;
    v_assistant_chain int;
    v_driver_hours    numeric;
    v_assistant_hours numeric;
    v_new_hours       numeric;
    v_driver_name     text;
    v_assistant_name  text;
begin
    perform 1 from truck_schedules
     where (truck_id = new.truck_id or driver_id = new.driver_id or assistant_id = new.assistant_id)
       and status <> 'Cancelled'
     order by schedule_id
     for update;

    -- 1) truck overlap
    select * into v_conflict from truck_schedules
     where truck_id = new.truck_id and status <> 'Cancelled'
       and start_time < new.end_time and end_time > new.start_time
     limit 1;
    if found then
        raise exception 'Schedule rejected: truck % is already booked from % to % (schedule %).',
            new.truck_id, v_conflict.start_time, v_conflict.end_time, v_conflict.schedule_id;
    end if;

    -- 2) driver overlap
    select * into v_conflict from truck_schedules
     where driver_id = new.driver_id and status <> 'Cancelled'
       and start_time < new.end_time and end_time > new.start_time
     limit 1;
    if found then
        raise exception 'Schedule rejected: driver % is already booked from % to % (schedule %).',
            new.driver_id, v_conflict.start_time, v_conflict.end_time, v_conflict.schedule_id;
    end if;

    -- 3) assistant overlap
    select * into v_conflict from truck_schedules
     where assistant_id = new.assistant_id and status <> 'Cancelled'
       and start_time < new.end_time and end_time > new.start_time
     limit 1;
    if found then
        raise exception 'Schedule rejected: assistant % is already booked from % to % (schedule %).',
            new.assistant_id, v_conflict.start_time, v_conflict.end_time, v_conflict.schedule_id;
    end if;

    -- 4) driver consecutive-delivery rule (BR-004)
    v_driver_chain := fn_consecutive_chain_length('driver_id', new.driver_id, new.start_time, new.end_time);
    if v_driver_chain > 1 then
        select e.full_name into v_driver_name from drivers d join employees e on e.employee_id = d.employee_id
         where d.driver_id = new.driver_id;
        raise exception
            'Schedule rejected: driver % (%) would have a back-to-back delivery with less than a 2-hour break.',
            new.driver_id, v_driver_name;
    end if;

    -- 5) assistant max-two-consecutive-routes rule (BR-005)
    v_assistant_chain := fn_consecutive_chain_length('assistant_id', new.assistant_id, new.start_time, new.end_time);
    if v_assistant_chain > 2 then
        select e.full_name into v_assistant_name from assistants a join employees e on e.employee_id = a.employee_id
         where a.assistant_id = new.assistant_id;
        raise exception
            'Schedule rejected: assistant % (%) would be on % consecutive routes (max 2 allowed).',
            new.assistant_id, v_assistant_name, v_assistant_chain;
    end if;

    -- 6) driver weekly hour limit (BR-006)
    v_new_hours    := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
    v_driver_hours := get_driver_weekly_hours(new.driver_id, new.start_time);
    if v_driver_hours + v_new_hours > 40 then
        select e.full_name into v_driver_name from drivers d join employees e on e.employee_id = d.employee_id
         where d.driver_id = new.driver_id;
        raise exception
            'Schedule rejected: driver % (%) would exceed the 40-hour weekly limit (already % h, adding % h).',
            new.driver_id, v_driver_name, round(v_driver_hours,2), round(v_new_hours,2);
    end if;

    -- 7) assistant weekly hour limit (BR-007)
    v_assistant_hours := get_assistant_weekly_hours(new.assistant_id, new.start_time);
    if v_assistant_hours + v_new_hours > 60 then
        select e.full_name into v_assistant_name from assistants a join employees e on e.employee_id = a.employee_id
         where a.assistant_id = new.assistant_id;
        raise exception
            'Schedule rejected: assistant % (%) would exceed the 60-hour weekly limit (already % h, adding % h).',
            new.assistant_id, v_assistant_name, round(v_assistant_hours,2), round(v_new_hours,2);
    end if;

    return new;
end;
$$;

create trigger trg_validate_truck_schedule
    before insert on truck_schedules
    for each row execute function trg_fn_validate_truck_schedule();
```

### 8.4 Delivery completion cascade + inventory triggers

```sql
-- =========================================================
-- 13_trg_delivery_inventory.sql
-- =========================================================

create or replace function trg_fn_delivery_complete_order()
returns trigger language plpgsql as $$
begin
    if new.status = 'Completed' and old.status is distinct from 'Completed' then
        if new.delivered_at is null then
            new.delivered_at := now();
        end if;
        update orders set status = 'Delivered' where order_id = new.order_id;
    end if;
    return new;
end;
$$;

create trigger trg_delivery_complete_order
    before update on deliveries
    for each row execute function trg_fn_delivery_complete_order();

create or replace function trg_fn_check_inventory_before_dispatch()
returns trigger language plpgsql as $$
declare
    v_on_hand numeric;
begin
    if new.transaction_type = 'dispatch' then
        select quantity_on_hand into v_on_hand
        from store_inventory
        where store_id = new.store_id and product_id = new.product_id
        for update;

        if v_on_hand is null then
            v_on_hand := 0;
        end if;

        if v_on_hand + new.change_qty < 0 then
            raise exception
                'Dispatch rejected: store % has % units of product % in stock, cannot dispatch %.',
                new.store_id, v_on_hand, new.product_id, abs(new.change_qty);
        end if;
    end if;
    return new;
end;
$$;

create trigger trg_check_inventory_before_dispatch
    before insert on inventory_transactions
    for each row execute function trg_fn_check_inventory_before_dispatch();

create or replace function trg_fn_apply_inventory_transaction()
returns trigger language plpgsql as $$
begin
    insert into store_inventory (store_id, product_id, quantity_on_hand, updated_at)
    values (new.store_id, new.product_id, new.change_qty, now())
    on conflict (store_id, product_id)
    do update set quantity_on_hand = store_inventory.quantity_on_hand + excluded.quantity_on_hand,
                  updated_at = now();
    return new;
end;
$$;

create trigger trg_apply_inventory_transaction
    after insert on inventory_transactions
    for each row execute function trg_fn_apply_inventory_transaction();
```

### 8.5 Generic audit trigger

```sql
-- =========================================================
-- 14_trg_audit.sql
-- v3 change: trg_audit_row now also attached to stores and
--   employees, completing audit coverage of all 8 soft-delete
--   master-data tables.
-- =========================================================

create or replace function trg_fn_audit_row()
returns trigger language plpgsql as $$
declare
    v_record_id bigint;
begin
    if tg_op = 'DELETE' then
        v_record_id := (to_jsonb(old) ->> tg_argv[0])::bigint;
        insert into audit_log(table_name, record_id, action, user_id, old_data)
        values (tg_table_name, v_record_id, tg_op, auth.uid(), to_jsonb(old));
        return old;
    elsif tg_op = 'UPDATE' then
        v_record_id := (to_jsonb(new) ->> tg_argv[0])::bigint;
        insert into audit_log(table_name, record_id, action, user_id, old_data, new_data)
        values (tg_table_name, v_record_id, tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
        return new;
    else
        v_record_id := (to_jsonb(new) ->> tg_argv[0])::bigint;
        insert into audit_log(table_name, record_id, action, user_id, new_data)
        values (tg_table_name, v_record_id, tg_op, auth.uid(), to_jsonb(new));
        return new;
    end if;
end;
$$;

-- Transactional tables
create trigger trg_audit_row after insert or update or delete on orders
    for each row execute function trg_fn_audit_row('order_id');
create trigger trg_audit_row after insert or update or delete on order_items
    for each row execute function trg_fn_audit_row('order_item_id');
create trigger trg_audit_row after insert or update or delete on truck_schedules
    for each row execute function trg_fn_audit_row('schedule_id');
create trigger trg_audit_row after insert or update or delete on deliveries
    for each row execute function trg_fn_audit_row('delivery_id');
create trigger trg_audit_row after insert or update or delete on train_bookings
    for each row execute function trg_fn_audit_row('booking_id');

-- Master-data tables (all 8 now covered — stores and employees added in v3)
create trigger trg_audit_row after insert or update or delete on customers
    for each row execute function trg_fn_audit_row('customer_id');
create trigger trg_audit_row after insert or update or delete on products
    for each row execute function trg_fn_audit_row('product_id');
create trigger trg_audit_row after insert or update or delete on stores
    for each row execute function trg_fn_audit_row('store_id');       -- NEW in v3
create trigger trg_audit_row after insert or update or delete on employees
    for each row execute function trg_fn_audit_row('employee_id');    -- NEW in v3
create trigger trg_audit_row after insert or update or delete on drivers
    for each row execute function trg_fn_audit_row('driver_id');
create trigger trg_audit_row after insert or update or delete on assistants
    for each row execute function trg_fn_audit_row('assistant_id');
create trigger trg_audit_row after insert or update or delete on trucks
    for each row execute function trg_fn_audit_row('truck_id');
create trigger trg_audit_row after insert or update or delete on routes
    for each row execute function trg_fn_audit_row('route_id');
```

### 8.6 Subtype integrity triggers (new in v3)

```sql
-- =========================================================
-- 15_trg_subtype_integrity.sql  (NEW in v3)
-- Enforces that the employee_type in employees matches the
-- subtype table being written (drivers / assistants).
-- Two sets of triggers:
--   A) On INSERT to drivers/assistants: verify the linked
--      employee has the correct type.
--   B) On UPDATE to employees: block changing employee_type
--      away from 'driver'/'assistant' while a subtype row
--      still exists.
-- =========================================================

-- A) INSERT guard for drivers
create or replace function trg_fn_validate_driver_subtype()
returns trigger language plpgsql as $$
declare
    v_type text;
begin
    select employee_type into v_type from employees where employee_id = new.employee_id;
    if v_type is distinct from 'driver' then
        raise exception
            'Cannot create a drivers row for employee % whose employee_type is "%". '
            'Set employee_type = ''driver'' first.',
            new.employee_id, v_type;
    end if;
    return new;
end;
$$;

create trigger trg_validate_driver_subtype
    before insert on drivers
    for each row execute function trg_fn_validate_driver_subtype();

comment on function trg_fn_validate_driver_subtype is 'v3: ensures a drivers row can only be created for an employee whose employee_type is driver.';

-- A) INSERT guard for assistants
create or replace function trg_fn_validate_assistant_subtype()
returns trigger language plpgsql as $$
declare
    v_type text;
begin
    select employee_type into v_type from employees where employee_id = new.employee_id;
    if v_type is distinct from 'assistant' then
        raise exception
            'Cannot create an assistants row for employee % whose employee_type is "%". '
            'Set employee_type = ''assistant'' first.',
            new.employee_id, v_type;
    end if;
    return new;
end;
$$;

create trigger trg_validate_assistant_subtype
    before insert on assistants
    for each row execute function trg_fn_validate_assistant_subtype();

comment on function trg_fn_validate_assistant_subtype is 'v3: ensures an assistants row can only be created for an employee whose employee_type is assistant.';

-- B) UPDATE guard on employees: block reclassifying a driver/assistant
--    while their subtype row still exists.
create or replace function trg_fn_guard_employee_type_change()
returns trigger language plpgsql as $$
begin
    if new.employee_type is distinct from old.employee_type then
        if old.employee_type = 'driver' and exists (
            select 1 from drivers where employee_id = old.employee_id
        ) then
            raise exception
                'Cannot change employee_type of employee % from "driver" while a drivers record exists. '
                'Soft-delete the drivers row first.',
                old.employee_id;
        end if;

        if old.employee_type = 'assistant' and exists (
            select 1 from assistants where employee_id = old.employee_id
        ) then
            raise exception
                'Cannot change employee_type of employee % from "assistant" while an assistants record exists. '
                'Soft-delete the assistants row first.',
                old.employee_id;
        end if;
    end if;
    return new;
end;
$$;

create trigger trg_guard_employee_type_change
    before update on employees
    for each row execute function trg_fn_guard_employee_type_change();

comment on function trg_fn_guard_employee_type_change is 'v3: blocks changing employee_type away from driver/assistant while a matching subtype row exists, preventing orphaned or mismatched subtype records.';
```

---

## 9. Stored procedures

### 9.1 `place_order()`

No change from v2 except the INSERT into `orders` no longer passes a `store_id` (that column is gone). The route-resolution logic, overflow-splitting algorithm, and all other behaviour are identical.

```sql
-- =========================================================
-- 16_proc_place_order.sql
-- =========================================================

create or replace function place_order(
    p_customer_id            bigint,
    p_delivery_address       text,
    p_delivery_area          text,
    p_destination_city_id    bigint,
    p_expected_delivery_date date,
    p_items                  jsonb,
    p_created_by             uuid default null,
    p_order_placed_at        timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order_id      bigint;
    v_route_id      bigint;
    v_item          jsonb;
    v_search_after  timestamptz;
    v_trip          record;
    v_remaining     record;
    v_available     numeric;
    v_can_fit_qty   numeric;
    v_line_space    numeric;
    v_booking_space numeric;
    v_booking_id    bigint;
    v_any_remaining boolean;
    v_guard         int := 0;
begin
    if current_app_role() is null or current_app_role() not in ('order_entry_clerk','logistics_manager','system_administrator') then
        raise exception 'place_order: role % is not authorized to place orders.', current_app_role();
    end if;

    if p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'Order rejected: at least one order item is required.';
    end if;

    select route_id into v_route_id
    from route_coverage_areas
    where city_id = p_destination_city_id and area_name = p_delivery_area::citext
    limit 1;

    if v_route_id is null then
        raise exception
            'Order rejected: delivery area "%" is not covered by any route in city %.',
            p_delivery_area, p_destination_city_id;
    end if;

    insert into orders (customer_id, delivery_address, delivery_area, destination_city_id,
                         route_id, order_placed_at, expected_delivery_date, created_by)
    values (p_customer_id, p_delivery_address, p_delivery_area, p_destination_city_id,
            v_route_id, p_order_placed_at, p_expected_delivery_date, p_created_by)
    returning order_id into v_order_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        insert into order_items (order_id, product_id, quantity)
        values (v_order_id,
                (v_item ->> 'product_id')::bigint,
                (v_item ->> 'quantity')::numeric);
    end loop;

    create temp table if not exists tmp_item_remaining (
        order_item_id bigint primary key,
        remaining_qty numeric,
        space_rate    numeric
    ) on commit drop;
    truncate tmp_item_remaining;

    insert into tmp_item_remaining (order_item_id, remaining_qty, space_rate)
    select order_item_id, quantity, space_rate_at_order
    from order_items where order_id = v_order_id;

    create temp table if not exists tmp_trip_alloc (
        order_item_id bigint,
        qty           numeric,
        space         numeric
    ) on commit drop;

    v_search_after := p_order_placed_at;

    loop
        v_guard := v_guard + 1;
        if v_guard > 500 then
            raise exception 'Order % could not be fully booked after checking 500 trips -- check train schedule coverage for city %.',
                v_order_id, p_destination_city_id;
        end if;

        select exists(select 1 from tmp_item_remaining where remaining_qty > 0) into v_any_remaining;
        exit when not v_any_remaining;

        select * into v_trip
        from get_next_available_trip(p_destination_city_id, v_search_after)
        limit 1;

        if v_trip.trip_id is null then
            raise exception
                'Order % rejected: no scheduled train trip with free capacity to city % after %.',
                v_order_id, p_destination_city_id, v_search_after;
        end if;

        v_available := v_trip.available_space;
        truncate tmp_trip_alloc;

        for v_remaining in
            select * from tmp_item_remaining where remaining_qty > 0 order by order_item_id
        loop
            exit when v_available <= 0;
            v_can_fit_qty := floor(least(v_remaining.remaining_qty, v_available / v_remaining.space_rate));
            if v_can_fit_qty > 0 then
                v_line_space := v_can_fit_qty * v_remaining.space_rate;
                insert into tmp_trip_alloc (order_item_id, qty, space)
                    values (v_remaining.order_item_id, v_can_fit_qty, v_line_space);
                update tmp_item_remaining
                   set remaining_qty = remaining_qty - v_can_fit_qty
                 where order_item_id = v_remaining.order_item_id;
                v_available := v_available - v_line_space;
            end if;
        end loop;

        select coalesce(sum(space), 0) into v_booking_space from tmp_trip_alloc;

        if v_booking_space > 0 then
            insert into train_bookings (trip_id, order_id, space_booked)
            values (v_trip.trip_id, v_order_id, v_booking_space)
            returning booking_id into v_booking_id;

            insert into train_booking_items (booking_id, order_item_id, quantity_shipped, space_consumed)
            select v_booking_id, order_item_id, qty, space from tmp_trip_alloc;
        end if;

        v_search_after := v_trip.departure_datetime;
    end loop;

    return v_order_id;
end;
$$;

comment on function place_order is 'REQ-FR-001..006, BR-001/002/003: creates an order, resolves route (snapshotted in orders.route_id), and books train cargo space splitting across multiple trips as needed.';
```

### 9.2 Remaining three procedures

```sql
-- =========================================================
-- 17_proc_remaining.sql
-- v3 changes:
--   schedule_truck_delivery: store_id column removed from
--     INSERT (3NF fix). store_id is now derived from
--     routes.store_id via the route_id FK when needed
--     downstream (e.g. in reporting views).
--   receive_goods_at_store: inventory_transactions INSERT
--     now uses train_booking_id typed FK column instead of
--     the old reference_table / reference_id pair.
--   complete_delivery: now inserts dispatch inventory
--     transactions (negative change_qty, delivery_id FK)
--     for every order item, so store_inventory.quantity_on_hand
--     is correctly decremented when goods leave on a truck.
--     This is the functional correctness fix from the review.
-- =========================================================

-- ---------------------------------------------------------
-- schedule_truck_delivery
-- v3: store_id removed from INSERT (was transitively
--     determined by route_id -> routes.store_id).
-- ---------------------------------------------------------
create or replace function schedule_truck_delivery(
    p_truck_id     bigint,
    p_driver_id    bigint,
    p_assistant_id bigint,
    p_route_id     bigint,
    p_start_time   timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_schedule_id bigint;
    v_hours       numeric;
    v_end_time    timestamptz;
begin
    if current_app_role() is null or current_app_role() not in ('fleet_supervisor','system_administrator') then
        raise exception 'schedule_truck_delivery: role % is not authorized to schedule trucks.', current_app_role();
    end if;

    select max_delivery_time_hours into v_hours
    from routes where route_id = p_route_id and is_deleted = false;

    if v_hours is null then
        raise exception 'schedule_truck_delivery: route % not found or inactive.', p_route_id;
    end if;

    v_end_time := p_start_time + make_interval(secs => v_hours * 3600);

    -- store_id removed in v3: derive via route_id -> routes.store_id when needed
    insert into truck_schedules (truck_id, driver_id, assistant_id, route_id, start_time, end_time)
    values (p_truck_id, p_driver_id, p_assistant_id, p_route_id, p_start_time, v_end_time)
    returning schedule_id into v_schedule_id;

    return v_schedule_id;
end;
$$;

comment on function schedule_truck_delivery is 'REQ-FR-031/039: creates one truck+driver+assistant assignment. store_id removed from INSERT in v3 (3NF fix). All BR-004..BR-008 checks run inside trg_validate_truck_schedule.';

-- ---------------------------------------------------------
-- receive_goods_at_store
-- v3: uses train_booking_id typed FK column instead of
--     reference_table / reference_id.
-- ---------------------------------------------------------
create or replace function receive_goods_at_store(
    p_booking_id  bigint,
    p_received_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trip_status   text;
    v_store_id      bigint;
    v_order_id      bigint;
    v_still_pending boolean;
begin
    if current_app_role() is null or current_app_role() not in ('store_manager','system_administrator') then
        raise exception 'receive_goods_at_store: role % is not authorized to receive goods.', current_app_role();
    end if;

    select t.status, s.store_id, b.order_id
      into v_trip_status, v_store_id, v_order_id
    from train_bookings b
    join train_trips t on t.trip_id = b.trip_id
    join stores s on s.city_id = t.destination_city_id
    where b.booking_id = p_booking_id;

    if v_order_id is null then
        raise exception 'receive_goods_at_store: booking % not found.', p_booking_id;
    end if;

    if v_trip_status <> 'Arrived' then
        raise exception
            'receive_goods_at_store: trip for booking % has not been marked Arrived yet (status=%).',
            p_booking_id, v_trip_status;
    end if;

    -- REQ-FR-022: increment store inventory using the typed train_booking_id FK (v3)
    insert into inventory_transactions (store_id, product_id, change_qty, transaction_type,
                                         train_booking_id, created_by)
    select v_store_id, oi.product_id, bi.quantity_shipped, 'receive', p_booking_id, p_received_by
    from train_booking_items bi
    join order_items oi on oi.order_item_id = bi.order_item_id
    where bi.booking_id = p_booking_id;

    select exists (
        select 1
        from train_bookings b2
        join train_trips t2 on t2.trip_id = b2.trip_id
        where b2.order_id = v_order_id and t2.status <> 'Arrived'
    ) into v_still_pending;

    if not v_still_pending then
        update orders set status = 'At Store' where order_id = v_order_id and status <> 'At Store';
    end if;
end;
$$;

comment on function receive_goods_at_store is 'REQ-FR-022: increments store_inventory via inventory_transactions using the typed train_booking_id FK (v3). Only advances order to At Store once all bookings have arrived.';

-- ---------------------------------------------------------
-- complete_delivery
-- v3: now inserts dispatch inventory_transactions rows
--     (negative change_qty) for every order item, so
--     store_inventory.quantity_on_hand is correctly
--     decremented when goods leave on the truck.
--     Uses the new typed delivery_id FK column.
-- ---------------------------------------------------------
create or replace function complete_delivery(
    p_delivery_id bigint,
    p_notes       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rows      int;
    v_order_id  bigint;
    v_store_id  bigint;
begin
    if current_app_role() is null or current_app_role() not in ('fleet_supervisor','logistics_manager','system_administrator') then
        raise exception 'complete_delivery: role % is not authorized to complete deliveries.', current_app_role();
    end if;

    -- Resolve order_id and store (via route) for the inventory dispatch step
    select d.order_id, r.store_id
      into v_order_id, v_store_id
    from deliveries d
    join truck_schedules ts on ts.schedule_id = d.truck_schedule_id
    join routes r on r.route_id = ts.route_id
    where d.delivery_id = p_delivery_id;

    if v_order_id is null then
        raise exception 'complete_delivery: delivery % not found.', p_delivery_id;
    end if;

    update deliveries
       set status = 'Completed',
           notes  = coalesce(p_notes, notes)
     where delivery_id = p_delivery_id
       and status <> 'Completed';

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        raise exception 'complete_delivery: delivery % is already Completed.', p_delivery_id;
    end if;

    -- v3 fix: deduct dispatched goods from store_inventory via inventory_transactions.
    -- change_qty is negative (dispatch). trg_check_inventory_before_dispatch enforces
    -- no negative stock; trg_apply_inventory_transaction applies the decrement.
    -- delivery_id typed FK is set so the transaction can be traced back to this delivery.
    insert into inventory_transactions (store_id, product_id, change_qty, transaction_type, delivery_id)
    select v_store_id,
           oi.product_id,
           -sum(oi.quantity),   -- negative = leaving the store
           'dispatch',
           p_delivery_id
    from order_items oi
    where oi.order_id = v_order_id
    group by oi.product_id;

end;
$$;

comment on function complete_delivery is 'REQ-FR-042: marks delivery Completed; trg_delivery_complete_order cascades to parent order (Delivered, delivered_at stamped). v3 fix: inserts dispatch inventory_transactions rows (negative change_qty, delivery_id FK) so store_inventory.quantity_on_hand is correctly decremented when goods leave.';
```

---

## 10. Row Level Security

### 10.1 Role permission matrix

| Table / area | System Admin | Logistics Manager | Order Entry Clerk | Store Manager | Fleet Supervisor |
|---|---|---|---|---|---|
| customers | full | read | read + insert | — | — |
| products, cities, routes | full | read | read | read | read |
| stores | full | read | read | **own store only** | read |
| employees / drivers / assistants / trucks | full | read | — | — | read |
| orders (place/read) | full | read + status update | read (+ create via `place_order`) | **own city only** | read |
| train_trips / train_bookings | full | full | — | read (own city) | — |
| store_inventory / inventory_transactions | full | read (all stores) | — | **own store only** | — |
| truck_schedules / deliveries | full | read | read | read | full (via procedures) |
| audit_log | full | — | — | — | — |

### 10.2 Helper functions

```sql
-- =========================================================
-- 18_rls_helpers.sql
-- v3: current_app_role() and current_home_store_id() are
--   unchanged. get_user_display_name() added in §7 replaces
--   the removed user_profiles.full_name column for display.
-- =========================================================

create or replace function current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select app_role from user_profiles where user_id = auth.uid() and is_active = true;
$$;

create or replace function current_home_store_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
    select e.home_store_id
    from user_profiles up
    join employees e on e.employee_id = up.employee_id
    where up.user_id = auth.uid();
$$;
```

### 10.3 Policies

```sql
-- =========================================================
-- 19_rls_policies.sql
-- Unchanged from v2 except: no policy references
-- user_profiles.full_name (column removed).
-- =========================================================

alter table cities enable row level security;
create policy cities_select on cities for select
    using (current_app_role() is not null);
create policy cities_admin_write on cities for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table customers enable row level security;
create policy customers_select on customers for select
    using (current_app_role() in ('system_administrator','logistics_manager','order_entry_clerk'));
create policy customers_insert on customers for insert
    with check (current_app_role() in ('system_administrator','order_entry_clerk'));
create policy customers_update on customers for update
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table products enable row level security;
create policy products_select on products for select
    using (current_app_role() is not null);
create policy products_admin_write on products for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table stores enable row level security;
create policy stores_select on stores for select
    using (
        current_app_role() in ('system_administrator','logistics_manager','fleet_supervisor','order_entry_clerk')
        or (current_app_role() = 'store_manager' and store_id = current_home_store_id())
    );
create policy stores_admin_write on stores for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table employees enable row level security;
create policy employees_select on employees for select
    using (current_app_role() in ('system_administrator','logistics_manager','fleet_supervisor'));
create policy employees_admin_write on employees for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table drivers enable row level security;
create policy drivers_select on drivers for select
    using (current_app_role() in ('system_administrator','logistics_manager','fleet_supervisor'));
create policy drivers_admin_write on drivers for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table assistants enable row level security;
create policy assistants_select on assistants for select
    using (current_app_role() in ('system_administrator','logistics_manager','fleet_supervisor'));
create policy assistants_admin_write on assistants for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table trucks enable row level security;
create policy trucks_select on trucks for select
    using (current_app_role() in ('system_administrator','logistics_manager','fleet_supervisor'));
create policy trucks_admin_write on trucks for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table user_profiles enable row level security;
create policy user_profiles_self_select on user_profiles for select
    using (user_id = auth.uid() or current_app_role() = 'system_administrator');
create policy user_profiles_admin_write on user_profiles for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table routes enable row level security;
create policy routes_select on routes for select
    using (current_app_role() is not null);
create policy routes_admin_write on routes for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table route_coverage_areas enable row level security;
create policy coverage_select on route_coverage_areas for select
    using (current_app_role() is not null);
create policy coverage_admin_write on route_coverage_areas for all
    using (current_app_role() = 'system_administrator')
    with check (current_app_role() = 'system_administrator');

alter table orders enable row level security;
create policy orders_select on orders for select
    using (
        current_app_role() in ('system_administrator','logistics_manager','order_entry_clerk','fleet_supervisor')
        or (current_app_role() = 'store_manager'
            and destination_city_id = (select city_id from stores where store_id = current_home_store_id()))
    );
create policy orders_update_status on orders for update
    using (current_app_role() in ('system_administrator','logistics_manager'))
    with check (current_app_role() in ('system_administrator','logistics_manager'));

alter table order_items enable row level security;
create policy order_items_select on order_items for select
    using (current_app_role() in
        ('system_administrator','logistics_manager','order_entry_clerk','fleet_supervisor','store_manager'));

alter table order_status_history enable row level security;
create policy order_status_history_select on order_status_history for select
    using (current_app_role() in ('system_administrator','logistics_manager','order_entry_clerk'));

alter table train_trips enable row level security;
create policy train_trips_select on train_trips for select
    using (current_app_role() in ('system_administrator','logistics_manager','store_manager','order_entry_clerk'));
create policy train_trips_write on train_trips for all
    using (current_app_role() in ('system_administrator','logistics_manager'))
    with check (current_app_role() in ('system_administrator','logistics_manager'));

alter table train_bookings enable row level security;
create policy train_bookings_select on train_bookings for select
    using (current_app_role() in ('system_administrator','logistics_manager','store_manager'));

alter table train_booking_items enable row level security;
create policy train_booking_items_select on train_booking_items for select
    using (current_app_role() in ('system_administrator','logistics_manager','store_manager'));

alter table store_inventory enable row level security;
create policy store_inventory_select on store_inventory for select
    using (
        current_app_role() in ('system_administrator','logistics_manager')
        or (current_app_role() = 'store_manager' and store_id = current_home_store_id())
    );

alter table inventory_transactions enable row level security;
create policy inventory_transactions_select on inventory_transactions for select
    using (
        current_app_role() in ('system_administrator','logistics_manager')
        or (current_app_role() = 'store_manager' and store_id = current_home_store_id())
    );

alter table truck_schedules enable row level security;
create policy truck_schedules_select on truck_schedules for select
    using (current_app_role() in
        ('system_administrator','logistics_manager','fleet_supervisor','store_manager'));

alter table deliveries enable row level security;
create policy deliveries_select on deliveries for select
    using (current_app_role() in
        ('system_administrator','logistics_manager','fleet_supervisor','store_manager','order_entry_clerk'));

alter table audit_log enable row level security;
create policy audit_log_select on audit_log for select
    using (current_app_role() = 'system_administrator');
```

---

## 11. Reporting views

```sql
-- =========================================================
-- 20_reports.sql
-- v3 changes:
--   v_city_route_sales: join to get store_id from routes
--     rather than truck_schedules (store_id column removed).
--   All other views unchanged.
-- =========================================================

-- Report 1: Quarterly sales (Delivered orders only — BR-009)
create or replace view v_quarterly_sales as
select
    extract(year from o.order_placed_at)::int    as sales_year,
    extract(quarter from o.order_placed_at)::int as sales_quarter,
    count(distinct o.order_id)                    as num_orders,
    sum(oi.quantity)                               as total_volume,
    sum(oi.line_value)                             as total_value
from orders o
join order_items oi on oi.order_id = o.order_id
where o.status = 'Delivered'
group by 1, 2;

-- Report 2: Most ordered items in a given quarter
create or replace view v_most_ordered_items as
select
    extract(year from o.order_placed_at)::int    as sales_year,
    extract(quarter from o.order_placed_at)::int as sales_quarter,
    p.product_id,
    p.product_name,
    sum(oi.quantity)   as total_quantity,
    sum(oi.line_value) as total_value,
    rank() over (
        partition by extract(year from o.order_placed_at)::int,
                     extract(quarter from o.order_placed_at)::int
        order by sum(oi.quantity) desc
    ) as quantity_rank
from orders o
join order_items oi on oi.order_id = o.order_id
join products p on p.product_id = oi.product_id
where o.status = 'Delivered'
group by extract(year from o.order_placed_at)::int,
         extract(quarter from o.order_placed_at)::int,
         p.product_id, p.product_name;

-- Report 3: City-wise and route-wise sales breakdown
-- v3: join uses orders.route_id (snapshot FK) to reach routes;
--     store_id is not needed in this view.
create or replace view v_city_route_sales as
select
    c.city_id,
    c.city_name,
    r.route_id,
    r.route_name,
    count(distinct o.order_id) as num_orders,
    sum(oi.quantity)            as total_volume,
    sum(oi.line_value)          as total_value
from orders o
join order_items oi on oi.order_id = o.order_id
join cities c on c.city_id = o.destination_city_id
left join routes r on r.route_id = o.route_id
where o.status = 'Delivered'
group by c.city_id, c.city_name, r.route_id, r.route_name;

-- Report 4: Driver and assistant working hours
create or replace view v_driver_assistant_hours as
select
    'driver'::text                as person_role,
    d.driver_id                   as person_id,
    e.full_name,
    fn_week_start(ts.start_time)  as week_start,
    sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0) as total_hours,
    40                            as weekly_limit_hours,
    40 - sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0) as remaining_hours
from truck_schedules ts
join drivers d on d.driver_id = ts.driver_id
join employees e on e.employee_id = d.employee_id
where ts.status <> 'Cancelled'
group by d.driver_id, e.full_name, fn_week_start(ts.start_time)

union all

select
    'assistant'::text             as person_role,
    a.assistant_id                as person_id,
    e.full_name,
    fn_week_start(ts.start_time)  as week_start,
    sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0) as total_hours,
    60                            as weekly_limit_hours,
    60 - sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0) as remaining_hours
from truck_schedules ts
join assistants a on a.assistant_id = ts.assistant_id
join employees e on e.employee_id = a.employee_id
where ts.status <> 'Cancelled'
group by a.assistant_id, e.full_name, fn_week_start(ts.start_time);

-- Report 5: Truck usage per month
create or replace view v_truck_usage_monthly as
select
    t.truck_id,
    t.plate_number,
    date_trunc('month', ts.start_time) as usage_month,
    count(*)                            as num_schedules,
    sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0) as total_hours,
    count(distinct ts.route_id)         as distinct_routes_covered
from truck_schedules ts
join trucks t on t.truck_id = ts.truck_id
where ts.status <> 'Cancelled'
group by t.truck_id, t.plate_number, date_trunc('month', ts.start_time);

-- Report 6: Customer order history with delivery details
create or replace view v_customer_order_history as
select
    o.order_id,
    cu.customer_id,
    cu.customer_name,
    o.order_placed_at,
    o.expected_delivery_date,
    o.status,
    o.delivery_address,
    o.delivery_area,
    ci.city_name        as destination_city,
    r.route_name,
    o.total_value,
    o.total_space_required,
    dl.delivery_id,
    dl.status           as delivery_status,
    dl.delivered_at,
    drv_e.full_name     as driver_name,
    ast_e.full_name     as assistant_name,
    tr.plate_number     as truck_plate
from orders o
join customers cu on cu.customer_id = o.customer_id
join cities ci on ci.city_id = o.destination_city_id
left join routes r on r.route_id = o.route_id
left join deliveries dl on dl.order_id = o.order_id
left join truck_schedules ts on ts.schedule_id = dl.truck_schedule_id
left join drivers drv on drv.driver_id = ts.driver_id
left join employees drv_e on drv_e.employee_id = drv.employee_id
left join assistants ast on ast.assistant_id = ts.assistant_id
left join employees ast_e on ast_e.employee_id = ast.employee_id
left join trucks tr on tr.truck_id = ts.truck_id;
```

---

## 12. Edge cases & design notes

**`orders.route_id` as a snapshot (3NF trade-off, documented).** This column is derivable from `(destination_city_id, delivery_area)` via `route_coverage_areas`, making it a transitive dependency and a technical 3NF violation. It is retained deliberately, following the same reasoning as `order_items.unit_price_at_order`: if the route zone mapping changes after an order is placed, the historical order must still reference the route it actually shipped on, not the current mapping. This is documented in §1 (decision 11) and is an accepted, named trade-off, not an oversight.

**Inventory now correctly decremented on dispatch (v3).** `complete_delivery()` now inserts a `dispatch` `inventory_transactions` row for every product in the order, with a negative `change_qty` and the typed `delivery_id` FK. `trg_check_inventory_before_dispatch` prevents the quantity going negative; `trg_apply_inventory_transaction` applies the decrement to `store_inventory.quantity_on_hand`. Stock levels now correctly reflect goods leaving the store.

**No origin city on train_trips.** Every trip is implicitly from Kandy. This is a stated v1 assumption (§1). Adding `origin_city_id` would be a one-column, one-index change if a second dispatch hub is ever needed.

**Subtype integrity now enforced at the database level (v3).** In v2 nothing blocked a `drivers` row pointing at a `store_manager` employee. The new triggers in §8.6 enforce the match in both directions: on INSERT to the subtype table, and on UPDATE of `employees.employee_type` while a subtype row exists.

**Concurrency.** `trg_check_trip_capacity` and `trg_validate_truck_schedule` both use `SELECT ... FOR UPDATE` with `ORDER BY` on the primary key to serialize concurrent writes and prevent deadlocks.

**Soft delete is enforced at the database level.** `trg_fn_prevent_hard_delete` blocks `DELETE` on all 8 master-data tables regardless of which client issues it.

**Roster edge case — week boundaries.** The 06:00–20:00 same-day constraint on `truck_schedules` means no schedule straddles a week boundary, so weekly hour totals are always unambiguous.

**Deliveries uniqueness.** The partial unique index `uq_deliveries_active_per_order` (v3) prevents two simultaneously active (`Scheduled` or `In Progress`) deliveries for the same order. Re-delivery after a `Failed` or `Completed` row is still permitted.

**Lock-scope scalability (acknowledged backlog).** `trg_validate_truck_schedule` locks every non-cancelled historical schedule for a truck/driver/assistant before its checks. At high schedule volume this lock scope grows over time. Narrowing the `WHERE` clause to a relevant time window is the correct future fix.

---

## 13. Seed data

The seed scripts from v2 require the following adjustments for v3:

**`20_seed_master.sql`:** The `user_profiles` INSERT must omit `full_name` (column removed). Use `display_name_override` only if `employee_id` is not set.

**`24_seed_progress_orders.sql`:** The `schedule_truck_delivery()` call no longer passes `store_id` (removed from signature). No other change needed — the `complete_delivery()` dispatch fix in v3 will automatically deduct inventory when called.

All other seed scripts (`21_seed_trips.sql`, `22_seed_historical_orders.sql`, `23_seed_current_orders.sql`) are unchanged. Target row counts remain the same as v2 (45 orders, 10 routes, 420 train trips).

---

## 14. Deployment checklist (Supabase-specific)

Same as v2 with two additions:

1. Run §5 through §9 in numbered order.
2. Skip the local `auth.uid()` stub — Supabase provides this natively.
3. Run §10 (RLS) after §5–9.
4. Grant `EXECUTE` on the four procedures to the `authenticated` role.
5. Run §11 (reporting views) and §13 (seed data) last.
6. **v3 addition:** Verify `user_profiles` inserts in your admin tooling no longer send a `full_name` column — it no longer exists. Use `get_user_display_name(user_id)` wherever a display name is needed in the UI.
7. **v3 addition:** Verify any existing application code that reads `truck_schedules.store_id` directly is updated to join through `route_id → routes.store_id` instead.

---

## 15. Full seed scripts (v3-adjusted)

The four seed files from v2 are reproduced here with the minimal changes needed for v3. Only `20_seed_master.sql` and `24_seed_progress_orders.sql` required edits; the other two are identical to v2.

```sql
-- =========================================================
-- 20_seed_master.sql  (v3 adjusted)
-- Change: user_profiles INSERT omits full_name (removed).
--         display_name_override is used for the seed admin
--         row because it has no employee record.
-- =========================================================

insert into cities (city_name, is_origin, is_destination)
values ('Kandy', true, false)
on conflict (city_name) do nothing;

insert into cities (city_name, is_destination)
values ('Colombo', true), ('Negombo', true), ('Galle', true),
       ('Matara', true), ('Jaffna', true), ('Trincomalee', true)
on conflict (city_name) do nothing;

insert into stores (city_id, store_name, railway_station_name, contact_phone)
select city_id, city_name || ' Store', city_name, '011' || (2000000 + city_id)::text
from cities where is_destination and city_id not in (select city_id from stores)
on conflict (city_id) do nothing;

insert into routes (store_id, route_name, coverage_description, max_delivery_time_hours)
select s.store_id, r.route_name, r.coverage_description, r.hrs
from stores s
join cities c on c.city_id = s.city_id
join (values
    ('Colombo','Colombo Fort/Pettah Route','City centre and market area', 2.0),
    ('Colombo','Colombo Suburbs Route','Nugegoda, Maharagama, Kotte', 3.0),
    ('Negombo','Negombo Beach Route','Beach strip and town centre', 2.5),
    ('Negombo','Negombo Katunayake Route','Airport corridor', 2.5),
    ('Galle','Galle Fort Route','Fort and harbour area', 2.0),
    ('Galle','Galle Karapitiya Route','Inland suburbs', 3.0),
    ('Matara','Matara Town Route','Town centre and bus stand area', 2.5),
    ('Jaffna','Jaffna Town Route','Town centre and hospital road', 3.0),
    ('Trincomalee','Trincomalee Town Route','Town centre and harbour road', 3.0),
    ('Colombo','Colombo Coastal Route','Mount Lavinia, Dehiwala', 2.5)
) as r(city_name, route_name, coverage_description, hrs) on r.city_name = c.city_name
where not exists (select 1 from routes existing where existing.route_name = r.route_name);

insert into route_coverage_areas (route_id, city_id, area_name)
select rt.route_id, c.city_id, a.area_name
from routes rt
join stores s on s.store_id = rt.store_id
join cities c on c.city_id = s.city_id
join (values
    ('Colombo Fort/Pettah Route','Fort'), ('Colombo Fort/Pettah Route','Pettah'),
    ('Colombo Suburbs Route','Nugegoda'), ('Colombo Suburbs Route','Maharagama'), ('Colombo Suburbs Route','Kotte'),
    ('Colombo Coastal Route','Mount Lavinia'), ('Colombo Coastal Route','Dehiwala'),
    ('Negombo Beach Route','Negombo Beach'), ('Negombo Beach Route','Negombo Town'),
    ('Negombo Katunayake Route','Katunayake'), ('Negombo Katunayake Route','Seeduwa'),
    ('Galle Fort Route','Galle Fort'), ('Galle Fort Route','Unawatuna'),
    ('Galle Karapitiya Route','Karapitiya'), ('Galle Karapitiya Route','Wakwella'),
    ('Matara Town Route','Matara Town'), ('Matara Town Route','Nupe'),
    ('Jaffna Town Route','Jaffna Town'), ('Jaffna Town Route','Nallur'),
    ('Trincomalee Town Route','Trincomalee Town'), ('Trincomalee Town Route','Uppuveli')
) as a(route_name, area_name) on a.route_name = rt.route_name
on conflict do nothing;

insert into products (sku, product_name, category, unit_of_measure, unit_price, space_rate)
values
    ('DET-002','Detergent Powder 1kg','Household','bag', 650.00, 0.4),
    ('SOAP-001','Bathing Soap (6-pack)','Personal Care','pack', 480.00, 0.2),
    ('TEA-001','Ceylon Tea 400g','Beverages','box', 720.00, 0.25),
    ('RICE-001','White Rice 5kg','Groceries','bag', 1450.00, 1.0),
    ('OIL-001','Coconut Oil 1L','Groceries','bottle', 890.00, 0.3),
    ('BISC-001','Cream Biscuits 200g','Snacks','pack', 210.00, 0.1),
    ('NOOD-001','Instant Noodles (10-pack)','Snacks','pack', 950.00, 0.35),
    ('JUICE-001','Fruit Juice 1L','Beverages','carton', 340.00, 0.3),
    ('SHMP-001','Shampoo 400ml','Personal Care','bottle', 610.00, 0.2),
    ('SUGAR-001','White Sugar 5kg','Groceries','bag', 1250.00, 1.0),
    ('SALT-001','Iodised Salt 1kg','Groceries','pack', 130.00, 0.2),
    ('SOFT-001','Fabric Softener 1L','Household','bottle', 540.00, 0.3),
    ('CLEAN-001','Multi-surface Cleaner 750ml','Household','bottle', 460.00, 0.25),
    ('COFFEE-001','Instant Coffee 200g','Beverages','jar', 980.00, 0.2)
on conflict (sku) do nothing;

insert into customers (customer_name, customer_type, phone, registered_city_id, address_line)
select 'Customer ' || gs || ' - ' || c.city_name,
       case when gs % 3 = 0 then 'wholesale' else 'retail' end,
       '07' || (10000000 + gs)::text,
       c.city_id,
       gs || ' Main Street, ' || c.city_name
from generate_series(1, 20) gs
join cities c on c.city_id = ((gs % 6) + (select min(city_id) from cities where is_destination));

insert into employees (full_name, nic_number, phone, employee_type, home_store_id)
select 'Driver ' || gs, '19' || lpad((800000+gs)::text,7,'0') || 'V', '076' || (1000000+gs)::text,
       'driver', s.store_id
from generate_series(1, 10) gs
join stores s on s.store_id = ((gs % 6) + 1);

insert into drivers (employee_id, license_number)
select e.employee_id, 'DL-0' || e.employee_id
from employees e
where e.employee_type = 'driver' and e.employee_id not in (select employee_id from drivers);

insert into employees (full_name, nic_number, phone, employee_type, home_store_id)
select 'Assistant ' || gs, '19' || lpad((900000+gs)::text,7,'0') || 'V', '077' || (1000000+gs)::text,
       'assistant', s.store_id
from generate_series(1, 10) gs
join stores s on s.store_id = ((gs % 6) + 1);

insert into assistants (employee_id)
select e.employee_id from employees e
where e.employee_type = 'assistant' and e.employee_id not in (select employee_id from assistants);

insert into trucks (plate_number, home_store_id)
select 'WP-KP-' || (1000 + s.store_id*10 + n), s.store_id
from stores s, generate_series(1,2) n
where not exists (select 1 from trucks t where t.home_store_id = s.store_id)
   or s.store_id > 1;

-- Seed admin profile for procedures (v3: uses display_name_override, no employee_id)
insert into user_profiles (user_id, display_name_override, app_role)
values ('00000000-0000-0000-0000-000000000001', 'Seed Script Admin', 'system_administrator')
on conflict (user_id) do nothing;
```

```sql
-- =========================================================
-- 21_seed_trips.sql  (unchanged from v2)
-- =========================================================
do $$
declare
    v_city       record;
    v_week_start date := '2026-02-02';
    v_end_date   date := '2026-09-30';
    v_departure  timestamptz;
begin
    for v_city in select city_id, city_name from cities where is_destination loop
        v_week_start := '2026-02-02';
        while v_week_start <= v_end_date loop
            v_departure := v_week_start + time '06:30';
            insert into train_trips (destination_city_id, departure_datetime, arrival_datetime, total_capacity, status)
            values (v_city.city_id, v_departure, v_departure + interval '5 hours', 300,
                    case when v_departure < now() then 'Arrived' else 'Scheduled' end);

            v_departure := (v_week_start + 3) + time '06:30';
            insert into train_trips (destination_city_id, departure_datetime, arrival_datetime, total_capacity, status)
            values (v_city.city_id, v_departure, v_departure + interval '5 hours', 300,
                    case when v_departure < now() then 'Arrived' else 'Scheduled' end);

            v_week_start := v_week_start + 7;
        end loop;
    end loop;
end $$;
```

```sql
-- =========================================================
-- 22_seed_historical_orders.sql  (unchanged from v2)
-- =========================================================
do $$
declare
    v_customer_ids bigint[] := (select array_agg(customer_id order by customer_id) from customers);
    v_product_ids  bigint[] := (select array_agg(product_id order by product_id) from products);
    v_trip         record;
    v_order_id     bigint;
    v_order_date   date;
    v_cust         bigint;
    v_prod1        bigint;
    v_prod2        bigint;
    v_qty1         numeric;
    v_qty2         numeric;
    v_area         text;
    v_booking_id   bigint;
    v_space1       numeric;
    v_space2       numeric;
    v_oi1          bigint;
    v_oi2          bigint;
    i int;
begin
    alter table orders disable trigger trg_log_order_status_change;

    for i in 1..10 loop
        v_order_date := (date '2026-02-15' + (i * 15))::date;

        select t.trip_id, t.destination_city_id, t.departure_datetime, (t.total_capacity - t.booked_space) as avail
          into v_trip
        from train_trips t
        where t.departure_datetime > v_order_date + 7
          and t.departure_datetime < v_order_date + 14
          and t.status = 'Arrived'
        order by t.departure_datetime asc
        limit 1;

        continue when v_trip.trip_id is null;

        select area_name into v_area from route_coverage_areas where city_id = v_trip.destination_city_id limit 1;
        v_cust  := v_customer_ids[1 + (i % array_length(v_customer_ids,1))];
        v_prod1 := v_product_ids[1 + (i % array_length(v_product_ids,1))];
        v_prod2 := v_product_ids[1 + ((i+3) % array_length(v_product_ids,1))];
        v_qty1  := 4 + (i % 5);
        v_qty2  := 2 + (i % 3);

        insert into orders (customer_id, delivery_address, delivery_area, destination_city_id,
                             route_id, order_placed_at, expected_delivery_date, status)
        select v_cust, 'Historical delivery address ' || i, v_area, v_trip.destination_city_id,
               rca.route_id, v_order_date, v_order_date + 9, 'Delivered'
        from route_coverage_areas rca
        where rca.city_id = v_trip.destination_city_id and rca.area_name = v_area
        limit 1
        returning order_id into v_order_id;

        insert into order_items (order_id, product_id, quantity)
        values (v_order_id, v_prod1, v_qty1)
        returning order_item_id, line_space into v_oi1, v_space1;

        insert into order_items (order_id, product_id, quantity)
        values (v_order_id, v_prod2, v_qty2)
        returning order_item_id, line_space into v_oi2, v_space2;

        insert into train_bookings (trip_id, order_id, space_booked, booked_at)
        values (v_trip.trip_id, v_order_id, v_space1 + v_space2, v_order_date)
        returning booking_id into v_booking_id;

        insert into train_booking_items (booking_id, order_item_id, quantity_shipped, space_consumed)
        values (v_booking_id, v_oi1, v_qty1, v_space1),
               (v_booking_id, v_oi2, v_qty2, v_space2);

        -- receive (typed FK: train_booking_id)
        insert into inventory_transactions (store_id, product_id, change_qty, transaction_type,
                                             train_booking_id, created_at)
        select s.store_id, oi.product_id, oi.quantity, 'receive', v_booking_id, v_order_date + 8
        from order_items oi join stores s on s.city_id = v_trip.destination_city_id
        where oi.order_id = v_order_id;

        update orders set status = 'Delivered', updated_at = v_order_date + 9 where order_id = v_order_id;
        insert into order_status_history (order_id, old_status, new_status, changed_at)
        values (v_order_id, 'Pending', 'Delivered', v_order_date + 9);
    end loop;

    alter table orders enable trigger trg_log_order_status_change;
end $$;
```

```sql
-- =========================================================
-- 23_seed_current_orders.sql  (unchanged from v2)
-- =========================================================
create or replace function auth.uid() returns uuid language sql stable as
$$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

do $$
declare
    v_customer_ids bigint[] := (select array_agg(customer_id order by customer_id) from customers);
    v_product_ids  bigint[] := (select array_agg(product_id order by product_id) from products);
    v_order_id     bigint;
    v_items        jsonb;
    i int;
    v_area_row     record;
    v_area_count   int;
    v_idx          int;
begin
    select count(*) into v_area_count from route_coverage_areas;

    for i in 1..35 loop
        v_idx := 1 + ((i - 1) % v_area_count);
        select city_id, area_name into v_area_row
        from (select city_id, area_name, row_number() over (order by coverage_id) as rn
              from route_coverage_areas) x
        where rn = v_idx;

        v_items := jsonb_build_array(
            jsonb_build_object('product_id', v_product_ids[1 + (i % array_length(v_product_ids,1))],
                                'quantity', 3 + (i % 6)));
        if i % 2 = 0 then
            v_items := v_items || jsonb_build_array(
                jsonb_build_object('product_id', v_product_ids[1 + ((i+5) % array_length(v_product_ids,1))],
                                    'quantity', 2 + (i % 4)));
        end if;

        v_order_id := place_order(
            v_customer_ids[1 + (i % array_length(v_customer_ids,1))],
            i || ' Delivery Lane, area ' || v_area_row.area_name,
            v_area_row.area_name,
            v_area_row.city_id,
            (current_date + 9),
            v_items,
            null,
            now() - ((35 - i) || ' hours')::interval
        );
    end loop;
end $$;
```

```sql
-- =========================================================
-- 24_seed_progress_orders.sql  (v3 adjusted)
-- Change: schedule_truck_delivery() call no longer passes
--   store_id (column removed from truck_schedules in v3).
--   complete_delivery() now automatically deducts inventory
--   via the dispatch fix — no change needed in this script
--   to get that behaviour; it happens inside the procedure.
-- =========================================================
do $$
declare
    v_trip          record;
    v_booking       record;
    v_driver_id     bigint;
    v_assistant_id  bigint;
    v_truck_id      bigint;
    v_route_id      bigint;
    v_store_id      bigint;
    v_schedule_id   bigint;
    v_delivery_id   bigint;
    v_slot_offset   int := 0;
    v_start         timestamptz;
    v_counter       int := 0;
begin
    for v_trip in
        select distinct t.trip_id, t.destination_city_id, t.departure_datetime
        from train_trips t
        join train_bookings b on b.trip_id = t.trip_id
        where t.status = 'Scheduled'
        order by t.departure_datetime asc
        limit 15
    loop
        update train_trips set status = 'Arrived' where trip_id = v_trip.trip_id;

        for v_booking in select booking_id, order_id from train_bookings where trip_id = v_trip.trip_id loop
            perform receive_goods_at_store(v_booking.booking_id);
        end loop;

        -- resolve store via the destination city (v3: store_id no longer on truck_schedules)
        select s.store_id into v_store_id from stores s where s.city_id = v_trip.destination_city_id;
        select driver_id into v_driver_id from drivers d
            join employees e on e.employee_id = d.employee_id where e.home_store_id = v_store_id limit 1;
        select assistant_id into v_assistant_id from assistants a
            join employees e on e.employee_id = a.employee_id where e.home_store_id = v_store_id limit 1;
        select truck_id into v_truck_id from trucks where home_store_id = v_store_id limit 1;
        select route_id into v_route_id from routes where store_id = v_store_id limit 1;

        continue when v_driver_id is null or v_assistant_id is null or v_truck_id is null or v_route_id is null;

        v_start := date_trunc('day', v_trip.departure_datetime) + interval '1 day' + time '09:00'
                   + (v_slot_offset || ' days')::interval;
        v_slot_offset := v_slot_offset + 1;

        begin
            -- v3: no store_id parameter (removed from procedure signature)
            v_schedule_id := schedule_truck_delivery(v_truck_id, v_driver_id, v_assistant_id, v_route_id, v_start);
        exception when others then
            continue;
        end;

        for v_booking in select order_id from train_bookings where trip_id = v_trip.trip_id loop
            insert into deliveries (order_id, truck_schedule_id) values (v_booking.order_id, v_schedule_id)
                returning delivery_id into v_delivery_id;

            v_counter := v_counter + 1;
            if v_counter % 3 <> 0 then
                -- complete_delivery() now also deducts inventory (v3 fix — automatic)
                perform complete_delivery(v_delivery_id, 'Delivered on scheduled run.');
            else
                update deliveries set status = 'In Progress' where delivery_id = v_delivery_id;
                update orders set status = 'Out for Delivery' where order_id = v_booking.order_id;
            end if;
        end loop;
    end loop;
end $$;
```

---

## 16. Task-by-task data flow — which tables fill for each operation

### 16.1 Quick-reference matrix (v3 updated)

| # | Task | Who does it | Entry point | Tables **written** | Tables **read only** |
|---|---|---|---|---|---|
| 1 | Place an order | Order Entry Clerk / Logistics Manager | `place_order()` | `orders`, `order_items`, `train_bookings`, `train_booking_items`, `train_trips` (trigger), `order_status_history`, `audit_log` | `customers`, `products`, `route_coverage_areas` |
| 2 | Mark a trip arrived | Logistics Manager | plain `UPDATE train_trips` | `train_trips` | — |
| 3 | Receive goods at store | Store Manager | `receive_goods_at_store()` | `inventory_transactions` (train_booking_id FK), `store_inventory` (trigger), `orders` (conditionally), `order_status_history`, `audit_log` | `train_bookings`, `train_trips`, `train_booking_items`, `order_items`, `stores` |
| 4 | Schedule a truck delivery | Fleet Supervisor | `schedule_truck_delivery()` | `truck_schedules` (no store_id column — v3), `audit_log` | `routes` (store resolved via route_id), `drivers`, `assistants`, `employees`, `truck_schedules` (self, for validation) |
| 5 | Dispatch an order on a scheduled truck | Fleet Supervisor | plain `INSERT INTO deliveries` | `deliveries` | `orders`, `truck_schedules` |
| 6 | Complete a delivery | Fleet Supervisor / Logistics Manager | `complete_delivery()` | `deliveries`, `inventory_transactions` (dispatch, delivery_id FK — **new in v3**), `store_inventory` (trigger — **now decrements**), `orders` (trigger), `order_status_history`, `audit_log` | `order_items`, `routes` (for store_id) |
| 7 | Add / edit master data | System Administrator | plain `INSERT`/`UPDATE` | master table, `audit_log` (all 8 tables now, incl. stores/employees — v3) | — |
| 8 | Soft-delete master data | System Administrator | `UPDATE ... SET is_deleted, deleted_at` | same table, `audit_log` | — |
| 9 | Run a report | Varies | `SELECT * FROM v_...` | *(none)* | `orders`, `order_items`, `products`, `cities`, `routes`, etc. |

### 16.2 Task: Place an order

No change from v2. `orders.route_id` is still written by `place_order()` as a snapshot of the matched route at order time.

### 16.3 Task: Mark a trip arrived, then receive goods at store

Step B (`receive_goods_at_store()`) now writes `inventory_transactions` using the typed `train_booking_id` FK column instead of the old `reference_table`/`reference_id` pair. All other behaviour is identical to v2.

| Step | Table | Operation | Caused by |
|---|---|---|---|
| 1 | `train_trips`, `stores`, `train_bookings` | read | confirm trip is `Arrived`, find destination store |
| 2 | `inventory_transactions` | **INSERT** (1 row per item, `train_booking_id` FK set — v3) | procedure body |
| 2a | `store_inventory` | **INSERT** or **UPDATE** (upsert) | `trg_apply_inventory_transaction` |
| 3 | `train_bookings`, `train_trips` | read | check all bookings for this order have arrived |
| 4 | `orders` | **UPDATE** (`status='At Store'`) — only if all arrived | procedure body |
| 4a | `order_status_history` | **INSERT** | `trg_log_order_status_change` |
| 5 | `audit_log` | **INSERT** | `trg_audit_row` on `orders` |

### 16.4 Task: Schedule and complete a truck delivery

**v3 changes:**
- `schedule_truck_delivery()` no longer inserts `store_id` into `truck_schedules` — that column no longer exists. The store is derived via `route_id → routes.store_id` wherever it is needed downstream.
- `complete_delivery()` now additionally writes `inventory_transactions` dispatch rows (negative `change_qty`, `delivery_id` FK set), which cascades into `store_inventory` via `trg_apply_inventory_transaction`.

| Step | Table | Operation | Caused by |
|---|---|---|---|
| 1 | `routes` | read | look up `max_delivery_time_hours` (store_id derived here too if needed) |
| 2 | `truck_schedules` | **INSERT** (no `store_id` column — v3) | `schedule_truck_delivery()` |
| 2a | `truck_schedules`, `drivers`, `assistants`, `employees` | read + lock | `trg_validate_truck_schedule` |
| 2b | `audit_log` | **INSERT** | `trg_audit_row` on `truck_schedules` |
| 3 | `deliveries` | **INSERT** (`status='Scheduled'`) | manual one-statement insert |
| 3a | `audit_log` | **INSERT** | `trg_audit_row` on `deliveries` |
| 4 | `deliveries` | **UPDATE** (`status='Completed'`, `delivered_at`) | `complete_delivery()` |
| 4a | `orders` | **UPDATE** (`status='Delivered'`) | `trg_delivery_complete_order` |
| 4b | `order_status_history` | **INSERT** | `trg_log_order_status_change` |
| 4c | `inventory_transactions` | **INSERT** (1 row per product, negative `change_qty`, `delivery_id` FK — **new v3**) | `complete_delivery()` body |
| 4d | `store_inventory` | **UPDATE** (quantity decremented — **now correct in v3**) | `trg_apply_inventory_transaction` |
| 4e | `audit_log` | **INSERT** ×2 | `trg_audit_row` on `deliveries` and `orders` |

**Worked example (continuing order 47 from v2).** Once both bookings have arrived and the order is `'At Store'`:

```sql
-- v3: no store_id argument
select schedule_truck_delivery(5, 3, 4, 8, '2026-08-24 09:00:00+00');
-- returns schedule_id = 112 (end_time from routes.max_delivery_time_hours)

insert into deliveries (order_id, truck_schedule_id) values (47, 112) returning delivery_id;
-- returns delivery_id = 205

select complete_delivery(205, 'Delivered to reception, signed by J. Perera.');
```

`truck_schedules` gets one row (all roster checks pass). `deliveries` transitions from `Scheduled` to `Completed`. `orders` status flips to `Delivered`. Additionally — **new in v3** — `inventory_transactions` gets one row per product in the order (e.g. `-10` for detergent, `-4` for tea, both with `delivery_id = 205` and `transaction_type = 'dispatch'`). `store_inventory.quantity_on_hand` is decremented for each via `trg_apply_inventory_transaction`. Stock levels now correctly reflect the goods leaving the store.

### 16.5 Task: Master data maintenance (add / edit / soft-delete)

**v3 change:** `stores` and `employees` are now audited — any change to either table (including soft-delete, name corrections, store reassignments) writes to `audit_log`. This closes the compliance gap noted in v2.

| Step | Table | Operation | Caused by |
|---|---|---|---|
| 1 | the master table | **INSERT** or **UPDATE** | admin action |
| 1a | same table | `updated_at` stamp | `trg_touch_updated_at` |
| 1b | `audit_log` | **INSERT** | `trg_audit_row` — now all 8 soft-delete tables including `stores` and `employees` (v3) |
| — | *(any)* | **DELETE attempted** | `trg_fn_prevent_hard_delete` raises exception |

Additionally, for `drivers` and `assistants`: if the linked `employee_type` does not match, `trg_validate_driver_subtype` / `trg_validate_assistant_subtype` blocks the INSERT before the row is written. If someone tries to change an employee's type while a subtype row exists, `trg_guard_employee_type_change` blocks the UPDATE.

### 16.6 Task: Running a report

No change from v2. All six views are read-only. `v_city_route_sales` (Report 3) joins to `routes` via `orders.route_id` (the snapshot FK), which is unchanged — the view does not need `truck_schedules.store_id` at all, so the column removal has no effect on it.

---

## 17. Normalization status summary (v3)

| Form | Status | Notes |
|---|---|---|
| 1NF | ✅ Passes | All columns atomic, single-column surrogate PKs throughout, no repeating groups. |
| 2NF | ✅ Passes | Single-column surrogate PKs make partial key dependencies structurally impossible. |
| 3NF | ✅ Passes (with one documented exception) | `truck_schedules.store_id` removed. `user_profiles.full_name` removed. `orders.route_id` retained as a named, intentional snapshot — accepted violation, documented in §1 decision 11 and §12. |
| BCNF | ✅ Passes (same exception) | The `orders.route_id` snapshot is the only remaining case where a non-superkey column determines another non-key column. All other functional dependencies flow through superkeys. |

The six intentional denormalisations that remain — `orders.total_value`, `orders.total_space_required`, `train_trips.booked_space`, `store_inventory.quantity_on_hand`, `order_items.line_value`, `order_items.line_space` — are trigger-managed caches, not normalization violations in the transactional sense. They are accepted trade-offs for query performance on high-frequency read paths.
