# Kandypack — Page Content Copy

Companion to `architecture.md` and `api-and-pages.md`. Full UI text for every page — headings, labels, placeholders, button text, empty states, error/success messages, tooltips, and confirmation dialogs. Frontend devs can lift this directly instead of writing copy on the fly.

---

## `/login`

**Page title:** Kandypack

**Heading:** Sign in

**Subheading:** Rail & road distribution management

**Form fields:**
- Label: `Email` — Placeholder: `you@kandypack.lk`
- Label: `Password` — Placeholder: `Enter your password`

**Button:** Sign in
**Button (loading state):** Signing in…

**Error messages:**
- Wrong credentials: *"Incorrect email or password."*
- Account deactivated: *"This account has been deactivated. Contact your administrator."*
- Rate limited: *"Too many attempts. Please try again in a few minutes."*
- Network/server error: *"Something went wrong. Please try again."*

**Footer note:** *No public sign-up? Contact your system administrator to get an account.*

---

## `/dashboard`

**Heading:** Dashboard

**Subheading:** *Welcome back, {display_name}*

**Summary cards:**
| Card title | Value label | Empty state |
|---|---|---|
| Pending Orders | *{n} orders awaiting processing* | *No pending orders* |
| Today's Departures | *{n} trains departing today* | *No departures scheduled today* |
| Active Truck Schedules | *{n} deliveries in progress* | *No active schedules* |
| Low Stock Alerts | *{n} products running low* | *All stock levels healthy* |

**Card link text:** View all →

**Today's Departures list item:** *{destination_city} — departs {departure_time}*

**Low Stock Alerts list item:** *{product_name} at {store_name} — {quantity_on_hand} units left*

**Loading state:** Loading your dashboard…

**Error state:** *Couldn't load dashboard data.* — Button: Retry

---

## `/orders` (Orders List)

**Heading:** Orders

**Subheading:** Manage and track customer orders

**Button (primary, top-right):** + New Order

**Filter bar labels:**
- `Status` — options: All, Pending, In Transit, At Store, Out for Delivery, Delivered, Cancelled
- `City` — placeholder: All cities
- `From date` / `To date`
- Search placeholder: `Search by customer name or order ID…`

**Table columns:** Order ID · Customer · Destination · Status · Placed On · Expected Delivery · Total Value

**Status badge text:** Pending · In Transit · At Store · Out for Delivery · Delivered · Cancelled

**Empty state:**
- Heading: *No orders found*
- Body: *Try adjusting your filters, or create a new order to get started.*
- Button: + New Order

**Loading state:** Loading orders…

**Pagination:** *Showing {start}–{end} of {total} orders* — Previous / Next

---

## `/orders/new` (Place New Order)

**Heading:** New Order

**Subheading:** Enter order details on behalf of the customer

**Section 1 — Customer**
- Label: `Customer` — Placeholder: `Search by name or phone…`
- Link/button (if not found): + Add new customer
- Inline "Add new customer" mini-form:
  - `Customer name` · `Customer type` (Retail / Wholesale) · `Phone` · `Email (optional)` · `Address`
  - Button: Save customer

**Section 2 — Delivery Details**
- Label: `Destination city` — Placeholder: `Select city`
- Label: `Delivery area` — Placeholder: `e.g. Wellawatte, Colombo 6`
- Label: `Delivery address` — Placeholder: `Full delivery address`
- Label: `Expected delivery date` — Helper text: *Must be at least 7 days from today*

**Section 3 — Order Items**
- Table columns: Product · Quantity · Unit Price · Line Total
- Button: + Add item
- Button (remove row): × Remove
- Empty state: *No items added yet. Add at least one product to continue.*

**Summary panel:**
- `Total value: {amount}`
- `Total space required: {space} units`

**Buttons:** Place Order (primary) · Cancel (secondary)
**Button (loading):** Placing order…

**Validation/error messages:**
- *"Delivery date must be at least 7 days from today."*
- *"Please add at least one item to the order."*
- *"No delivery route covers this address. Please check the city and area."*
- *"This order couldn't be fully booked on the requested train — part of it has been scheduled on the next available trip."* *(informational, not a blocking error — shown after successful placement if overflow occurred)*
- Generic failure: *"Couldn't place this order. Please check the details and try again."*

**Success message (toast):** *Order #{order_id} placed successfully.*

---

## `/orders/[orderId]` (Order Detail)

**Heading:** Order #{order_id}

**Status badge:** *(same set as list page)*

**Section — Customer**
- `Customer: {customer_name}` · `Phone: {phone}` · `Type: {customer_type}`

**Section — Delivery**
- `Destination: {city}` · `Area: {delivery_area}` · `Address: {delivery_address}`
- `Expected delivery: {date}` · `Route: {route_name}`

**Section — Items**
- Table columns: Product · Quantity · Unit Price · Line Total
- Footer row: `Total: {total_value}` · `Space required: {total_space_required}`

**Section — Train Booking**
- `Trip: {destination_city} departing {departure_datetime}` · `Space booked: {space_booked}`
- If split across trips: *"This order was split across {n} train trips due to capacity."*

**Section — Delivery Status**
- If not yet scheduled: *"Not yet scheduled for delivery."*
- If scheduled: `Truck: {plate_number}` · `Driver: {driver_name}` · `Assistant: {assistant_name}` · `Scheduled: {start_time}–{end_time}`

**Section — Status History**
- Table columns: From · To · Changed By · Date · Notes
- Empty state: *No status changes yet.*

**Update status (role-gated):**
- Label: `Change status to` — dropdown of valid next statuses only
- Label: `Notes (optional)`
- Button: Update Status
- Confirmation dialog: *"Change order status to {new_status}? This cannot be undone."* — Confirm / Cancel

**Error state (order not found or out of scope):** *"This order doesn't exist or you don't have access to it."*

---

## `/train-schedule`

**Heading:** Train Schedule

**Subheading:** Manage cargo trips between Kandy and destination cities

**Button (top-right):** + Add Trip

**Calendar/list toolbar:**
- `City` filter — placeholder: All cities
- `Date range` filter
- `Status` filter — All / Scheduled / Departed / Arrived

**Trip card/row fields:**
- `{destination_city}` · `Departs {departure_datetime}` · `Arrives {arrival_datetime}`
- Capacity bar label: *{booked_space} / {total_capacity} units booked*
- Status badge: Scheduled · Departed · Arrived

**Add Trip form:**
- Label: `Destination city`
- Label: `Departure date & time`
- Label: `Arrival date & time`
- Label: `Total cargo capacity (units)`
- Button: Save Trip
- Validation error: *"Arrival time must be after departure time."*

**Empty state:** *No train trips scheduled for this period.* — Button: + Add Trip

**Success toast:** *Trip to {destination_city} added.*

---

## `/truck-schedule` (List)

**Heading:** Truck Schedules

**Subheading:** Last-mile delivery scheduling

**Button (top-right):** + New Schedule

**Filter bar:**
- `Date range` · `Status` (All / Scheduled / In Progress / Completed) · `Driver` (dropdown)

**Table columns:** Truck · Driver · Assistant · Route · Start · End · Status

**Empty state:** *No truck schedules for this period.* — Button: + New Schedule

---

## `/truck-schedule/new`

**Heading:** New Truck Schedule

**Form fields:**
- Label: `Truck` — Placeholder: `Select truck`
- Label: `Driver` — Placeholder: `Select driver` — Helper text under each option: *{hours_remaining}h remaining this week*
- Label: `Assistant` — Placeholder: `Select assistant` — Helper text: *{hours_remaining}h remaining this week*
- Label: `Route` — Placeholder: `Select route`
- Label: `Start time` · Label: `End time`

**Live conflict warning banner** *(appears above the submit button when a conflict is detected)*:
- *"⚠ {driver_name} is already scheduled during this time window."*
- *"⚠ {assistant_name} has reached the maximum of 2 consecutive routes."*
- *"⚠ This driver would exceed the 40-hour weekly limit."*
- *"⚠ This assistant would exceed the 60-hour weekly limit."*
- *"⚠ {truck_plate} is already assigned to another route during this time."*

**Buttons:** Create Schedule (primary, disabled while a conflict is showing) · Cancel

**Error (submit rejected server-side despite passing the live check):** *"This schedule conflicts with an existing booking. Please refresh and try again."*

**Success toast:** *Schedule created for {route_name}.*

---

## `/deliveries`

**Heading:** Deliveries

**Subheading:** Track and complete last-mile deliveries

**Filter bar:** `Status` (All / Scheduled / In Progress / Completed)

**Table columns:** Order · Customer · Truck · Driver · Status · Delivered On

**Row action button:** Mark Complete

**Mark Complete dialog:**
- Heading: *Complete delivery for Order #{order_id}?*
- Label: `Notes (optional)` — Placeholder: `e.g. Delivered to receptionist`
- Button: Confirm Completion · Cancel

**Success toast:** *Delivery marked complete. Order status updated to Delivered.*

**Empty state:** *No deliveries match this filter.*

---

## `/inventory`

**Heading:** Store Inventory

**Subheading:** *{store_name}* stock levels

**Store selector** *(admin/logistics_manager only)*: Label `Store` — dropdown of all stores

**Tabs:** Stock Levels · Transaction History

**Stock Levels table columns:** Product · Quantity on Hand · Last Updated

**Low stock indicator:** *Low stock* badge when below threshold

**Button:** + Receive Goods

**Receive Goods form:**
- Label: `Train booking` — Placeholder: `Select an arrived booking`
- Table columns: Product · Expected Quantity · Received Quantity (editable)
- Button: Confirm Receipt · Cancel

**Success toast:** *Stock updated — {n} products received.*

**Transaction History table columns:** Date · Product · Type (Receive/Dispatch/Adjustment) · Quantity Change

**Empty states:**
- Stock: *No inventory records for this store yet.*
- Transactions: *No transactions recorded yet.*

---

## `/reports`

**Heading:** Reports

**Subheading:** Business insights and exports

**Tabs:** Quarterly Sales · Most Ordered Items · City & Route Sales · Driver & Assistant Hours · Truck Usage · Customer History

**Shared filter labels (vary by tab):** `Year` · `Quarter` · `Month` · `From date` / `To date` · `Customer`

**Buttons:** Run Report · Export CSV · Export PDF

**PDF generation states:**
- Button (in progress): Generating PDF…
- Toast on completion: *Your PDF report is ready.* — Button: Download
- Error toast: *Couldn't generate the PDF. Please try again.*

**Report-specific empty states:**
- Quarterly Sales: *No sales recorded for this period.*
- Most Ordered Items: *No orders found for this quarter.*
- City & Route Sales: *No sales data for the selected range.*
- Driver & Assistant Hours: *No scheduled hours for this week.*
- Truck Usage: *No truck activity this month.*
- Customer History: *Select a customer to view their order history.*

**Table footer (where applicable):** *Totals: {value} · {volume} units*

---

## `/admin/users`

**Heading:** User Accounts

**Subheading:** Manage staff logins and roles

**Button (top-right):** + New User

**Table columns:** Name · Email · Role · Status · Created

**Status badge:** Active · Deactivated

**Row action:** Deactivate / Activate (toggle)

**New User form:**
- Label: `Email` — Placeholder: `staff@kandypack.lk`
- Label: `Temporary password` — Helper text: *Share this with the user securely — it won't be shown again.*
- Label: `Role` — options: System Administrator, Logistics Manager, Order Entry Clerk, Store Manager, Fleet Supervisor
- Label: `Link to employee` — Placeholder: `Search employee (optional)`
- Button: Create Account · Cancel

**One-time password banner (after creation):** *Account created. Temporary password: **{password}** — make sure to share this now, it won't be displayed again.* — Button: Copy · Dismiss

**Deactivate confirmation dialog:** *"Deactivate {email}? They won't be able to sign in until reactivated."* — Confirm / Cancel

**Empty state:** *No user accounts yet.*

---

## `/admin/master-data`

**Heading:** Master Data

**Subheading:** Manage reference data used across the system

**Tabs:** Products · Routes · Cities · Employees · Customers

### Products tab
- Button: + Add Product
- Table columns: SKU · Name · Category · Unit Price · Space Rate
- Form labels: `SKU` · `Product name` · `Category` · `Unit of measure` · `Unit price` · `Space consumption rate`
- Error: *"A product with this SKU already exists."*

### Routes tab
- Button: + Add Route
- Table columns: Route Name · Store · Coverage Areas · Max Delivery Time
- Form labels: `Route name` · `Assigned store` · `Max delivery time (hours)` · `Coverage areas` (add multiple: city + area name)
- Button (inside form): + Add coverage area

### Cities tab *(read-only)*
- Table columns: City Name · Type (Origin/Destination)
- Note: *Cities are fixed reference data and cannot be edited here.*

### Employees tab
- Button: + Add Employee
- Table columns: Name · NIC · Phone · Type · Home Store
- Form labels: `Full name` · `NIC number` · `Phone` · `Email (optional)` · `Employee type` (Driver, Assistant, Store Manager, Fleet Supervisor, Logistics Manager, Order Entry Clerk, Administrator) · `Home store`

### Customers tab
- Button: + Add Customer
- Table columns: Name · Type · Phone · Registered City
- Form labels: `Customer name` · `Customer type` (Retail/Wholesale) · `Phone` · `Email (optional)` · `Registered city` · `Address`

**Shared empty state (any tab):** *No records yet.* — matching "+ Add" button

---

## `/admin/audit-log`

**Heading:** Audit Log

**Subheading:** Full history of data changes across the system

**Filter bar:** `Table` (dropdown of tracked tables) · `User` (dropdown) · `From date` / `To date`

**Table columns:** Timestamp · Table · Record ID · Action · Changed By

**Action badge:** Created · Updated · Deleted

**Row expand (view diff):**
- Section labels: `Before` / `After`
- Empty diff note: *No field-level changes recorded.*

**Empty state:** *No audit records match these filters.*

---

## Shared / Global Copy

**Navigation sidebar labels:** Dashboard · Orders · Train Schedule · Truck Schedule · Deliveries · Inventory · Reports · Admin

**Admin sub-nav:** Users · Master Data · Audit Log

**Top bar:** *{display_name}* · *{role, human-readable}* — Sign out

**Generic loading state:** Loading…

**Generic error state:** *Something went wrong.* — Button: Retry

**Generic "no permission" state:** *You don't have permission to view this page.*

**Session expired message:** *Your session has expired. Please sign in again.* — redirects to `/login`

**Confirmation dialog buttons (default pattern used throughout):** Confirm / Cancel

**Toast auto-dismiss default:** 4 seconds
