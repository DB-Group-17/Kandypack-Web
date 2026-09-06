# Kandypack System Operation Guide

> Status: Active
> Authority: Supporting system-behavior guide
> Primary source: `Docs/03_architecture.md`
> Last reviewed: 2026-08-25

## Purpose

This document explains how Kandypack operates after implementation. It describes the main workflow, staff roles, permissions, business rules, status transitions, and reporting behavior.

## System overview

Kandypack is a staff-operated logistics platform for managing:

- Customers and products.
- Orders.
- Rail transport from Kandy to destination cities.
- Store inventory and goods receipt.
- Truck schedules and delivery routes.
- Delivery completion and exceptions.
- Reports and audit history.

The system connects the full flow:

`Customer order → Train booking → Store receipt → Truck schedule → Delivery → Reports and audit history`

## 1. Login and access flow

1. A staff member enters an email and password.
2. The system verifies the password and checks that the account is active.
3. The system creates a secure HttpOnly JWT session cookie.
4. The system loads the user role and store/city scope.
5. The user is redirected to the dashboard.
6. Next.js Proxy and API routes enforce permissions on every protected request.

Customers, drivers, and assistants do not have login accounts in version one. Staff members manage their records and perform actions on their behalf where applicable.

## 2. Role-aware dashboard

The dashboard displays data according to the signed-in user’s role and scope.

- Store managers see their own store inventory, orders, and alerts.
- Fleet supervisors see truck schedules and delivery operations.
- Logistics managers see system-wide logistics activity.
- System administrators see all available operational and administrative information.
- Other roles see only the data needed for their assigned work.

## 3. Master-data management

Authorized users manage the reference data used by the rest of the system:

- Products.
- Cities.
- Stores.
- Customers.
- Routes and delivery areas.
- Employees.
- Trucks.
- Drivers.
- Assistants.

Master data is reused by order entry, train planning, inventory, scheduling, delivery, and reporting. Administrative changes are audited.

## 4. Order workflow

An order-entry clerk usually enters an order received by phone, email, or another business channel.

### Order-entry steps

1. Select an existing customer or create a customer record.
2. Select products and enter quantities.
3. Enter the delivery address and delivery area.
4. Select the destination city.
5. Select or confirm the route.
6. Enter the expected delivery date.
7. Submit the order.
8. The system calculates totals and required transport space.
9. The system records the staff member who created the order.

### Order validations

The system checks:

- The expected delivery date is at least seven days after order placement.
- The delivery area belongs to the selected route.
- The customer, products, quantities, and destination are valid.
- Quantities and order values are not negative.
- The user has permission to create the order.

New orders begin with the status `Pending`.

## 5. Rail transport workflow

The logistics manager creates and manages train trips.

Each trip records:

- Departure city.
- Destination city.
- Departure date and time.
- Capacity.
- Booked space.
- Remaining capacity.
- Related order bookings.

When an order is assigned to a trip, the system calculates its required space, checks remaining capacity, prevents overbooking, updates the booked amount, and records the booking.

If a train cannot carry the complete order, the order can be split across future trips. The customer still sees one order, while each allocation records its assigned trip, quantity, and remaining quantity.

## 6. Store-receipt and inventory workflow

When goods arrive at a destination store:

1. The store manager records the goods receipt.
2. Store inventory is increased.
3. An inventory transaction is created.
4. The receipt is linked to the related booking or order.
5. The order can move to `At Store`.

Inventory changes are recorded as transactions rather than silently overwriting history.

## 7. Truck scheduling workflow

The fleet supervisor creates schedules by selecting:

- Truck.
- Driver.
- Assistant.
- Route.
- Start time.
- End time.
- Delivery assignment.

The system checks for truck, driver, and assistant conflicts before saving the schedule. Approved schedules begin with `Scheduled`.

## 8. Delivery workflow

The delivery lifecycle is:

`Scheduled → In Progress → Completed`

Exception outcomes are:

- `Failed` — the delivery was attempted but could not be completed.
- `Cancelled` — an authorized user cancelled the delivery or related operation.

When a delivery is completed, the system records the completion time, notes, and any relevant inventory or order updates. The related order can move to `Delivered`.

## 9. Order lifecycle

The normal order lifecycle is:

`Pending → In Transit → At Store → Out for Delivery → Delivered`

`Cancelled` is a controlled terminal exception and must be permission-checked and audited.

## 10. Reporting workflow

Authorized users can view:

- Quarterly sales.
- Most-ordered items.
- City and route sales.
- Driver and assistant hours.
- Truck usage.
- Customer order history.

CSV and PDF exports work as follows:

1. The user selects a report and filters.
2. The system checks report permissions.
3. The system validates the filters, date range, and report size.
4. MySQL returns the report data.
5. The system generates CSV or PDF output.
6. The file is returned directly for download.

Version-one reports are not saved to the database and do not use a `report_jobs` table, polling endpoint, or report-file storage.

## 11. Audit workflow

The system records important actions, including:

- User creation, deactivation, and role changes.
- Order creation, updates, and status changes.
- Inventory receipts and adjustments.
- Train and truck schedule changes.
- Delivery completion, failure, and cancellation.
- Administrative master-data changes.

The system administrator can view the complete audit log. Audit records identify the acting user, affected record, action, and relevant change details.

# Roles and permissions

## System administrator

The system administrator has full system access.

Can:

- View all dashboards and data.
- Create, deactivate, and manage user accounts.
- Assign and change roles.
- Manage all master data.
- Manage orders, train trips, inventory, truck schedules, and deliveries.
- View and export all reports.
- View the audit log.

All administrative actions remain subject to audit logging.

## Logistics manager

Can:

- View and update orders.
- Manage train trips and train bookings.
- Monitor logistics and inventory movement.
- Manage train schedules with full operational scheduling permissions.
- View dashboards and reports.
- Export CSV and PDF reports.

Cannot manage user accounts, system roles, or unrestricted administrative settings.

## Order-entry clerk

Can:

- View customers.
- Create customers.
- Create orders.
- View orders they entered.
- View relevant order details and history.
- Update orders where permitted by the status rules.

Cannot manage train schedules, truck schedules, store inventory, users, or unrestricted administrative data.

## Store manager

Can:

- View their own store inventory.
- Record received goods.
- View inventory transactions for their store.
- View orders for their own store or city.
- Monitor low-stock information.

Cannot manage other stores, users, train schedules, truck schedules, or system-wide permissions.

## Fleet supervisor

Can:

- View trucks, drivers, and assistants.
- Create truck schedules.
- View schedule conflicts.
- Assign trucks, drivers, assistants, and routes.
- View and manage deliveries.
- Mark deliveries in progress or completed.
- Record delivery failures, cancellations, and notes.

Cannot manage users, products, global master data, train trips, or system permissions.

# Core system rules

## Authentication rules

- Only active staff accounts can log in.
- Passwords are hashed and never stored as plain text.
- Sessions use secure HttpOnly cookies.
- Next.js Proxy protects authenticated routes.
- Every API route enforces role permissions.

## Order rules

- Every order requires a valid customer.
- Expected delivery must be at least seven days after order placement.
- Delivery areas must match configured route coverage.
- Quantities and values cannot be negative.
- Orders may be split across future train trips when capacity is insufficient.
- Every order action must be attributable to a staff user.

## Transport rules

- Train capacity cannot be exceeded.
- Trucks, drivers, and assistants cannot have overlapping schedules.
- Truck schedules must remain within configured operating hours.
- Driver and assistant weekly-hour limits must be enforced.
- Assistant route continuity is preserved until the route sequence is completed or an authorized user reassigns it.

## Inventory rules

- Goods receipt increases store inventory.
- Dispatch and delivery activity decreases inventory where applicable.
- Inventory transactions are recorded.
- Store managers are restricted to their own stores.

## Data-integrity rules

- Hard deletes are avoided where business history must be preserved.
- Soft deletion is used for records that must remain auditable.
- Foreign keys protect relationships.
- Database constraints, procedures, and application validation work together.
- Important changes create audit records.

## Reporting rules

- Users can export only reports they are authorized to view.
- Filters and date ranges must be validated.
- Large reports are limited to protect performance.
- CSV and PDF files are generated on demand.
- Generated report files are not persisted in version one.

## Pre-implementation alignment note

Before creating database migrations, verify that the delivery table status constraint includes every approved delivery status, including `Cancelled`, consistently across the architecture, API, and database-schema documents.
