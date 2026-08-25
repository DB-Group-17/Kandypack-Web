# Kandypack Database Schema — Design & Implementation (v4.0)

> Status: Active
> Authority: Supporting database specification
> Primary source: `Docs/03_architecture.md`
> Last reviewed: 2026-08-25

**Platform:** MySQL 8.0 on Aiven · **App layer:** Next.js · **Auth:** Manual (custom `users` table, bcrypt, JWT)

> **Migrated from:** Supabase (PostgreSQL 15/16) v3.0
> **Migration target:** MySQL 8.0 on Aiven with application-layer authentication

> Version-one reporting does not persist generated files or report jobs; no `report_jobs` table is required.

---

## Changelog: v3 → v4

This version is a **full platform migration** from Supabase (PostgreSQL) to MySQL 8.0 on Aiven,
combined with a replacement of Supabase Auth with a manually implemented authentication system.

### A. New Table Added

| Change | Detail |
|---|---|
| **`users` table added** | Replaces `auth.users` from Supabase. Stores `email`, `password_hash` (bcrypt), `is_active`, `created_at`. Single source of truth for login credentials. |

### B. Table Structure Changes

| Table | Column | Change | Reason |
|---|---|---|---|
| `user_profiles` | `user_id` | `uuid` → `CHAR(36)` | MySQL has no UUID type |
| `user_profiles` | `user_id` FK target | Implicit Supabase ref | Real FK → `users(user_id)` |
| `orders` | `created_by` | `uuid` → `CHAR(36)` | UUID type change |
| `order_status_history` | `changed_by` | `uuid` → `CHAR(36)` | UUID type change |
| `inventory_transactions` | `created_by` | `uuid` → `CHAR(36)` | UUID type change |
| `audit_log` | `user_id` | `uuid` → `CHAR(36)` | UUID type change |
| `audit_log` | `old_data`, `new_data` | `jsonb` → `JSON` | MySQL has no jsonb |
| All tables | `bigint generated always as identity` | → `BIGINT AUTO_INCREMENT` | MySQL identity syntax |
| All tables | `timestamptz` | → `DATETIME` | MySQL TIMESTAMP has 2038 limit |
| All tables | `boolean` | → `TINYINT(1)` | MySQL has no native boolean |
| `citext` columns | `city_name`, `email`, `area_name`, `delivery_area` | → `VARCHAR(…) COLLATE utf8mb4_general_ci` | MySQL has no citext |
| `truck_schedules` | Operating hours CHECK | Rewritten | `TIME()` replaces Postgres time cast |
| `orders` | 7-day CHECK | Rewritten | `DATEDIFF()` replaces Postgres date arithmetic |

### C. Objects Removed (Postgres/Supabase-specific)

| Object | Reason |
|---|---|
| `CREATE EXTENSION citext` | No extensions in MySQL |
| `CREATE EXTENSION pgcrypto` | No extensions in MySQL |
| All `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | MySQL has no RLS |
| All `CREATE POLICY …` (19 policies) | Replaced by API middleware |
| `current_app_role()` DB function | JWT carries the role |
| `current_home_store_id()` DB function | JWT carries the store ID |
| `auth.uid()` — all references | → `@current_user_id` session variable |
| `CREATE TEMP TABLE … ON COMMIT DROP` | → `CREATE TEMPORARY TABLE` + explicit `DROP` |
| `ON CONFLICT … DO UPDATE` | → `INSERT … ON DUPLICATE KEY UPDATE` |
| `RAISE EXCEPTION` | → `SIGNAL SQLSTATE '45000'` |
| `EXECUTE format(…)` dynamic SQL | → split into static SQL per function |
| `RETURNS TABLE (…)` functions | → `PROCEDURE` with result-set SELECT |
| `get_next_available_trip()` standalone function | → inlined into `place_order` procedure |
| `fn_consecutive_chain_length()` generic function | → `fn_driver_chain_length()` + `fn_assistant_chain_length()` |
| Partial unique index `uq_deliveries_active_per_order` | → `BEFORE INSERT` trigger |
| `trg_fn_audit_row()` generic with `tg_argv` | → one dedicated trigger per table |

### D. Objects Rewritten (logic unchanged, syntax changed)

| Object | What changed |
|---|---|
| `trg_fn_touch_updated_at` | plpgsql → MySQL; one trigger per table |
| `trg_fn_prevent_hard_delete` | `RAISE` → `SIGNAL`; one trigger per table |
| `trg_fn_validate_order_date` | `DATEDIFF()` replaces Postgres date arithmetic |
| `trg_fn_maintain_order_totals` | Split into 3 triggers (INS/UPD/DEL) |
| `trg_fn_log_order_status_change` | `auth.uid()` → `@current_user_id` |
| `trg_fn_check_trip_capacity` | `RAISE` → `SIGNAL` + `CONCAT()` |
| `trg_fn_update_trip_booked_space` | Split into 3 triggers (INS/UPD/DEL) |
| `trg_fn_validate_truck_schedule` | `extract(epoch)/3600` → `TIMESTAMPDIFF(SECOND,…)/3600` |
| `trg_fn_delivery_complete_order` | plpgsql → MySQL trigger body |
| `trg_fn_check_inventory_before_dispatch` | `RAISE` → `SIGNAL` |
| `trg_fn_apply_inventory_transaction` | `ON CONFLICT` → `ON DUPLICATE KEY UPDATE` |
| `trg_fn_validate_driver_subtype` | plpgsql → MySQL |
| `trg_fn_validate_assistant_subtype` | plpgsql → MySQL |
| `trg_fn_guard_employee_type_change` | plpgsql → MySQL |
| `place_order()` | Full rewrite as MySQL PROCEDURE; JSON_TABLE; explicit temp DROP |
| `schedule_truck_delivery()` | `make_interval()` → `DATE_ADD(… INTERVAL … SECOND)` |
| `complete_delivery()` | `GET DIAGNOSTICS` → `ROW_COUNT()` |
| All reporting views | `date_trunc` → `DATE_FORMAT`; `extract(epoch)` → `TIMESTAMPDIFF` |

### E. New Trigger Added

| Trigger | Table | Purpose |
|---|---|---|
| `trg_check_active_delivery_on_insert` | `deliveries` | Replaces partial unique index; blocks second active delivery for same order |

---

## ER Diagram Changes: v2 → v4

> Use this section alongside your v2 ERD to update your diagram to v4.

### 1. New Table — `users` *(v4 addition)*

Add a completely new entity **`users`** to your diagram.

```
users
───────────────────────────────────────
PK  user_id        CHAR(36)     DEFAULT (UUID())
    email          VARCHAR(255) UNIQUE NOT NULL
    password_hash  VARCHAR(255) NOT NULL
    is_active      TINYINT(1)   DEFAULT 1
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP
```

**Relationship to add:** Draw a **one-to-one mandatory-optional** line:
`users.user_id` → `user_profiles.user_id`

---

### 2. Table: `user_profiles` — 4 changes

| What to change | v2 state | v4 state | Version |
|---|---|---|---|
| `user_id` data type | `uuid` | `CHAR(36)` | v4 |
| `user_id` FK target | No FK line drawn | **Add FK line** → `users.user_id` | v4 |
| `full_name` column | Present | **DELETE** | v3 |
| `display_name_override` | Not present | **ADD** `VARCHAR(255)` | v3 |
| All `timestamptz` | `timestamptz` | `DATETIME` | v4 |
| All `boolean` | `boolean` | `TINYINT(1)` | v4 |

---

### 3. Table: `truck_schedules` — 1 column removed

| What to change | v2 state | v4 state | Version |
|---|---|---|---|
| `store_id` column | Present + FK → `stores` | **DELETE column and FK line** | v3 |
| All `timestamptz` | `timestamptz` | `DATETIME` | v4 |
| PK type | `bigint identity` | `BIGINT AUTO_INCREMENT` | v4 |

---

### 4. Table: `inventory_transactions` — 3 columns replaced

| What to change | v2 state | v4 state | Version |
|---|---|---|---|
| `reference_table` | Present (`text`) | **DELETE** | v3 |
| `reference_id` | Present (`bigint`, no FK) | **DELETE** | v3 |
| `train_booking_id` | Not present | **ADD** BIGINT FK → `train_bookings` | v3 |
| `delivery_id` | Not present | **ADD** BIGINT FK → `deliveries` | v3 |
| `created_by` type | `uuid` | `CHAR(36)` | v4 |
| FK lines | Polymorphic / no concrete FK | Two concrete FK lines | v3 |

---

### 5. Tables: `orders`, `order_status_history`, `audit_log` — type changes

| Table | Column | Change | Version |
|---|---|---|---|
| `orders` | `created_by` | `uuid` → `CHAR(36)` | v4 |
| `order_status_history` | `changed_by` | `uuid` → `CHAR(36)` | v4 |
| `audit_log` | `user_id` | `uuid` → `CHAR(36)` | v4 |
| `audit_log` | `old_data`, `new_data` | `jsonb` → `JSON` | v4 |

---

### 6. Universal type changes — apply to EVERY entity in the ERD

| Old type (Postgres) | New type (MySQL v4) | Applies to |
|---|---|---|
| `bigint generated always as identity` | `BIGINT AUTO_INCREMENT` | All PKs |
| `bigint` FK columns | `BIGINT` | All FKs |
| `timestamptz` | `DATETIME` | All timestamp columns |
| `boolean` | `TINYINT(1)` | `is_deleted`, `is_active`, `is_origin`, `is_destination` |
| `numeric(p,s)` | `DECIMAL(p,s)` | All money and space columns |
| `citext` | `VARCHAR(255) COLLATE utf8mb4_general_ci` | `city_name`, `email`, `area_name`, `delivery_area` |
| `text` | `VARCHAR(500)` or `TEXT` | General text columns |

---

### 7. Relationship to remove

Remove the partial unique index annotation on `deliveries`.
Note instead: *enforced by trigger `trg_check_active_delivery_on_insert`*.

---

### 8. ERD delta summary

| Action | Entity / Attribute |
|---|---|
| ➕ ADD table | `users` |
| ➕ ADD column | `user_profiles.display_name_override` |
| ➕ ADD column | `inventory_transactions.train_booking_id` (FK) |
| ➕ ADD column | `inventory_transactions.delivery_id` (FK) |
| ➕ ADD FK line | `user_profiles.user_id` → `users.user_id` |
| ➕ ADD FK line | `inventory_transactions.train_booking_id` → `train_bookings` |
| ➕ ADD FK line | `inventory_transactions.delivery_id` → `deliveries` |
| ➖ REMOVE column | `user_profiles.full_name` |
| ➖ REMOVE column | `truck_schedules.store_id` |
| ➖ REMOVE column | `inventory_transactions.reference_table` |
| ➖ REMOVE column | `inventory_transactions.reference_id` |
| ➖ REMOVE FK line | `truck_schedules.store_id` → `stores` |
| ➖ REMOVE FK line | `inventory_transactions.reference_id` → (polymorphic) |
| 🔄 RETYPE all PKs | `bigint identity` → `BIGINT AUTO_INCREMENT` |
| 🔄 RETYPE all timestamps | `timestamptz` → `DATETIME` |
| 🔄 RETYPE all booleans | `boolean` → `TINYINT(1)` |
| 🔄 RETYPE all money/space | `numeric(p,s)` → `DECIMAL(p,s)` |
| 🔄 RETYPE citext columns | → `VARCHAR + utf8mb4_general_ci` |
| 🔄 RETYPE jsonb columns | `jsonb` → `JSON` |
| 🔄 RETYPE uuid columns | `uuid` → `CHAR(36)` |

---

## 0. How to use this document

Run SQL files in the numbered order shown in §10. Connect to Aiven with `ssl-mode=REQUIRED`.
Before any procedure or trigger call, the app must run on the same connection:

```sql
SET @current_user_id  = '<char36-uuid>';
SET @current_app_role = '<role>';
```

---

## 1. Domain decisions (v3 + v4 additions)

All eleven domain decisions from v3 remain. New v4 decisions:

| # | Question | Decision |
|---|---|---|
| 12 | Auth provider | Manual: own `users` table, bcrypt in app layer, JWT from backend. No third-party auth. |
| 13 | UUID storage | `CHAR(36)` with `utf8mb4_bin` collation. Generated by MySQL `UUID()` via column default. |
| 14 | RLS replacement | App-layer enforcement. API routes check role from JWT and inject WHERE filters. No DB-level RLS. |
| 15 | Session variable | `@current_user_id` and `@current_app_role` SET by app before each procedure call. |

---
## 2. Full DDL

### 2.1 — `01_auth.sql` — Authentication (new in v4)

```sql
-- =========================================================
-- 01_auth.sql  (NEW in v4)
-- Replaces Supabase auth.users entirely.
-- Password hashing is done in the application layer (bcrypt).
-- This table only stores the hash — NEVER plaintext.
-- =========================================================

CREATE TABLE users (
    user_id       CHAR(36)     NOT NULL DEFAULT (UUID()),
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_users       PRIMARY KEY (user_id),
    CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 2.2 — `02_master.sql` — Cities, Customers, Products, Stores

```sql
-- =========================================================
-- 02_master.sql
-- v4: bigint identity → BIGINT AUTO_INCREMENT
--     timestamptz → DATETIME  |  boolean → TINYINT(1)
--     citext → VARCHAR with utf8mb4_general_ci
--     Extensions removed (no citext / pgcrypto in MySQL)
-- =========================================================

CREATE TABLE cities (
    city_id        BIGINT       NOT NULL AUTO_INCREMENT,
    city_name      VARCHAR(150) NOT NULL COLLATE utf8mb4_general_ci,
    is_origin      TINYINT(1)   NOT NULL DEFAULT 0,
    is_destination TINYINT(1)   NOT NULL DEFAULT 0,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_cities      PRIMARY KEY (city_id),
    CONSTRAINT uq_cities_name UNIQUE (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
    customer_id        BIGINT       NOT NULL AUTO_INCREMENT,
    customer_name      VARCHAR(255) NOT NULL,
    customer_type      VARCHAR(20)  NOT NULL DEFAULT 'retail',
    phone              VARCHAR(50)  NOT NULL,
    email              VARCHAR(255) COLLATE utf8mb4_general_ci,
    registered_city_id BIGINT,
    address_line       TEXT,
    is_deleted         TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at         DATETIME,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_customers      PRIMARY KEY (customer_id),
    CONSTRAINT chk_customer_type CHECK (customer_type IN ('retail','wholesale')),
    CONSTRAINT fk_customers_city FOREIGN KEY (registered_city_id) REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    product_id      BIGINT        NOT NULL AUTO_INCREMENT,
    sku             VARCHAR(100)  NOT NULL,
    product_name    VARCHAR(255)  NOT NULL,
    category        VARCHAR(100),
    unit_of_measure VARCHAR(50)   NOT NULL DEFAULT 'unit',
    unit_price      DECIMAL(12,2) NOT NULL,
    space_rate      DECIMAL(10,4) NOT NULL,
    is_deleted      TINYINT(1)    NOT NULL DEFAULT 0,
    deleted_at      DATETIME,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_products        PRIMARY KEY (product_id),
    CONSTRAINT uq_products_sku    UNIQUE (sku),
    CONSTRAINT chk_products_price CHECK (unit_price >= 0),
    CONSTRAINT chk_products_space CHECK (space_rate > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stores (
    store_id             BIGINT       NOT NULL AUTO_INCREMENT,
    city_id              BIGINT       NOT NULL,
    store_name           VARCHAR(255) NOT NULL,
    railway_station_name VARCHAR(255),
    address_line         TEXT,
    contact_phone        VARCHAR(50),
    is_deleted           TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at           DATETIME,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_stores      PRIMARY KEY (store_id),
    CONSTRAINT uq_stores_city UNIQUE (city_id),
    CONSTRAINT fk_stores_city FOREIGN KEY (city_id) REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 2.3 — `03_people.sql` — Employees, Drivers, Assistants, Trucks, User Profiles

```sql
-- =========================================================
-- 03_people.sql
-- v3: user_profiles.full_name removed; display_name_override added.
-- v4: uuid → CHAR(36); all type conversions applied;
--     user_profiles.user_id is now FK → users(user_id).
-- =========================================================

CREATE TABLE employees (
    employee_id   BIGINT       NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(255) NOT NULL,
    nic_number    VARCHAR(50)  NOT NULL,
    phone         VARCHAR(50)  NOT NULL,
    email         VARCHAR(255) COLLATE utf8mb4_general_ci,
    hire_date     DATE         NOT NULL DEFAULT (CURRENT_DATE),
    employee_type VARCHAR(50)  NOT NULL,
    home_store_id BIGINT,
    is_deleted    TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at    DATETIME,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_employees       PRIMARY KEY (employee_id),
    CONSTRAINT uq_employees_nic   UNIQUE (nic_number),
    CONSTRAINT chk_employee_type  CHECK (employee_type IN
        ('driver','assistant','store_manager','logistics_manager',
         'fleet_supervisor','order_entry_clerk','system_administrator')),
    CONSTRAINT fk_employees_store FOREIGN KEY (home_store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE drivers (
    driver_id      BIGINT       NOT NULL AUTO_INCREMENT,
    employee_id    BIGINT       NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    license_expiry DATE,
    is_deleted     TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at     DATETIME,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_drivers          PRIMARY KEY (driver_id),
    CONSTRAINT uq_drivers_employee UNIQUE (employee_id),
    CONSTRAINT uq_drivers_license  UNIQUE (license_number),
    CONSTRAINT fk_drivers_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistants (
    assistant_id BIGINT     NOT NULL AUTO_INCREMENT,
    employee_id  BIGINT     NOT NULL,
    is_deleted   TINYINT(1) NOT NULL DEFAULT 0,
    deleted_at   DATETIME,
    created_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_assistants          PRIMARY KEY (assistant_id),
    CONSTRAINT uq_assistants_employee UNIQUE (employee_id),
    CONSTRAINT fk_assistants_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trucks (
    truck_id      BIGINT        NOT NULL AUTO_INCREMENT,
    plate_number  VARCHAR(50)   NOT NULL,
    capacity_kg   DECIMAL(10,2),
    home_store_id BIGINT,
    is_deleted    TINYINT(1)    NOT NULL DEFAULT 0,
    deleted_at    DATETIME,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_trucks       PRIMARY KEY (truck_id),
    CONSTRAINT uq_trucks_plate UNIQUE (plate_number),
    CONSTRAINT fk_trucks_store FOREIGN KEY (home_store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- user_profiles: maps users → employee + business role
-- v3: full_name removed; display_name_override added.
-- v4: user_id is CHAR(36) FK → users(user_id),
--     replacing the implicit Supabase auth.users reference.
-- ---------------------------------------------------------
CREATE TABLE user_profiles (
    user_id               CHAR(36)    NOT NULL,
    employee_id           BIGINT,
    app_role              VARCHAR(50) NOT NULL,
    is_active             TINYINT(1)  NOT NULL DEFAULT 1,
    created_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    display_name_override VARCHAR(255),
    CONSTRAINT pk_user_profiles       PRIMARY KEY (user_id),
    CONSTRAINT uq_user_profiles_emp   UNIQUE (employee_id),
    CONSTRAINT chk_user_profiles_role CHECK (app_role IN
        ('logistics_manager','order_entry_clerk','store_manager',
         'fleet_supervisor','system_administrator')),
    -- display_name_override is only set when employee_id IS NULL
    CONSTRAINT chk_user_profiles_name CHECK (
        (employee_id IS NOT NULL AND display_name_override IS NULL)
        OR (employee_id IS NULL AND display_name_override IS NOT NULL)
    ),
    CONSTRAINT fk_up_user     FOREIGN KEY (user_id)     REFERENCES users(user_id),
    CONSTRAINT fk_up_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 2.4 — `04_routes.sql`

```sql
CREATE TABLE routes (
    route_id                BIGINT       NOT NULL AUTO_INCREMENT,
    store_id                BIGINT       NOT NULL,
    route_name              VARCHAR(255) NOT NULL,
    coverage_description    TEXT,
    max_delivery_time_hours DECIMAL(4,2) NOT NULL,
    is_deleted              TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at              DATETIME,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_routes       PRIMARY KEY (route_id),
    CONSTRAINT chk_routes_time CHECK (max_delivery_time_hours > 0),
    CONSTRAINT fk_routes_store FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE route_coverage_areas (
    coverage_id BIGINT       NOT NULL AUTO_INCREMENT,
    route_id    BIGINT       NOT NULL,
    city_id     BIGINT       NOT NULL,
    area_name   VARCHAR(255) NOT NULL COLLATE utf8mb4_general_ci,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_route_coverage_areas   PRIMARY KEY (coverage_id),
    CONSTRAINT uq_coverage_area_per_city UNIQUE (city_id, area_name),
    CONSTRAINT fk_coverage_route FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE CASCADE,
    CONSTRAINT fk_coverage_city  FOREIGN KEY (city_id)  REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### 2.5 — `05_orders.sql`

```sql
-- v4: uuid → CHAR(36); timestamptz → DATETIME;
--     DATEDIFF() replaces Postgres date arithmetic in CHECK.

CREATE TABLE orders (
    order_id               BIGINT        NOT NULL AUTO_INCREMENT,
    customer_id            BIGINT        NOT NULL,
    delivery_address       TEXT          NOT NULL,
    delivery_area          VARCHAR(255)  NOT NULL COLLATE utf8mb4_general_ci,
    destination_city_id    BIGINT        NOT NULL,
    route_id               BIGINT,
    order_placed_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expected_delivery_date DATE          NOT NULL,
    status                 VARCHAR(30)   NOT NULL DEFAULT 'Pending',
    total_value            DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_space_required   DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_by             CHAR(36),
    created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_orders           PRIMARY KEY (order_id),
    CONSTRAINT chk_orders_status   CHECK (status IN
        ('Pending','In Transit','At Store','Out for Delivery','Delivered','Cancelled')),
    CONSTRAINT chk_orders_value    CHECK (total_value >= 0),
    CONSTRAINT chk_orders_space    CHECK (total_space_required >= 0),
    CONSTRAINT chk_orders_min_lead CHECK (DATEDIFF(expected_delivery_date, DATE(order_placed_at)) >= 7),
    CONSTRAINT fk_orders_customer  FOREIGN KEY (customer_id)         REFERENCES customers(customer_id),
    CONSTRAINT fk_orders_city      FOREIGN KEY (destination_city_id) REFERENCES cities(city_id),
    CONSTRAINT fk_orders_route     FOREIGN KEY (route_id)            REFERENCES routes(route_id),
    CONSTRAINT fk_orders_created   FOREIGN KEY (created_by)          REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_orders_customer          ON orders (customer_id);
CREATE INDEX idx_orders_status            ON orders (status);
CREATE INDEX idx_orders_expected_delivery ON orders (expected_delivery_date);
CREATE INDEX idx_orders_city_placed       ON orders (destination_city_id, order_placed_at);

CREATE TABLE order_items (
    order_item_id       BIGINT        NOT NULL AUTO_INCREMENT,
    order_id            BIGINT        NOT NULL,
    product_id          BIGINT        NOT NULL,
    quantity            DECIMAL(10,2) NOT NULL,
    unit_price_at_order DECIMAL(12,2) NOT NULL,
    space_rate_at_order DECIMAL(10,4) NOT NULL,
    -- Generated columns: identical syntax in MySQL 5.7+
    line_space DECIMAL(10,2) GENERATED ALWAYS AS (quantity * space_rate_at_order) STORED,
    line_value DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price_at_order) STORED,
    CONSTRAINT pk_order_items  PRIMARY KEY (order_item_id),
    CONSTRAINT chk_oi_quantity CHECK (quantity > 0),
    CONSTRAINT chk_oi_price    CHECK (unit_price_at_order >= 0),
    CONSTRAINT chk_oi_space    CHECK (space_rate_at_order > 0),
    CONSTRAINT fk_oi_order     FOREIGN KEY (order_id)   REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_oi_product   FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

CREATE TABLE order_status_history (
    history_id BIGINT      NOT NULL AUTO_INCREMENT,
    order_id   BIGINT      NOT NULL,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by CHAR(36),
    notes      TEXT,
    CONSTRAINT pk_order_status_history PRIMARY KEY (history_id),
    CONSTRAINT fk_osh_order      FOREIGN KEY (order_id)   REFERENCES orders(order_id),
    CONSTRAINT fk_osh_changed_by FOREIGN KEY (changed_by) REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_order_status_history_order ON order_status_history (order_id);
```

---

### 2.6 — `06_train.sql`

```sql
CREATE TABLE train_trips (
    trip_id             BIGINT        NOT NULL AUTO_INCREMENT,
    destination_city_id BIGINT        NOT NULL,
    departure_datetime  DATETIME      NOT NULL,
    arrival_datetime    DATETIME      NOT NULL,
    total_capacity      DECIMAL(10,2) NOT NULL,
    booked_space        DECIMAL(10,2) NOT NULL DEFAULT 0,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Scheduled',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_train_trips      PRIMARY KEY (trip_id),
    CONSTRAINT chk_tt_capacity     CHECK (total_capacity > 0),
    CONSTRAINT chk_tt_booked       CHECK (booked_space >= 0),
    CONSTRAINT chk_tt_arrival      CHECK (arrival_datetime > departure_datetime),
    CONSTRAINT chk_tt_not_overbook CHECK (booked_space <= total_capacity),
    CONSTRAINT chk_tt_status       CHECK (status IN ('Scheduled','Departed','Arrived','Cancelled')),
    CONSTRAINT fk_tt_city FOREIGN KEY (destination_city_id) REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_train_trips_dest_departure ON train_trips (destination_city_id, departure_datetime);

CREATE TABLE train_bookings (
    booking_id   BIGINT        NOT NULL AUTO_INCREMENT,
    trip_id      BIGINT        NOT NULL,
    order_id     BIGINT        NOT NULL,
    space_booked DECIMAL(10,2) NOT NULL,
    booked_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_train_bookings PRIMARY KEY (booking_id),
    CONSTRAINT chk_tb_space CHECK (space_booked > 0),
    CONSTRAINT fk_tb_trip  FOREIGN KEY (trip_id)  REFERENCES train_trips(trip_id),
    CONSTRAINT fk_tb_order FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_train_bookings_trip  ON train_bookings (trip_id);
CREATE INDEX idx_train_bookings_order ON train_bookings (order_id);

CREATE TABLE train_booking_items (
    booking_item_id  BIGINT        NOT NULL AUTO_INCREMENT,
    booking_id       BIGINT        NOT NULL,
    order_item_id    BIGINT        NOT NULL,
    quantity_shipped DECIMAL(10,2) NOT NULL,
    space_consumed   DECIMAL(10,2) NOT NULL,
    CONSTRAINT pk_train_booking_items PRIMARY KEY (booking_item_id),
    CONSTRAINT chk_tbi_qty   CHECK (quantity_shipped > 0),
    CONSTRAINT chk_tbi_space CHECK (space_consumed > 0),
    CONSTRAINT fk_tbi_booking    FOREIGN KEY (booking_id)    REFERENCES train_bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT fk_tbi_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_booking_items_booking    ON train_booking_items (booking_id);
CREATE INDEX idx_booking_items_order_item ON train_booking_items (order_item_id);
```

---

### 2.7 — `07_inventory.sql`

```sql
-- v3: reference_table/reference_id replaced by typed FK columns.
-- v4: timestamptz → DATETIME; uuid → CHAR(36); identity → AUTO_INCREMENT.
-- NOTE: delivery_id FK is closed after 08_fleet.sql via ALTER TABLE.

CREATE TABLE store_inventory (
    inventory_id     BIGINT        NOT NULL AUTO_INCREMENT,
    store_id         BIGINT        NOT NULL,
    product_id       BIGINT        NOT NULL,
    quantity_on_hand DECIMAL(12,2) NOT NULL DEFAULT 0,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_store_inventory               PRIMARY KEY (inventory_id),
    CONSTRAINT uq_store_inventory_store_product UNIQUE (store_id, product_id),
    CONSTRAINT chk_si_qty    CHECK (quantity_on_hand >= 0),
    CONSTRAINT fk_si_store   FOREIGN KEY (store_id)   REFERENCES stores(store_id),
    CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_store_inventory_store ON store_inventory (store_id);

CREATE TABLE inventory_transactions (
    transaction_id   BIGINT        NOT NULL AUTO_INCREMENT,
    store_id         BIGINT        NOT NULL,
    product_id       BIGINT        NOT NULL,
    change_qty       DECIMAL(12,2) NOT NULL,
    transaction_type VARCHAR(20)   NOT NULL,
    -- v3: typed FK columns replace polymorphic reference_table/reference_id
    train_booking_id BIGINT,
    delivery_id      BIGINT,        -- FK closed in 08_fleet.sql
    created_by       CHAR(36),
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_inventory_transactions PRIMARY KEY (transaction_id),
    CONSTRAINT chk_it_type CHECK (transaction_type IN ('receive','dispatch','adjustment')),
    CONSTRAINT chk_it_fk_consistency CHECK (
        (transaction_type = 'receive'    AND train_booking_id IS NOT NULL AND delivery_id IS NULL)
        OR (transaction_type = 'dispatch'   AND delivery_id IS NOT NULL AND train_booking_id IS NULL)
        OR (transaction_type = 'adjustment' AND train_booking_id IS NULL AND delivery_id IS NULL)
    ),
    CONSTRAINT fk_it_store   FOREIGN KEY (store_id)         REFERENCES stores(store_id),
    CONSTRAINT fk_it_product FOREIGN KEY (product_id)       REFERENCES products(product_id),
    CONSTRAINT fk_it_booking FOREIGN KEY (train_booking_id) REFERENCES train_bookings(booking_id),
    CONSTRAINT fk_it_created FOREIGN KEY (created_by)       REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_inventory_txn_store_product ON inventory_transactions (store_id, product_id);
CREATE INDEX idx_inventory_txn_booking       ON inventory_transactions (train_booking_id);
CREATE INDEX idx_inventory_txn_delivery      ON inventory_transactions (delivery_id);
```

---

### 2.8 — `08_fleet.sql`

```sql
-- v3: store_id removed from truck_schedules (3NF fix).
-- v3: partial unique index on deliveries → replaced by trigger.
-- v4: timestamptz → DATETIME; operating-hours CHECK uses TIME().

CREATE TABLE truck_schedules (
    schedule_id  BIGINT      NOT NULL AUTO_INCREMENT,
    truck_id     BIGINT      NOT NULL,
    driver_id    BIGINT      NOT NULL,
    assistant_id BIGINT      NOT NULL,
    route_id     BIGINT      NOT NULL,
    -- store_id removed in v3: derive via route_id → routes.store_id
    start_time   DATETIME    NOT NULL,
    end_time     DATETIME    NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_truck_schedules     PRIMARY KEY (schedule_id),
    CONSTRAINT chk_ts_status          CHECK (status IN ('Scheduled','In Progress','Completed','Cancelled')),
    CONSTRAINT chk_ts_end_after_start CHECK (end_time > start_time),
    -- Operating hours 06:00–20:00 same calendar day (MySQL syntax)
    CONSTRAINT chk_ts_operating_hours CHECK (
        TIME(start_time) >= '06:00:00'
        AND TIME(end_time) <= '20:00:00'
        AND DATE(start_time) = DATE(end_time)
    ),
    CONSTRAINT fk_ts_truck     FOREIGN KEY (truck_id)     REFERENCES trucks(truck_id),
    CONSTRAINT fk_ts_driver    FOREIGN KEY (driver_id)    REFERENCES drivers(driver_id),
    CONSTRAINT fk_ts_assistant FOREIGN KEY (assistant_id) REFERENCES assistants(assistant_id),
    CONSTRAINT fk_ts_route     FOREIGN KEY (route_id)     REFERENCES routes(route_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_truck_schedules_truck_time     ON truck_schedules (truck_id, start_time, end_time);
CREATE INDEX idx_truck_schedules_driver_time    ON truck_schedules (driver_id, start_time, end_time);
CREATE INDEX idx_truck_schedules_assistant_time ON truck_schedules (assistant_id, start_time, end_time);
CREATE INDEX idx_truck_schedules_start_end      ON truck_schedules (start_time, end_time);

CREATE TABLE deliveries (
    delivery_id       BIGINT      NOT NULL AUTO_INCREMENT,
    order_id          BIGINT      NOT NULL,
    truck_schedule_id BIGINT      NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    delivered_at      DATETIME,
    notes             TEXT,
    exception_reason  TEXT,
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_deliveries   PRIMARY KEY (delivery_id),
    CONSTRAINT chk_del_status  CHECK (status IN ('Scheduled','In Progress','Completed','Failed')),
    CONSTRAINT fk_del_order    FOREIGN KEY (order_id)          REFERENCES orders(order_id),
    CONSTRAINT fk_del_schedule FOREIGN KEY (truck_schedule_id) REFERENCES truck_schedules(schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_deliveries_order    ON deliveries (order_id);
CREATE INDEX idx_deliveries_schedule ON deliveries (truck_schedule_id);

-- Close the circular FK: inventory_transactions.delivery_id → deliveries
ALTER TABLE inventory_transactions
    ADD CONSTRAINT fk_it_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(delivery_id);
```

---

### 2.9 — `09_audit.sql`

```sql
-- v4: jsonb → JSON; uuid → CHAR(36); timestamptz → DATETIME.

CREATE TABLE audit_log (
    log_id     BIGINT       NOT NULL AUTO_INCREMENT,
    table_name VARCHAR(100) NOT NULL,
    record_id  BIGINT,
    action     VARCHAR(10)  NOT NULL,
    user_id    CHAR(36),
    old_data   JSON,
    new_data   JSON,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_audit_log PRIMARY KEY (log_id),
    CONSTRAINT chk_al_action CHECK (action IN ('INSERT','UPDATE','DELETE')),
    CONSTRAINT fk_al_user   FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_created_at   ON audit_log (created_at);
```

---

## 3. Indexing Summary

| Index | Why |
|---|---|
| `idx_train_trips_dest_departure` | `place_order` filters by city + departure |
| `idx_orders_status/expected_delivery/city_placed` | Order-list and report queries |
| `idx_truck_schedules_truck/driver/assistant_time` | Overlap checks in `trg_validate_truck_schedule` |
| `uq_coverage_area_per_city` (unique) | Route lookup in `place_order` |
| `idx_store_inventory_store` | Store Inventory screen |
| `idx_inventory_txn_store_product` | Stock movement history |
| `idx_inventory_txn_booking` | Trace receive → train booking |
| `idx_inventory_txn_delivery` | Trace dispatch → delivery |
| `idx_audit_log_table_record/created_at` | Audit lookups |

---
## 4. Functions — `10_functions.sql`

`sql
DELIMITER ``

CREATE FUNCTION fn_week_start(p_ts DATETIME)
RETURNS DATETIME DETERMINISTIC
BEGIN
    RETURN DATE_FORMAT(
        DATE_SUB(p_ts, INTERVAL ((DAYOFWEEK(p_ts) + 5) % 7) DAY),
        '%Y-%m-%d 00:00:00');
END``

CREATE FUNCTION calculate_order_space(p_order_id BIGINT)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT COALESCE(SUM(quantity * space_rate_at_order),0) INTO v FROM order_items WHERE order_id=p_order_id;
    RETURN v;
END``

CREATE FUNCTION get_available_capacity(p_trip_id BIGINT)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT (total_capacity - booked_space) INTO v FROM train_trips WHERE trip_id=p_trip_id;
    RETURN v;
END``

CREATE FUNCTION get_driver_weekly_hours(p_driver_id BIGINT, p_week_start DATETIME)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND,ts.start_time,ts.end_time)/3600.0),0) INTO v
      FROM truck_schedules ts
     WHERE ts.driver_id=p_driver_id AND ts.status<>'Cancelled'
       AND ts.start_time >= fn_week_start(p_week_start)
       AND ts.start_time <  DATE_ADD(fn_week_start(p_week_start), INTERVAL 7 DAY);
    RETURN v;
END``

CREATE FUNCTION get_assistant_weekly_hours(p_assistant_id BIGINT, p_week_start DATETIME)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND,ts.start_time,ts.end_time)/3600.0),0) INTO v
      FROM truck_schedules ts
     WHERE ts.assistant_id=p_assistant_id AND ts.status<>'Cancelled'
       AND ts.start_time >= fn_week_start(p_week_start)
       AND ts.start_time <  DATE_ADD(fn_week_start(p_week_start), INTERVAL 7 DAY);
    RETURN v;
END``

-- fn_driver_chain_length: replaces fn_consecutive_chain_length('driver_id',...)
-- Drivers: chain must be <= 1 (no back-to-back allowed)
CREATE FUNCTION fn_driver_chain_length(p_driver_id BIGINT, p_new_start DATETIME, p_new_end DATETIME)
RETURNS INT READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v_chain INT DEFAULT 1;
    DECLARE v_cs DATETIME DEFAULT p_new_start;
    DECLARE v_ce DATETIME DEFAULT p_new_end;
    DECLARE v_ps DATETIME DEFAULT NULL;
    DECLARE v_pe DATETIME DEFAULT NULL;
    DECLARE v_ns DATETIME DEFAULT NULL;
    DECLARE v_ne DATETIME DEFAULT NULL;
    chain_back: LOOP
        SET v_ps = NULL;
        SELECT start_time,end_time INTO v_ps,v_pe FROM truck_schedules
         WHERE driver_id=p_driver_id AND status<>'Cancelled'
           AND end_time <= v_cs AND end_time > DATE_SUB(v_cs, INTERVAL 2 HOUR)
         ORDER BY end_time DESC LIMIT 1;
        IF v_ps IS NULL THEN LEAVE chain_back; END IF;
        SET v_chain=v_chain+1; SET v_cs=v_ps;
    END LOOP;
    SET v_ce=p_new_end;
    chain_fwd: LOOP
        SET v_ns=NULL;
        SELECT start_time,end_time INTO v_ns,v_ne FROM truck_schedules
         WHERE driver_id=p_driver_id AND status<>'Cancelled'
           AND start_time >= v_ce AND start_time < DATE_ADD(v_ce, INTERVAL 2 HOUR)
         ORDER BY start_time ASC LIMIT 1;
        IF v_ns IS NULL THEN LEAVE chain_fwd; END IF;
        SET v_chain=v_chain+1; SET v_ce=v_ne;
    END LOOP;
    RETURN v_chain;
END``

-- fn_assistant_chain_length: Assistants: chain must be <= 2
CREATE FUNCTION fn_assistant_chain_length(p_assistant_id BIGINT, p_new_start DATETIME, p_new_end DATETIME)
RETURNS INT READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v_chain INT DEFAULT 1;
    DECLARE v_cs DATETIME DEFAULT p_new_start;
    DECLARE v_ce DATETIME DEFAULT p_new_end;
    DECLARE v_ps DATETIME DEFAULT NULL;
    DECLARE v_pe DATETIME DEFAULT NULL;
    DECLARE v_ns DATETIME DEFAULT NULL;
    DECLARE v_ne DATETIME DEFAULT NULL;
    chain_back: LOOP
        SET v_ps=NULL;
        SELECT start_time,end_time INTO v_ps,v_pe FROM truck_schedules
         WHERE assistant_id=p_assistant_id AND status<>'Cancelled'
           AND end_time <= v_cs AND end_time > DATE_SUB(v_cs, INTERVAL 2 HOUR)
         ORDER BY end_time DESC LIMIT 1;
        IF v_ps IS NULL THEN LEAVE chain_back; END IF;
        SET v_chain=v_chain+1; SET v_cs=v_ps;
    END LOOP;
    SET v_ce=p_new_end;
    chain_fwd: LOOP
        SET v_ns=NULL;
        SELECT start_time,end_time INTO v_ns,v_ne FROM truck_schedules
         WHERE assistant_id=p_assistant_id AND status<>'Cancelled'
           AND start_time >= v_ce AND start_time < DATE_ADD(v_ce, INTERVAL 2 HOUR)
         ORDER BY start_time ASC LIMIT 1;
        IF v_ns IS NULL THEN LEAVE chain_fwd; END IF;
        SET v_chain=v_chain+1; SET v_ce=v_ne;
    END LOOP;
    RETURN v_chain;
END``

CREATE FUNCTION get_user_display_name(p_user_id CHAR(36))
RETURNS VARCHAR(255) READS SQL DATA SQL SECURITY DEFINER
BEGIN
    DECLARE v VARCHAR(255);
    SELECT COALESCE(e.full_name, up.display_name_override) INTO v
      FROM user_profiles up LEFT JOIN employees e ON e.employee_id=up.employee_id
     WHERE up.user_id=p_user_id;
    RETURN v;
END``

DELIMITER ;
`

## 5. Triggers

### 5.1 — `11_trg_generic.sql`

```sql
DELIMITER $$
-- updated_at: one per table (cannot share trigger functions in MySQL)
CREATE TRIGGER trg_touch_updated_at_customers    BEFORE UPDATE ON customers    FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_products     BEFORE UPDATE ON products     FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_stores       BEFORE UPDATE ON stores       FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_employees    BEFORE UPDATE ON employees    FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_drivers      BEFORE UPDATE ON drivers      FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_assistants   BEFORE UPDATE ON assistants   FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_trucks       BEFORE UPDATE ON trucks       FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_routes       BEFORE UPDATE ON routes       FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_orders       BEFORE UPDATE ON orders       FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_train_trips  BEFORE UPDATE ON train_trips  FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_truck_schedules BEFORE UPDATE ON truck_schedules FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$
CREATE TRIGGER trg_touch_updated_at_deliveries   BEFORE UPDATE ON deliveries   FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END$$

-- Hard-delete prevention: RAISE EXCEPTION -> SIGNAL
CREATE TRIGGER trg_prevent_hard_delete_customers  BEFORE DELETE ON customers  FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on customers. Use is_deleted=1.'; END$$
CREATE TRIGGER trg_prevent_hard_delete_products   BEFORE DELETE ON products   FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on products. Use is_deleted=1.'; END$$
CREATE TRIGGER trg_prevent_hard_delete_stores     BEFORE DELETE ON stores     FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on stores. Use is_deleted=1.'; END$$
CREATE TRIGGER trg_prevent_hard_delete_employees  BEFORE DELETE ON employees  FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on employees. Use is_deleted=1.'; END$$
CREATE TRIGGER trg_prevent_hard_delete_drivers    BEFORE DELETE ON drivers    FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on drivers. Use is_deleted=1.'; END$$
CREATE TRIGGER trg_prevent_hard_delete_assistants BEFORE DELETE ON assistants FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on assistants. Use is_deleted=1.'; END$$
CREATE TRIGGER trg_prevent_hard_delete_trucks     BEFORE DELETE ON trucks     FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on trucks. Use is_deleted=1.'; END$$
CREATE TRIGGER trg_prevent_hard_delete_routes     BEFORE DELETE ON routes     FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on routes. Use is_deleted=1.'; END$$
DELIMITER ;
```

---

### 5.2 — `12_trg_orders_train.sql`

```sql
-- auth.uid() -> @current_user_id; multi-event triggers split into per-event triggers.
DELIMITER $$

CREATE TRIGGER trg_validate_order_date BEFORE INSERT ON orders FOR EACH ROW
BEGIN
    IF DATEDIFF(NEW.expected_delivery_date, DATE(NEW.order_placed_at)) < 7 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'expected_delivery_date must be >= 7 days after order date.';
    END IF;
END$$

CREATE TRIGGER trg_snapshot_order_item_prices BEFORE INSERT ON order_items FOR EACH ROW
BEGIN
    DECLARE v_price DECIMAL(12,2); DECLARE v_space DECIMAL(10,4);
    SELECT unit_price, space_rate INTO v_price, v_space FROM products WHERE product_id=NEW.product_id;
    IF v_price IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Product not found.'; END IF;
    IF NEW.unit_price_at_order IS NULL THEN SET NEW.unit_price_at_order=v_price; END IF;
    IF NEW.space_rate_at_order IS NULL THEN SET NEW.space_rate_at_order=v_space; END IF;
END$$

CREATE TRIGGER trg_maintain_order_totals_ins AFTER INSERT ON order_items FOR EACH ROW
BEGIN
    UPDATE orders SET
        total_value=(SELECT COALESCE(SUM(line_value),0) FROM order_items WHERE order_id=NEW.order_id),
        total_space_required=(SELECT COALESCE(SUM(line_space),0) FROM order_items WHERE order_id=NEW.order_id)
    WHERE order_id=NEW.order_id;
END$$

CREATE TRIGGER trg_maintain_order_totals_upd AFTER UPDATE ON order_items FOR EACH ROW
BEGIN
    UPDATE orders SET
        total_value=(SELECT COALESCE(SUM(line_value),0) FROM order_items WHERE order_id=NEW.order_id),
        total_space_required=(SELECT COALESCE(SUM(line_space),0) FROM order_items WHERE order_id=NEW.order_id)
    WHERE order_id=NEW.order_id;
END$$

CREATE TRIGGER trg_maintain_order_totals_del AFTER DELETE ON order_items FOR EACH ROW
BEGIN
    UPDATE orders SET
        total_value=(SELECT COALESCE(SUM(line_value),0) FROM order_items WHERE order_id=OLD.order_id),
        total_space_required=(SELECT COALESCE(SUM(line_space),0) FROM order_items WHERE order_id=OLD.order_id)
    WHERE order_id=OLD.order_id;
END$$

-- auth.uid() -> @current_user_id
CREATE TRIGGER trg_log_order_status_change AFTER UPDATE ON orders FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status THEN
        INSERT INTO order_status_history (order_id,old_status,new_status,changed_by)
        VALUES (NEW.order_id,OLD.status,NEW.status,@current_user_id);
    END IF;
END$$

CREATE TRIGGER trg_check_trip_capacity BEFORE INSERT ON train_bookings FOR EACH ROW
BEGIN
    DECLARE v_cap DECIMAL(10,2); DECLARE v_bk DECIMAL(10,2); DECLARE v_msg VARCHAR(300);
    SELECT total_capacity,booked_space INTO v_cap,v_bk FROM train_trips WHERE trip_id=NEW.trip_id FOR UPDATE;
    IF v_cap IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Train trip does not exist.'; END IF;
    IF v_bk+NEW.space_booked > v_cap THEN
        SET v_msg=CONCAT('Booking rejected: trip ',NEW.trip_id,' has ',(v_cap-v_bk),' free, requested ',NEW.space_booked,'.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;
END$$

CREATE TRIGGER trg_update_trip_booked_space_ins AFTER INSERT ON train_bookings FOR EACH ROW
BEGIN UPDATE train_trips SET booked_space=booked_space+NEW.space_booked WHERE trip_id=NEW.trip_id; END$$

CREATE TRIGGER trg_update_trip_booked_space_upd AFTER UPDATE ON train_bookings FOR EACH ROW
BEGIN UPDATE train_trips SET booked_space=booked_space-OLD.space_booked+NEW.space_booked WHERE trip_id=NEW.trip_id; END$$

CREATE TRIGGER trg_update_trip_booked_space_del AFTER DELETE ON train_bookings FOR EACH ROW
BEGIN UPDATE train_trips SET booked_space=booked_space-OLD.space_booked WHERE trip_id=OLD.trip_id; END$$

DELIMITER ;
```

---

### 5.3 — `13_trg_truck_schedule.sql`

```sql
-- extract(epoch)/3600 -> TIMESTAMPDIFF(SECOND,...)/3600
-- fn_consecutive_chain_length -> fn_driver/assistant_chain_length
DELIMITER $$

CREATE TRIGGER trg_validate_truck_schedule BEFORE INSERT ON truck_schedules FOR EACH ROW
BEGIN
    DECLARE v_cid BIGINT DEFAULT NULL; DECLARE v_cs DATETIME; DECLARE v_ce DATETIME;
    DECLARE v_dc INT; DECLARE v_ac INT;
    DECLARE v_dh DECIMAL(10,2); DECLARE v_ah DECIMAL(10,2); DECLARE v_nh DECIMAL(10,2);
    DECLARE v_dn VARCHAR(255); DECLARE v_an VARCHAR(255); DECLARE v_msg VARCHAR(500);

    SELECT schedule_id INTO @_lock FROM truck_schedules
     WHERE (truck_id=NEW.truck_id OR driver_id=NEW.driver_id OR assistant_id=NEW.assistant_id)
       AND status<>'Cancelled' ORDER BY schedule_id FOR UPDATE;

    -- 1) Truck overlap
    SELECT schedule_id,start_time,end_time INTO v_cid,v_cs,v_ce FROM truck_schedules
     WHERE truck_id=NEW.truck_id AND status<>'Cancelled'
       AND start_time<NEW.end_time AND end_time>NEW.start_time LIMIT 1;
    IF v_cid IS NOT NULL THEN
        SET v_msg=CONCAT('Truck ',NEW.truck_id,' already booked ',v_cs,' to ',v_ce,' (sched ',v_cid,').');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 2) Driver overlap
    SET v_cid=NULL;
    SELECT schedule_id,start_time,end_time INTO v_cid,v_cs,v_ce FROM truck_schedules
     WHERE driver_id=NEW.driver_id AND status<>'Cancelled'
       AND start_time<NEW.end_time AND end_time>NEW.start_time LIMIT 1;
    IF v_cid IS NOT NULL THEN
        SET v_msg=CONCAT('Driver ',NEW.driver_id,' already booked ',v_cs,' to ',v_ce,' (sched ',v_cid,').');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 3) Assistant overlap
    SET v_cid=NULL;
    SELECT schedule_id,start_time,end_time INTO v_cid,v_cs,v_ce FROM truck_schedules
     WHERE assistant_id=NEW.assistant_id AND status<>'Cancelled'
       AND start_time<NEW.end_time AND end_time>NEW.start_time LIMIT 1;
    IF v_cid IS NOT NULL THEN
        SET v_msg=CONCAT('Assistant ',NEW.assistant_id,' already booked ',v_cs,' to ',v_ce,' (sched ',v_cid,').');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 4) Driver consecutive rule (BR-004): chain <= 1
    SET v_dc=fn_driver_chain_length(NEW.driver_id,NEW.start_time,NEW.end_time);
    IF v_dc > 1 THEN
        SELECT e.full_name INTO v_dn FROM drivers d JOIN employees e ON e.employee_id=d.employee_id WHERE d.driver_id=NEW.driver_id;
        SET v_msg=CONCAT('Driver ',NEW.driver_id,' (',v_dn,') would have back-to-back delivery with <2h break.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 5) Assistant max-two-consecutive rule (BR-005): chain <= 2
    SET v_ac=fn_assistant_chain_length(NEW.assistant_id,NEW.start_time,NEW.end_time);
    IF v_ac > 2 THEN
        SELECT e.full_name INTO v_an FROM assistants a JOIN employees e ON e.employee_id=a.employee_id WHERE a.assistant_id=NEW.assistant_id;
        SET v_msg=CONCAT('Assistant ',NEW.assistant_id,' (',v_an,') on ',v_ac,' consecutive routes (max 2).');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 6) Driver weekly 40h limit (BR-006)
    SET v_nh=TIMESTAMPDIFF(SECOND,NEW.start_time,NEW.end_time)/3600.0;
    SET v_dh=get_driver_weekly_hours(NEW.driver_id,NEW.start_time);
    IF v_dh+v_nh > 40 THEN
        SELECT e.full_name INTO v_dn FROM drivers d JOIN employees e ON e.employee_id=d.employee_id WHERE d.driver_id=NEW.driver_id;
        SET v_msg=CONCAT('Driver ',NEW.driver_id,' (',v_dn,') exceeds 40h limit (already ',ROUND(v_dh,2),'h + ',ROUND(v_nh,2),'h).');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 7) Assistant weekly 60h limit (BR-007)
    SET v_ah=get_assistant_weekly_hours(NEW.assistant_id,NEW.start_time);
    IF v_ah+v_nh > 60 THEN
        SELECT e.full_name INTO v_an FROM assistants a JOIN employees e ON e.employee_id=a.employee_id WHERE a.assistant_id=NEW.assistant_id;
        SET v_msg=CONCAT('Assistant ',NEW.assistant_id,' (',v_an,') exceeds 60h limit (already ',ROUND(v_ah,2),'h + ',ROUND(v_nh,2),'h).');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;
END$$

DELIMITER ;
```

---

### 5.4 — `14_trg_delivery_inventory.sql`

```sql
-- NEW: trg_check_active_delivery_on_insert replaces Postgres partial unique index
-- ON CONFLICT -> ON DUPLICATE KEY UPDATE
DELIMITER $$

CREATE TRIGGER trg_check_active_delivery_on_insert BEFORE INSERT ON deliveries FOR EACH ROW
BEGIN
    DECLARE v_ex INT DEFAULT 0; DECLARE v_msg VARCHAR(200);
    SELECT COUNT(*) INTO v_ex FROM deliveries
     WHERE order_id=NEW.order_id AND status IN ('Scheduled','In Progress');
    IF v_ex > 0 THEN
        SET v_msg=CONCAT('Delivery rejected: order ',NEW.order_id,' already has an active delivery.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;
END$$

CREATE TRIGGER trg_delivery_complete_order BEFORE UPDATE ON deliveries FOR EACH ROW
BEGIN
    IF NEW.status='Completed' AND OLD.status<>'Completed' THEN
        IF NEW.delivered_at IS NULL THEN SET NEW.delivered_at=NOW(); END IF;
        UPDATE orders SET status='Delivered' WHERE order_id=NEW.order_id;
    END IF;
END$$

CREATE TRIGGER trg_check_inventory_before_dispatch BEFORE INSERT ON inventory_transactions FOR EACH ROW
BEGIN
    DECLARE v_oh DECIMAL(12,2) DEFAULT 0; DECLARE v_msg VARCHAR(300);
    IF NEW.transaction_type='dispatch' THEN
        SELECT COALESCE(quantity_on_hand,0) INTO v_oh FROM store_inventory
         WHERE store_id=NEW.store_id AND product_id=NEW.product_id FOR UPDATE;
        IF v_oh+NEW.change_qty < 0 THEN
            SET v_msg=CONCAT('Dispatch rejected: store ',NEW.store_id,' has ',v_oh,' units of product ',NEW.product_id,', cannot dispatch ',ABS(NEW.change_qty),'.');
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;
    END IF;
END$$

CREATE TRIGGER trg_apply_inventory_transaction AFTER INSERT ON inventory_transactions FOR EACH ROW
BEGIN
    INSERT INTO store_inventory (store_id,product_id,quantity_on_hand,updated_at)
    VALUES (NEW.store_id,NEW.product_id,NEW.change_qty,NOW())
    ON DUPLICATE KEY UPDATE quantity_on_hand=quantity_on_hand+NEW.change_qty, updated_at=NOW();
END$$

DELIMITER ;
```

---

### 5.5 — `15_trg_audit.sql` (pattern shown for key tables)

```sql
-- Each audited table gets 3 triggers (INS/UPD/DEL).
-- auth.uid() -> @current_user_id; to_jsonb() -> JSON_OBJECT().
-- Tables: orders, order_items, truck_schedules, deliveries, train_bookings,
--   customers, products, stores, employees, drivers, assistants, trucks, routes.
DELIMITER $$

CREATE TRIGGER trg_audit_orders_ins AFTER INSERT ON orders FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('orders',NEW.order_id,'INSERT',@current_user_id,
        JSON_OBJECT('order_id',NEW.order_id,'customer_id',NEW.customer_id,'status',NEW.status,'total_value',NEW.total_value));
END$$
CREATE TRIGGER trg_audit_orders_upd AFTER UPDATE ON orders FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('orders',NEW.order_id,'UPDATE',@current_user_id,
        JSON_OBJECT('status',OLD.status,'total_value',OLD.total_value),
        JSON_OBJECT('status',NEW.status,'total_value',NEW.total_value));
END$$
CREATE TRIGGER trg_audit_orders_del AFTER DELETE ON orders FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data)
    VALUES('orders',OLD.order_id,'DELETE',@current_user_id,
        JSON_OBJECT('order_id',OLD.order_id,'status',OLD.status));
END$$

-- Repeat identical INS/UPD/DEL pattern for:
-- customers, products, stores, employees, drivers, assistants, trucks, routes,
-- order_items, truck_schedules, deliveries, train_bookings
-- substituting the correct table name, PK column, and key business columns.

DELIMITER ;
```

---

### 5.6 — `16_trg_subtype_integrity.sql`

```sql
-- Logic unchanged from v3; plpgsql -> MySQL trigger body.
DELIMITER $$

CREATE TRIGGER trg_validate_driver_subtype BEFORE INSERT ON drivers FOR EACH ROW
BEGIN
    DECLARE v_type VARCHAR(50);
    SELECT employee_type INTO v_type FROM employees WHERE employee_id=NEW.employee_id;
    IF v_type<>'driver' OR v_type IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot create drivers row: employee_type must be ''driver''.';
    END IF;
END$$

CREATE TRIGGER trg_validate_assistant_subtype BEFORE INSERT ON assistants FOR EACH ROW
BEGIN
    DECLARE v_type VARCHAR(50);
    SELECT employee_type INTO v_type FROM employees WHERE employee_id=NEW.employee_id;
    IF v_type<>'assistant' OR v_type IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot create assistants row: employee_type must be ''assistant''.';
    END IF;
END$$

CREATE TRIGGER trg_guard_employee_type_change BEFORE UPDATE ON employees FOR EACH ROW
BEGIN
    DECLARE v_ex INT DEFAULT 0;
    IF NEW.employee_type<>OLD.employee_type THEN
        IF OLD.employee_type='driver' THEN
            SELECT COUNT(*) INTO v_ex FROM drivers WHERE employee_id=OLD.employee_id;
            IF v_ex>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot retype from ''driver'' while drivers row exists.'; END IF;
        END IF;
        IF OLD.employee_type='assistant' THEN
            SELECT COUNT(*) INTO v_ex FROM assistants WHERE employee_id=OLD.employee_id;
            IF v_ex>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot retype from ''assistant'' while assistants row exists.'; END IF;
        END IF;
    END IF;
END$$

DELIMITER ;
```

---

## 6. Stored Procedures

### 6.1 — `17_proc_place_order.sql`

```sql
-- Full rewrite: Postgres FUNCTION -> MySQL PROCEDURE.
-- RETURNS BIGINT -> OUT p_order_id BIGINT
-- jsonb_array_elements() -> JSON_TABLE()
-- CREATE TEMP TABLE ON COMMIT DROP -> CREATE TEMPORARY TABLE + explicit DROP
-- get_next_available_trip() inlined as SELECT ... INTO
-- RAISE EXCEPTION -> SIGNAL; auth.uid() -> @current_user_id

DELIMITER $$

CREATE PROCEDURE place_order(
    IN  p_customer_id            BIGINT,
    IN  p_delivery_address       TEXT,
    IN  p_delivery_area          VARCHAR(255),
    IN  p_destination_city_id    BIGINT,
    IN  p_expected_delivery_date DATE,
    IN  p_items                  JSON,
    IN  p_created_by             CHAR(36),
    IN  p_order_placed_at        DATETIME,
    OUT p_order_id               BIGINT
)
SQL SECURITY DEFINER
BEGIN
    DECLARE v_route_id     BIGINT;
    DECLARE v_search_after DATETIME;
    DECLARE v_trip_id      BIGINT  DEFAULT NULL;
    DECLARE v_trip_depart  DATETIME;
    DECLARE v_avail        DECIMAL(10,2);
    DECLARE v_can_fit      DECIMAL(10,2);
    DECLARE v_line_space   DECIMAL(10,2);
    DECLARE v_bk_space     DECIMAL(10,2);
    DECLARE v_bk_id        BIGINT;
    DECLARE v_any_rem      INT;
    DECLARE v_guard        INT DEFAULT 0;
    DECLARE v_msg          VARCHAR(500);
    DECLARE done           INT DEFAULT 0;

    IF @current_app_role NOT IN ('order_entry_clerk','logistics_manager','system_administrator') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='place_order: role not authorized.';
    END IF;
    IF p_items IS NULL OR JSON_LENGTH(p_items)=0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Order rejected: at least one item required.';
    END IF;

    SELECT route_id INTO v_route_id FROM route_coverage_areas
     WHERE city_id=p_destination_city_id AND area_name=p_delivery_area LIMIT 1;
    IF v_route_id IS NULL THEN
        SET v_msg=CONCAT('No route covers area "',p_delivery_area,'" in city ',p_destination_city_id,'.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    INSERT INTO orders(customer_id,delivery_address,delivery_area,destination_city_id,
                       route_id,order_placed_at,expected_delivery_date,created_by)
    VALUES(p_customer_id,p_delivery_address,p_delivery_area,p_destination_city_id,
           v_route_id,COALESCE(p_order_placed_at,NOW()),p_expected_delivery_date,p_created_by);
    SET p_order_id=LAST_INSERT_ID();

    -- Insert items from JSON array (MySQL 8.0 JSON_TABLE)
    INSERT INTO order_items(order_id,product_id,quantity)
    SELECT p_order_id,jt.product_id,jt.quantity
      FROM JSON_TABLE(p_items,'$[*]' COLUMNS(
               product_id BIGINT       PATH '$.product_id',
               quantity   DECIMAL(10,2) PATH '$.quantity')) AS jt;

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_item_remaining(
        order_item_id BIGINT PRIMARY KEY, remaining_qty DECIMAL(10,2), space_rate DECIMAL(10,4));
    TRUNCATE TABLE tmp_item_remaining;
    INSERT INTO tmp_item_remaining SELECT order_item_id,quantity,space_rate_at_order FROM order_items WHERE order_id=p_order_id;

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_trip_alloc(order_item_id BIGINT, qty DECIMAL(10,2), space DECIMAL(10,2));

    SET v_search_after=COALESCE(p_order_placed_at,NOW());

    -- Overflow-split booking loop (same algorithm as v3, MySQL syntax)
    booking_loop: LOOP
        SET v_guard=v_guard+1;
        IF v_guard>500 THEN
            SET v_msg=CONCAT('Order ',p_order_id,': could not book after 500 trips for city ',p_destination_city_id,'.');
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
        END IF;
        SELECT COUNT(*) INTO v_any_rem FROM tmp_item_remaining WHERE remaining_qty>0;
        IF v_any_rem=0 THEN LEAVE booking_loop; END IF;

        -- Inline get_next_available_trip logic
        SET v_trip_id=NULL;
        SELECT t.trip_id,t.departure_datetime,(t.total_capacity-t.booked_space)
          INTO v_trip_id,v_trip_depart,v_avail
          FROM train_trips t
         WHERE t.destination_city_id=p_destination_city_id
           AND t.departure_datetime>v_search_after
           AND t.status='Scheduled'
           AND (t.total_capacity-t.booked_space)>0
         ORDER BY t.departure_datetime ASC LIMIT 1;
        IF v_trip_id IS NULL THEN
            SET v_msg=CONCAT('Order ',p_order_id,': no trip with capacity to city ',p_destination_city_id,' after ',v_search_after,'.');
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
        END IF;

        TRUNCATE TABLE tmp_trip_alloc;
        -- Allocate items to this trip
        alloc_block: BEGIN
            DECLARE v_oi BIGINT; DECLARE v_rq DECIMAL(10,2); DECLARE v_sr DECIMAL(10,4);
            DECLARE cur CURSOR FOR SELECT order_item_id,remaining_qty,space_rate FROM tmp_item_remaining WHERE remaining_qty>0 ORDER BY order_item_id;
            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done=1;
            SET done=0; OPEN cur;
            item_loop: LOOP
                FETCH cur INTO v_oi,v_rq,v_sr;
                IF done=1 OR v_avail<=0 THEN LEAVE item_loop; END IF;
                SET v_can_fit=FLOOR(LEAST(v_rq,v_avail/v_sr));
                IF v_can_fit>0 THEN
                    SET v_line_space=v_can_fit*v_sr;
                    INSERT INTO tmp_trip_alloc VALUES(v_oi,v_can_fit,v_line_space);
                    UPDATE tmp_item_remaining SET remaining_qty=remaining_qty-v_can_fit WHERE order_item_id=v_oi;
                    SET v_avail=v_avail-v_line_space;
                END IF;
            END LOOP;
            CLOSE cur;
        END;

        SELECT COALESCE(SUM(space),0) INTO v_bk_space FROM tmp_trip_alloc;
        IF v_bk_space>0 THEN
            INSERT INTO train_bookings(trip_id,order_id,space_booked) VALUES(v_trip_id,p_order_id,v_bk_space);
            SET v_bk_id=LAST_INSERT_ID();
            INSERT INTO train_booking_items(booking_id,order_item_id,quantity_shipped,space_consumed)
            SELECT v_bk_id,order_item_id,qty,space FROM tmp_trip_alloc;
        END IF;
        SET v_search_after=v_trip_depart;
    END LOOP;

    -- Explicit temp table cleanup (required in MySQL)
    DROP TEMPORARY TABLE IF EXISTS tmp_item_remaining;
    DROP TEMPORARY TABLE IF EXISTS tmp_trip_alloc;
END$$

DELIMITER ;
```

---

### 6.2 — `18_proc_remaining.sql`

```sql
-- make_interval() -> DATE_ADD(... INTERVAL ... SECOND)
-- GET DIAGNOSTICS -> ROW_COUNT()
-- auth.uid() -> @current_user_id; plpgsql -> MySQL

DELIMITER $$

CREATE PROCEDURE schedule_truck_delivery(
    IN  p_truck_id     BIGINT, IN  p_driver_id    BIGINT,
    IN  p_assistant_id BIGINT, IN  p_route_id     BIGINT,
    IN  p_start_time   DATETIME, OUT p_schedule_id  BIGINT
) SQL SECURITY DEFINER
BEGIN
    DECLARE v_hours DECIMAL(4,2); DECLARE v_end DATETIME; DECLARE v_msg VARCHAR(200);
    IF @current_app_role NOT IN ('fleet_supervisor','system_administrator') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='schedule_truck_delivery: role not authorized.';
    END IF;
    SELECT max_delivery_time_hours INTO v_hours FROM routes WHERE route_id=p_route_id AND is_deleted=0;
    IF v_hours IS NULL THEN
        SET v_msg=CONCAT('Route ',p_route_id,' not found or inactive.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;
    -- make_interval(secs => v_hours*3600) -> DATE_ADD(... INTERVAL ... SECOND)
    SET v_end=DATE_ADD(p_start_time, INTERVAL (v_hours*3600) SECOND);
    INSERT INTO truck_schedules(truck_id,driver_id,assistant_id,route_id,start_time,end_time)
    VALUES(p_truck_id,p_driver_id,p_assistant_id,p_route_id,p_start_time,v_end);
    SET p_schedule_id=LAST_INSERT_ID();
END$$

CREATE PROCEDURE receive_goods_at_store(IN p_booking_id BIGINT, IN p_received_by CHAR(36))
SQL SECURITY DEFINER
BEGIN
    DECLARE v_trip_status VARCHAR(20); DECLARE v_store_id BIGINT;
    DECLARE v_order_id BIGINT; DECLARE v_still INT DEFAULT 0; DECLARE v_msg VARCHAR(300);
    IF @current_app_role NOT IN ('store_manager','system_administrator') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receive_goods_at_store: role not authorized.';
    END IF;
    SELECT t.status,s.store_id,b.order_id INTO v_trip_status,v_store_id,v_order_id
      FROM train_bookings b JOIN train_trips t ON t.trip_id=b.trip_id
      JOIN stores s ON s.city_id=t.destination_city_id WHERE b.booking_id=p_booking_id;
    IF v_order_id IS NULL THEN
        SET v_msg=CONCAT('Booking ',p_booking_id,' not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;
    IF v_trip_status<>'Arrived' THEN
        SET v_msg=CONCAT('Trip for booking ',p_booking_id,' not Arrived (status=',v_trip_status,').');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;
    INSERT INTO inventory_transactions(store_id,product_id,change_qty,transaction_type,train_booking_id,created_by)
    SELECT v_store_id,oi.product_id,bi.quantity_shipped,'receive',p_booking_id,COALESCE(p_received_by,@current_user_id)
      FROM train_booking_items bi JOIN order_items oi ON oi.order_item_id=bi.order_item_id
     WHERE bi.booking_id=p_booking_id;
    SELECT COUNT(*) INTO v_still FROM train_bookings b2 JOIN train_trips t2 ON t2.trip_id=b2.trip_id
     WHERE b2.order_id=v_order_id AND t2.status<>'Arrived';
    IF v_still=0 THEN
        UPDATE orders SET status='At Store' WHERE order_id=v_order_id AND status<>'At Store';
    END IF;
END$$

CREATE PROCEDURE complete_delivery(IN p_delivery_id BIGINT, IN p_notes TEXT)
SQL SECURITY DEFINER
BEGIN
    DECLARE v_rows INT; DECLARE v_order_id BIGINT; DECLARE v_store_id BIGINT; DECLARE v_msg VARCHAR(200);
    IF @current_app_role NOT IN ('fleet_supervisor','logistics_manager','system_administrator') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='complete_delivery: role not authorized.';
    END IF;
    SELECT d.order_id,r.store_id INTO v_order_id,v_store_id
      FROM deliveries d JOIN truck_schedules ts ON ts.schedule_id=d.truck_schedule_id
      JOIN routes r ON r.route_id=ts.route_id WHERE d.delivery_id=p_delivery_id;
    IF v_order_id IS NULL THEN
        SET v_msg=CONCAT('Delivery ',p_delivery_id,' not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;
    UPDATE deliveries SET status='Completed',notes=COALESCE(p_notes,notes)
     WHERE delivery_id=p_delivery_id AND status<>'Completed';
    SET v_rows=ROW_COUNT();   -- GET DIAGNOSTICS -> ROW_COUNT()
    IF v_rows=0 THEN
        SET v_msg=CONCAT('Delivery ',p_delivery_id,' is already Completed.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;
    -- v3: deduct dispatched goods. delivery_id FK for traceability.
    INSERT INTO inventory_transactions(store_id,product_id,change_qty,transaction_type,delivery_id)
    SELECT v_store_id,oi.product_id,-SUM(oi.quantity),'dispatch',p_delivery_id
      FROM order_items oi WHERE oi.order_id=v_order_id GROUP BY oi.product_id;
END$$

DELIMITER ;
```

---

## 7. Reporting Views — `19_reports.sql`

```sql
-- v4: date_trunc('week',…) -> fn_week_start(…)
--     date_trunc('month',…) -> DATE_FORMAT(…,'%Y-%m-01')
--     extract(epoch from …)/3600 -> TIMESTAMPDIFF(SECOND,…)/3600
--     extract(year/quarter from …) -> YEAR() / QUARTER()
--     RANK() OVER (…) and WITH … AS supported in MySQL 8.0

-- Report 1: Quarterly sales (Delivered orders only)
CREATE OR REPLACE VIEW v_quarterly_sales AS
SELECT YEAR(o.order_placed_at) AS sales_year, QUARTER(o.order_placed_at) AS sales_quarter,
    COUNT(DISTINCT o.order_id) AS num_orders, SUM(oi.quantity) AS total_volume, SUM(oi.line_value) AS total_value
FROM orders o JOIN order_items oi ON oi.order_id=o.order_id
WHERE o.status='Delivered'
GROUP BY YEAR(o.order_placed_at), QUARTER(o.order_placed_at);

-- Report 2: Most ordered items per quarter
CREATE OR REPLACE VIEW v_most_ordered_items AS
SELECT YEAR(o.order_placed_at) AS sales_year, QUARTER(o.order_placed_at) AS sales_quarter,
    p.product_id, p.product_name, SUM(oi.quantity) AS total_quantity, SUM(oi.line_value) AS total_value,
    RANK() OVER (
        PARTITION BY YEAR(o.order_placed_at), QUARTER(o.order_placed_at)
        ORDER BY SUM(oi.quantity) DESC
    ) AS quantity_rank
FROM orders o JOIN order_items oi ON oi.order_id=o.order_id JOIN products p ON p.product_id=oi.product_id
WHERE o.status='Delivered'
GROUP BY YEAR(o.order_placed_at), QUARTER(o.order_placed_at), p.product_id, p.product_name;

-- Report 3: City-wise and route-wise sales
CREATE OR REPLACE VIEW v_city_route_sales AS
SELECT c.city_id, c.city_name, r.route_id, r.route_name,
    COUNT(DISTINCT o.order_id) AS num_orders, SUM(oi.quantity) AS total_volume, SUM(oi.line_value) AS total_value
FROM orders o JOIN order_items oi ON oi.order_id=o.order_id
JOIN cities c ON c.city_id=o.destination_city_id LEFT JOIN routes r ON r.route_id=o.route_id
WHERE o.status='Delivered'
GROUP BY c.city_id, c.city_name, r.route_id, r.route_name;

-- Report 4: Driver and assistant working hours
-- fn_week_start() replaces date_trunc('week',…)
-- TIMESTAMPDIFF(SECOND,…)/3600 replaces extract(epoch from …)/3600
CREATE OR REPLACE VIEW v_driver_assistant_hours AS
SELECT 'driver' AS person_role, d.driver_id AS person_id, e.full_name,
    fn_week_start(ts.start_time) AS week_start,
    SUM(TIMESTAMPDIFF(SECOND, ts.start_time, ts.end_time) / 3600.0) AS total_hours,
    40 AS weekly_limit_hours,
    40 - SUM(TIMESTAMPDIFF(SECOND, ts.start_time, ts.end_time) / 3600.0) AS remaining_hours
FROM truck_schedules ts JOIN drivers d ON d.driver_id=ts.driver_id JOIN employees e ON e.employee_id=d.employee_id
WHERE ts.status<>'Cancelled'
GROUP BY d.driver_id, e.full_name, fn_week_start(ts.start_time)
UNION ALL
SELECT 'assistant', a.assistant_id, e.full_name, fn_week_start(ts.start_time),
    SUM(TIMESTAMPDIFF(SECOND, ts.start_time, ts.end_time) / 3600.0), 60,
    60 - SUM(TIMESTAMPDIFF(SECOND, ts.start_time, ts.end_time) / 3600.0)
FROM truck_schedules ts JOIN assistants a ON a.assistant_id=ts.assistant_id JOIN employees e ON e.employee_id=a.employee_id
WHERE ts.status<>'Cancelled'
GROUP BY a.assistant_id, e.full_name, fn_week_start(ts.start_time);

-- Report 5: Truck usage per month
-- DATE_FORMAT(…,'%Y-%m-01') replaces date_trunc('month',…)
CREATE OR REPLACE VIEW v_truck_usage_monthly AS
SELECT t.truck_id, t.plate_number,
    DATE_FORMAT(ts.start_time, '%Y-%m-01') AS usage_month,
    COUNT(*) AS num_schedules,
    SUM(TIMESTAMPDIFF(SECOND, ts.start_time, ts.end_time) / 3600.0) AS total_hours,
    COUNT(DISTINCT ts.route_id) AS distinct_routes_covered
FROM truck_schedules ts JOIN trucks t ON t.truck_id=ts.truck_id
WHERE ts.status<>'Cancelled'
GROUP BY t.truck_id, t.plate_number, DATE_FORMAT(ts.start_time, '%Y-%m-01');

-- Report 6: Customer order history with delivery details
CREATE OR REPLACE VIEW v_customer_order_history AS
SELECT o.order_id, cu.customer_id, cu.customer_name, o.order_placed_at,
    o.expected_delivery_date, o.status, o.delivery_address, o.delivery_area,
    ci.city_name AS destination_city, r.route_name, o.total_value, o.total_space_required,
    dl.delivery_id, dl.status AS delivery_status, dl.delivered_at,
    drv_e.full_name AS driver_name, ast_e.full_name AS assistant_name, tr.plate_number AS truck_plate
FROM orders o
JOIN customers cu ON cu.customer_id=o.customer_id
JOIN cities ci ON ci.city_id=o.destination_city_id
LEFT JOIN routes r ON r.route_id=o.route_id
LEFT JOIN deliveries dl ON dl.order_id=o.order_id
LEFT JOIN truck_schedules ts ON ts.schedule_id=dl.truck_schedule_id
LEFT JOIN drivers drv ON drv.driver_id=ts.driver_id
LEFT JOIN employees drv_e ON drv_e.employee_id=drv.employee_id
LEFT JOIN assistants ast ON ast.assistant_id=ts.assistant_id
LEFT JOIN employees ast_e ON ast_e.employee_id=ast.employee_id
LEFT JOIN trucks tr ON tr.truck_id=ts.truck_id;
```

---

## 8. Manual Authentication Design

> Auth logic lives entirely in the **application layer**. Only the `users` table (§2.1) has a DB footprint.

### 8.1 Login flow

```
POST /api/auth/login
  1. SELECT user_id, password_hash, is_active FROM users WHERE email = ?
  2. bcrypt.compare(plaintext, password_hash)   ← in Node.js, NEVER in SQL
  3. SELECT app_role, employee_id FROM user_profiles WHERE user_id = ?
  4. SELECT e.home_store_id FROM employees e WHERE e.employee_id = ?
  5. Issue signed JWT: { sub: user_id, role: app_role, store_id, exp }
  6. Return JWT (HttpOnly cookie recommended)

POST /api/auth/logout → clear cookie / add to deny-list

Middleware on every protected route:
  1. Verify JWT signature + expiry
  2. Extract { user_id, role, store_id }
  3. On DB connection:
       SET @current_user_id  = '<user_id>';
       SET @current_app_role = '<role>';
  4. Inject WHERE filters based on role (store_id / city_id from JWT)
```

### 8.2 Password management

```js
// Registration / password reset
const hash = await bcrypt.hash(plaintext, 12);  // cost >= 12
await db.execute(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    [email, hash]
);
```

---

## 9. Access Control Matrix (Replaces RLS)

| Postgres RLS policy | App-layer replacement |
|---|---|
| `stores: store_id = current_home_store_id()` | `WHERE store_id = :store_id` from JWT |
| `orders: destination_city_id = city of store` | `WHERE destination_city_id = :city_id` from JWT |
| `store_inventory: store_id = current_home_store_id()` | `WHERE store_id = :store_id` from JWT |
| `inventory_transactions: store_id = current_home_store_id()` | `WHERE store_id = :store_id` from JWT |
| `user_profiles: user_id = auth.uid()` | `WHERE user_id = :user_id` from JWT |
| Role checks in procedures | `@current_app_role` SET before `CALL` |

| Table / area | system_admin | logistics_mgr | order_entry | store_manager | fleet_supervisor |
|---|---|---|---|---|---|
| customers | full | read | read + insert | — | — |
| products, cities, routes | full | read | read | read | read |
| stores | full | read | read | **own store** | read |
| employees / drivers / assistants / trucks | full | read | — | — | read |
| orders | full | read + update | read + place_order | **own city** | read |
| train_trips / train_bookings | full | full | — | read (own city) | — |
| store_inventory / inventory_transactions | full | read (all) | — | **own store** | — |
| truck_schedules / deliveries | full | read | read | read | full |
| audit_log | full | — | — | — | — |

---

## 10. Deployment Checklist (Aiven MySQL 8.0)

1. Create `kandypack` schema in Aiven Console.
2. Add `ssl-mode=REQUIRED` to your DB driver config.
3. Confirm your Aiven plan permits `CREATE TRIGGER`, `CREATE PROCEDURE`, `SIGNAL` (Business/Premium tiers).
4. Run migration files **in this exact order**:

   ```
   01_auth.sql
   02_master.sql
   03_people.sql
   04_routes.sql
   05_orders.sql
   06_train.sql
   07_inventory.sql
   08_fleet.sql          ← closes delivery_id FK on inventory_transactions
   09_audit.sql
   10_functions.sql
   11_trg_generic.sql
   12_trg_orders_train.sql
   13_trg_truck_schedule.sql
   14_trg_delivery_inventory.sql
   15_trg_audit.sql
   16_trg_subtype_integrity.sql
   17_proc_place_order.sql
   18_proc_remaining.sql
   19_reports.sql
   20_seed.sql
   ```

5. Before any test, run on the same connection:
   ```sql
   SET @current_user_id  = '<valid-char36-uuid>';
   SET @current_app_role = 'system_administrator';
   ```
6. Test `place_order`:
   ```sql
   CALL place_order(1, '123 Main St', 'Zone A', 2, '2026-09-15',
                    '[{"product_id":1,"quantity":10}]',
                    NULL, NOW(), @out_order_id);
   SELECT @out_order_id;
   ```
7. Verify `store_inventory` increments via `CALL receive_goods_at_store(…)`.
8. Verify `store_inventory` decrements via `CALL complete_delivery(…)`.
9. Confirm `audit_log` rows have `@current_user_id` as `user_id`.
10. Confirm `trg_check_active_delivery_on_insert` blocks a second active delivery for same order.

---

## 11. Seed Data Adjustments for v4

| Seed script | Required change |
|---|---|
| All | Insert into `users` **before** `user_profiles` |
| `user_profiles` inserts | `user_id` must match `users.user_id`; remove `full_name`; use `display_name_override` only when `employee_id IS NULL` |
| `truck_schedules` inserts | Remove `store_id` (dropped in v3) |
| `inventory_transactions` | Use `train_booking_id` or `delivery_id`; remove `reference_table` and `reference_id` |
| All datetime values | Format as `'YYYY-MM-DD HH:MM:SS'` (no timezone suffix) |
| All boolean values | Use `1` / `0` not `true` / `false` |
| Procedure calls | `CALL place_order(…, @out_id)` and `CALL schedule_truck_delivery(…, @out_id)` syntax |

---

## 12. What Did Not Change from v3

- All 11 v3 domain decisions (4 new added in §1)
- `GENERATED ALWAYS AS … STORED` computed columns (same syntax MySQL 5.7+)
- `DECIMAL(p,s)` money and space types
- `FOR UPDATE` row locking (InnoDB)
- `ON DELETE CASCADE` on `order_items` and `train_booking_items`
- All soft-delete patterns (`is_deleted`, `deleted_at`)
- 7-day lead-time: CHECK + trigger defence-in-depth
- Subtype integrity triggers (driver/assistant type matching)
- Trigger-maintained caches: `orders.total_value`, `orders.total_space_required`, `train_trips.booked_space`, `store_inventory.quantity_on_hand`
- Overflow-split booking algorithm (logic identical, syntax rewritten)
- All six reporting query logics (date functions rewritten; results identical)
- Window functions `RANK() OVER (PARTITION BY …)` — MySQL 8.0 ✅
- CTEs `WITH … AS` — MySQL 8.0 ✅
