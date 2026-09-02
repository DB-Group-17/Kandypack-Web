# Kandypack — API & Pages Reference

Companion to `03_architecture.md`. Documents every API route (method, auth, request/response shape, business logic) and every page (which routes it calls, how it uses them).

Conventions used throughout:
- All request/response bodies are JSON unless noted.
- All protected routes require the JWT cookie; `Roles` lists who may call it.
- Error shape is always: `{ "error": { "code": string, "message": string, "field"?: string } }`
- All money fields are `DECIMAL` serialized as strings to avoid float rounding.
- Timestamps are ISO 8601 strings over the wire (converted from MySQL `DATETIME`).

---

# PART A — API Routes

## A1. Auth

### `POST /api/auth/login`
- **Roles:** public
- **Request body:** `{ "email": string, "password": string }`
- **Response 200:** `{ "user": { "user_id", "email", "role", "store_id"?, "display_name" } }` + sets HttpOnly JWT cookie
- **Response 401:** invalid credentials
- **Business logic:**
  1. `SELECT user_id, password_hash, is_active FROM users WHERE email = ?`
  2. If not found or `is_active = 0` → 401
  3. `bcrypt.compare(password, password_hash)` in Node — never in SQL
  4. On success: `SELECT app_role, employee_id FROM user_profiles WHERE user_id = ?`, then `home_store_id` from `employees` if applicable
  5. Sign JWT `{ sub: user_id, role, store_id, exp }`, set as HttpOnly cookie
  6. Rate-limited (see architecture.md §7 note)

### `POST /api/auth/logout`
- **Roles:** any authenticated user
- **Request body:** none
- **Response 200:** `{ "success": true }`, clears cookie
- **Business logic:** clears the JWT cookie; optionally adds token to a short-TTL Redis deny-list if immediate invalidation is required.

### `GET /api/auth/me`
- **Roles:** any authenticated user
- **Response 200:** `{ "user_id", "email", "role", "store_id"?, "display_name" }`
- **Business logic:** reads identity straight from the verified JWT (no DB hit needed unless profile fields are stale).

---

## A2. Dashboard

### `GET /api/dashboard/summary`
- **Roles:** all authenticated roles (data scoped by role/store where relevant)
- **Response 200:**
  ```
  {
    "pending_orders": number,
    "todays_departures": [{ "trip_id", "destination_city", "departure_datetime" }],
    "active_truck_schedules": number,
    "low_stock_alerts": [{ "store_id", "store_name", "product_name", "quantity_on_hand" }]
  }
  ```
- **Business logic:**
  1. Check Redis cache key `dashboard:summary:<role>:<store_id>` (TTL ~30–60s)
  2. On miss: run 4 lightweight aggregate queries (`orders WHERE status='Pending'`, `train_trips WHERE DATE(departure_datetime)=CURDATE()`, `truck_schedules WHERE status IN ('Scheduled','In Progress')`, `store_inventory WHERE quantity_on_hand < threshold`)
  3. `store_manager` role scopes all four to their own `store_id`
  4. Cache result, return

---

## A3. Customers & Master Data

### `GET /api/customers`
- **Roles:** order_entry_clerk, logistics_manager, system_administrator
- **Query params:** `search?`, `city_id?`, `page?`, `page_size?`
- **Response 200:** `{ "items": [{ customer_id, customer_name, customer_type, phone, email, registered_city_id, address_line }], "total": number }`
- **Business logic:** `WHERE is_deleted = 0` always; `search` matches `customer_name LIKE` / `phone LIKE`.

### `POST /api/customers`
- **Roles:** order_entry_clerk, system_administrator
- **Request body:** `{ customer_name, customer_type, phone, email?, registered_city_id?, address_line? }`
- **Response 201:** the created customer row
- **Response 400:** validation error (`customer_type` must be `retail`/`wholesale`)
- **Business logic:** `INSERT INTO customers (...)`; audit-logged automatically by trigger.

### `GET /api/products`
- **Roles:** all authenticated roles (read)
- **Query params:** `search?`, `category?`
- **Response 200:** `{ "items": [{ product_id, sku, product_name, category, unit_of_measure, unit_price, space_rate }] }`

### `POST /api/products` / `PATCH /api/products/:id`
- **Roles:** system_administrator
- **Request body (POST):** `{ sku, product_name, category?, unit_of_measure?, unit_price, space_rate }`
- **Request body (PATCH):** any subset of the above
- **Response 201/200:** the product row
- **Response 400:** `unit_price < 0` or `space_rate <= 0` rejected (mirrors `chk_products_price`/`chk_products_space`)
- **Business logic:** straightforward insert/update; `sku` uniqueness enforced by DB constraint, surfaced as a 409 on violation.

### `GET /api/cities`
- **Roles:** all authenticated roles
- **Response 200:** `{ "items": [{ city_id, city_name, is_origin, is_destination }] }`
- **Business logic:** effectively static reference data (6 destination cities + Kandy origin); safe to cache in Redis with a long TTL.

### `GET /api/routes`
- **Roles:** all authenticated roles
- **Query params:** `city_id?`, `store_id?`
- **Response 200:** `{ "items": [{ route_id, store_id, route_name, coverage_description, max_delivery_time_hours, coverage_areas: [{ city_id, area_name }] }] }`

### `POST /api/routes`
- **Roles:** system_administrator, logistics_manager
- **Request body:** `{ store_id, route_name, coverage_description?, max_delivery_time_hours, coverage_areas: [{ city_id, area_name }] }`
- **Response 201:** created route + coverage areas
- **Business logic:** insert into `routes`, then bulk-insert `route_coverage_areas` in the same transaction (rolls back together — `ON DELETE CASCADE` already ties areas to route on the DB side).

---

## A4. Orders

### `GET /api/orders`
- **Roles:** order_entry_clerk, logistics_manager, system_administrator (own-city for store_manager)
- **Query params:** `status?`, `customer_id?`, `city_id?`, `date_from?`, `date_to?`, `search?`, `page?`, `page_size?`
- **Response 200:** `{ "items": [{ order_id, customer_name, destination_city, status, order_placed_at, expected_delivery_date, total_value, total_space_required }], "total": number }`
- **Business logic:** `store_manager` role auto-filters `WHERE destination_city_id = :city_id_from_JWT`; others see all (with optional filters applied).

### `POST /api/orders`
- **Roles:** order_entry_clerk, system_administrator
- **Request body:**
  ```
  {
    "customer_id": number,
    "delivery_address": string,
    "delivery_area": string,
    "destination_city_id": number,
    "expected_delivery_date": "YYYY-MM-DD",
    "items": [{ "product_id": number, "quantity": number }]
  }
  ```
- **Response 201:** `{ "order_id": number, "status": "Pending", "total_value", "total_space_required" }`
- **Response 400:** business-rule violation (7-day rule, no matching route, empty items)
- **Business logic:**
  1. Acquire Redis lock scoped to the relevant train trip(s) for `destination_city_id` (fail-fast under contention)
  2. `CALL place_order(customer_id, delivery_address, delivery_area, destination_city_id, expected_delivery_date, items_json, route_id=NULL, NOW(), @out_order_id)`
  3. Procedure internally: validates 7-day lead time, matches `delivery_area`/`destination_city_id` to a covering route (`BR-002`), calculates total space via `calculate_order_space()`, finds the next available trip with `get_next_available_trip()`, books space (with overflow to a later trip if the current one lacks capacity), and writes `order_items`
  4. Triggers auto-maintain `orders.total_value` / `total_space_required` and `train_trips.booked_space`
  5. Release Redis lock; return `@out_order_id`
  6. On any failure inside the procedure, the whole transaction rolls back (`SIGNAL SQLSTATE '45000'` surfaces the specific rule violated, per REQ-NF-007) — mapped to a 400 with a human-readable message

### `GET /api/orders/:id`
- **Roles:** role-scoped per matrix
- **Response 200:** full order + `items[]` + `status_history[]` + linked `train_bookings[]` + linked `delivery` (if scheduled)
- **Response 404:** not found / not in caller's scope

### `PATCH /api/orders/:id/status`
- **Roles:** logistics_manager, system_administrator
- **Request body:** `{ "status": string, "notes"? }`
- **Response 200:** updated order
- **Business logic:** validates the target status is a legal transition (`Pending → In Transit → At Store → Out for Delivery → Delivered`, or `→ Cancelled` from any pre-Delivered state); inserts into `order_status_history` (trigger-backed) with `changed_by` from the JWT.

---

## A5. Train Scheduling

### `GET /api/train-trips`
- **Roles:** logistics_manager, store_manager, system_administrator
- **Query params:** `city_id?`, `date_from?`, `date_to?`, `status?`
- **Response 200:** `{ "items": [{ trip_id, destination_city, departure_datetime, arrival_datetime, total_capacity, booked_space, remaining_capacity, status }] }`

### `POST /api/train-trips`
- **Roles:** logistics_manager, system_administrator
- **Request body:** `{ destination_city_id, departure_datetime, arrival_datetime, total_capacity }`
- **Response 201:** created trip
- **Response 400:** `arrival_datetime <= departure_datetime` (mirrors `chk_tt_arrival`)
- **Business logic:** plain insert; `booked_space` defaults to 0.

### `GET /api/train-trips/:id/capacity`
- **Roles:** all authenticated roles
- **Response 200:** `{ "trip_id", "total_capacity", "booked_space", "remaining_capacity" }`
- **Business logic:** calls `get_available_capacity(trip_id)`; used by the UI for live display, and internally referenced by `place_order`.

---

## A6. Store Inventory

### `GET /api/stores/:id/inventory`
- **Roles:** store_manager (own store), system_administrator, logistics_manager (read-all)
- **Response 200:** `{ "items": [{ product_id, product_name, quantity_on_hand, updated_at }] }`
- **Business logic:** `store_manager` request is rejected with 403 if `:id` doesn't match their `store_id` from the JWT.

### `POST /api/stores/:id/receive-goods`
- **Roles:** store_manager (own store), system_administrator
- **Request body:** `{ "train_booking_id": number, "items": [{ "product_id": number, "quantity": number }] }`
- **Response 200:** `{ "updated_products": number }`
- **Business logic:**
  1. `CALL receive_goods_at_store(store_id, train_booking_id, items_json, @current_user_id)`
  2. Procedure increments `store_inventory.quantity_on_hand` (upsert via `ON DUPLICATE KEY UPDATE`) and inserts an `inventory_transactions` row with `transaction_type = 'receive'` and `train_booking_id` set
  3. `chk_it_fk_consistency` constraint enforced at DB level (receive rows must carry `train_booking_id`, not `delivery_id`)

### `GET /api/inventory/transactions`
- **Roles:** store_manager (own store), system_administrator, logistics_manager
- **Query params:** `store_id?`, `product_id?`, `type?`, `date_from?`, `date_to?`
- **Response 200:** `{ "items": [{ transaction_id, store_id, product_id, change_qty, transaction_type, created_at }] }`

---

## A7. Fleet & Truck Scheduling

### `GET /api/trucks`
- **Roles:** fleet_supervisor, system_administrator (read for others)
- **Response 200:** `{ "items": [{ truck_id, plate_number, capacity_kg, home_store_id }] }`

### `GET /api/drivers` / `GET /api/assistants`
- **Roles:** fleet_supervisor, system_administrator (read for others)
- **Response 200:** `{ "items": [{ driver_id/assistant_id, full_name, ..., current_week_hours, weekly_limit, hours_remaining }] }`
- **Business logic:** calls `get_driver_weekly_hours()` / `get_assistant_weekly_hours()` for the current week per row — used to show availability before scheduling.

### `GET /api/truck-schedules`
- **Roles:** fleet_supervisor, system_administrator (read for others)
- **Query params:** `date_from?`, `date_to?`, `status?` (`Scheduled`, `In Progress`, `Completed`, `Cancelled`), `driver_id?`, `truck_id?`
- **Response 200:** `{ "items": [{ schedule_id, truck_plate, driver_name, assistant_name, route_name, start_time, end_time, status }] }`

### `POST /api/truck-schedules`
- **Roles:** fleet_supervisor, system_administrator
- **Request body:** `{ truck_id, driver_id, assistant_id, route_id, start_time, end_time }`
- **Response 201:** created schedule
- **Response 400:** roster/overlap violation, with the specific rule named (`BR-004` through `BR-008`)
- **Business logic:**
  1. Acquire Redis lock on `truck_id` + `driver_id` + `assistant_id` for the duration of the check (fail-fast on contention)
  2. `CALL schedule_truck_delivery(truck_id, driver_id, assistant_id, route_id, start_time, end_time, @out_schedule_id)`
  3. Procedure checks: no overlapping time slot for truck/driver/assistant (`BR-008`), driver not on 2 consecutive deliveries without a 2-hour break (`BR-004`), assistant not on a 3rd consecutive route (`BR-005`), driver ≤ 40 hrs/week (`BR-006`), assistant ≤ 60 hrs/week (`BR-007`), operating hours 06:00–20:00 same day
  4. `trg_fn_validate_truck_schedule` is the DB-level backstop even if the app-layer check is somehow bypassed
  5. Release Redis lock; return `@out_schedule_id`

### `GET /api/truck-schedules/:id/conflicts`
- **Roles:** fleet_supervisor, system_administrator
- *(Actually a pre-check — no `:id` needed if used before creation; accepts the same body as POST)*
- **Request body:** `{ truck_id, driver_id, assistant_id, start_time, end_time }`
- **Response 200:** `{ "has_conflict": boolean, "reasons": string[] }`
- **Business logic:** read-only version of the same checks in `schedule_truck_delivery`, run without locking or writing — purely for live UI warnings before submit.

---

## A8. Deliveries

### `GET /api/deliveries`
- **Roles:** fleet_supervisor, system_administrator (read for others)
- **Query params:** `status?` (`Scheduled`, `In Progress`, `Completed`, `Failed`, `Cancelled`), `date_from?`, `date_to?`
- **Response 200:** `{ "items": [{ delivery_id, order_id, customer_name, truck_plate, driver_name, status, delivered_at }] }`

### `PATCH /api/deliveries/:id/complete`
- **Roles:** fleet_supervisor, system_administrator
- **Request body:** `{ "notes"?: string }`
- **Response 200:** `{ "delivery_id", "status": "Completed", "order_status": "Delivered" }`
- **Business logic:**
  1. `CALL complete_delivery(delivery_id, notes, @current_user_id)`
  2. Procedure validates the delivery exists and isn't already completed
  3. `trg_fn_delivery_complete_order` fires on the status update → sets the linked `orders.status = 'Delivered'` automatically
  4. A corresponding `inventory_transactions` row (`transaction_type = 'dispatch'`) is written, linked via `delivery_id`

---

## A9. Reports

All 6 report GET endpoints share the same pattern:
- **Roles:** logistics_manager, system_administrator (broader); other roles per matrix (e.g. fleet_supervisor can read Reports 4/5)
- **Query params:** `quarter?`, `year?`, `month?`, `date_from?`, `date_to?`, `customer_id?` (report-dependent — see table below)
- **Response 200:** `{ "items": [...], "generated_at": timestamp }`
- **Business logic:** each queries its corresponding reporting view (built in Schema v4 §7); results cached in Redis for ~1 hour since these are heavy aggregates and don't need to be real-time.

| Route | Backing view | Key params |
|---|---|---|
| `GET /api/reports/quarterly-sales` | `v_quarterly_sales` | `year?`, `quarter?` |
| `GET /api/reports/most-ordered-items` | `v_most_ordered_items` | `year`, `quarter` (required) |
| `GET /api/reports/city-route-sales` | `v_city_route_sales` | `date_from?`, `date_to?` |
| `GET /api/reports/driver-assistant-hours` | `v_driver_hours` + `v_assistant_hours` | `week_start` (required) |
| `GET /api/reports/truck-usage` | `v_truck_usage_monthly` | `month?`, `year?` |
| `GET /api/reports/customer-history` | `v_customer_order_history` | `customer_id` (required) |

### `GET /api/reports/:type/export/csv`
- **Roles:** same as the report itself
- **Response 200:** `Content-Type: text/csv` streamed file
- **Business logic:** re-runs the same query as the JSON endpoint (bypassing cache is fine — CSV is a one-off action), streams rows through a CSV writer directly in the response — no queue involved.

### `POST /api/reports/:type/export/pdf`
- **Roles:** same as the report itself
- **Request body:** same filter params as the report's GET
- **Response 200:** PDF bytes with `Content-Type: application/pdf` and `Content-Disposition: attachment`
- **Business logic:**
  1. Authenticate the requester and enforce the report permission.
  2. Validate report type, filters, date range, and maximum result size.
  3. Run the report query and render the PDF synchronously.
  4. Return the PDF directly; do not create a `report_jobs` row, poll, or upload to storage.
  5. Rate-limit per user because PDF rendering is an expensive operation.

---

## A10. Admin

### `GET /api/users` / `POST /api/users`
- **Roles:** system_administrator only
- **Request body (POST):** `{ email, temp_password, app_role, employee_id? }`
- **Response 201:** `{ user_id, email, app_role }` *(temp password sent out-of-band, e.g. shown once or emailed — never returned in a GET)*
- **Business logic:**
  1. Hash `temp_password` with bcrypt (cost ≥ 12), insert into `users`
  2. Insert matching `user_profiles` row with `app_role` (must be one of the 5 allowed values) and either `employee_id` or `display_name_override` (mutually exclusive, per `chk_user_profiles_name`)
  3. This is the **only** account-creation path — no public sign-up exists

### `PATCH /api/users/:id`
- **Roles:** system_administrator only
- **Request body:** `{ is_active?: boolean, app_role?: string }`
- **Response 200:** updated user/profile
- **Business logic:** deactivation sets `is_active = 0` (soft, login blocked at step 2 of the login flow) rather than deleting the row.

### `GET /api/employees` / `POST /api/employees`
- **Roles:** system_administrator
- **Request body (POST):** `{ full_name, nic_number, phone, email?, employee_type, home_store_id? }`
- **Response 201:** created employee
- **Business logic:** `employee_type` must be one of the 7 allowed values (`chk_employee_type`); if `employee_type = 'driver'` or `'assistant'`, a matching row must also be created in `drivers`/`assistants` (enforced by `trg_fn_validate_driver_subtype` / `trg_fn_validate_assistant_subtype`) — the API does both inserts in one transaction.

### `GET /api/audit-log`
- **Roles:** system_administrator only
- **Query params:** `table_name?`, `user_id?`, `date_from?`, `date_to?`
- **Response 200:** `{ "items": [{ log_id, table_name, record_id, action, user_id, changed_at, old_data, new_data }] }`
- **Business logic:** read-only over `audit_log`, populated entirely by DB triggers — this endpoint never writes.

---

# PART B — Pages

For each page: which API routes it calls, and the interaction flow.

## `/login`
- **Calls:** `POST /api/auth/login`
- **Flow:** form submit → on 200, redirect to `/dashboard`; on 401, show inline error. No other route calls on this page.

## `/dashboard`
- **Calls:** `GET /api/dashboard/summary`
- **Flow:** fetched once on page load (client or server component); auto-refetches every ~60s or on window focus, since it's backed by a short-TTL cache anyway. Cards link out to `/orders?status=Pending`, `/train-schedule`, `/truck-schedule`, `/inventory` respectively.

## `/orders` (Orders List)
- **Calls:** `GET /api/orders` (with query params from filter UI)
- **Flow:** filters (status, city, date range, search) update query params → refetch. Row click navigates to `/orders/[orderId]`. "New Order" button links to `/orders/new`.

## `/orders/new` (Place New Order)
- **Calls:** `GET /api/customers` (search-as-you-type), `GET /api/products` (line-item picker), `GET /api/cities`, `POST /api/orders` (on submit)
- **Flow:**
  1. Customer search dropdown queries `/api/customers?search=...`
  2. Product line items added from `/api/products` list, quantity entered per line
  3. Delivery date picker enforces the 7-day minimum **client-side** first (fast feedback), but the real validation is server-side inside `place_order` — client check is UX only, never trusted
  4. On submit, `POST /api/orders`; on 400 (rule violation), the specific message from the procedure is shown inline; on 201, redirect to `/orders/[orderId]`

## `/orders/[orderId]` (Order Detail)
- **Calls:** `GET /api/orders/:id`, `PATCH /api/orders/:id/status` (if role permits)
- **Flow:** loads full order + items + status history + linked train booking + delivery info in one call. Status-change dropdown only rendered for `logistics_manager`/`system_administrator`; submitting calls the PATCH and refetches.

## `/train-schedule`
- **Calls:** `GET /api/train-trips`, `POST /api/train-trips` (add-trip form), `GET /api/train-trips/:id/capacity`
- **Flow:** calendar view fetches trips for the visible date range; each trip cell shows booked/remaining capacity from the list response directly (capacity endpoint is mainly for the Orders page's live display, not re-fetched per cell here). "Add Trip" opens a form → `POST /api/train-trips` → refetch the calendar.

## `/truck-schedule` (List)
- **Calls:** `GET /api/truck-schedules`
- **Flow:** filterable table (date range, status, driver); row click could expand to show conflict/roster status inline (already part of the list response). "New Schedule" links to `/truck-schedule/new`.

## `/truck-schedule/new`
- **Calls:** `GET /api/trucks`, `GET /api/drivers`, `GET /api/assistants`, `GET /api/routes`, `GET /api/truck-schedules/:id/conflicts` (live check), `POST /api/truck-schedules` (submit)
- **Flow:**
  1. Dropdowns populated from trucks/drivers/assistants/routes lists (driver/assistant dropdowns show `hours_remaining` inline, from the same list response)
  2. As soon as truck + driver + assistant + time range are all selected, fire the conflicts pre-check (`GET .../conflicts`) — debounced — to show live warnings before submit
  3. Submit calls `POST /api/truck-schedules`; on 400, show the specific rule violated; on 201, redirect to `/truck-schedule`

## `/deliveries`
- **Calls:** `GET /api/deliveries`, `PATCH /api/deliveries/:id/complete`
- **Flow:** list filterable by status; "Mark Complete" button per row opens a small notes field → PATCH → row updates in place (or refetch).

## `/inventory`
- **Calls:** `GET /api/stores/:id/inventory` (store_manager's own store, or store-selector for admin/logistics_manager), `POST /api/stores/:id/receive-goods`, `GET /api/inventory/transactions`
- **Flow:** stock table loads on mount; "Receive Goods" form (select `train_booking_id`, enter received quantities per product) → POST → refetch stock table. Transactions history shown as a secondary tab/table.

## `/reports`
- **Calls:** all 6 `GET /api/reports/*` endpoints (one per report tab), `GET /api/reports/:type/export/csv`, `POST /api/reports/:type/export/pdf` + `GET /api/reports/jobs/:job_id` (polling)
- **Flow:**
  1. Tabbed UI, one tab per report; selecting a tab + filling filters (quarter/year/date range/customer) fetches that report's JSON and renders a table
  2. "Export CSV" button triggers a direct browser download from the CSV endpoint (no extra state needed)
  3. "Export PDF" button calls the POST endpoint, receives `job_id`, shows a "Generating…" state, and polls `GET /api/reports/jobs/:job_id` every ~2s until `status: done`, then shows a download link (`file_url`, served from Cloudflare R2)

## `/admin/users`
- **Calls:** `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`
- **Flow:** table of accounts; "New User" form collects email/role/temp password/employee link → POST → temp password shown once in a dismissible banner (never retrievable again). Activate/deactivate toggle → PATCH.

## `/admin/master-data`
- **Calls:** `GET/POST /api/products`, `PATCH /api/products/:id`, `GET /api/cities`, `GET/POST /api/routes`, `GET/POST /api/employees`, `GET/POST /api/customers`
- **Flow:** tabbed sub-sections (Products / Routes / Cities (read-only) / Employees / Customers), each tab independently fetching and posting to its own endpoint — effectively 5 small CRUD screens sharing one page shell.

## `/admin/audit-log`
- **Calls:** `GET /api/audit-log`
- **Flow:** filterable read-only table (table name, user, date range) — no writes from this page at all.
