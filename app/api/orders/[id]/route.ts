/**
 * @file app/api/orders/[id]/route.ts
 * @description Dynamic API route handler for retrieving full order details by ID.
 * 
 * Responsibilities:
 * 1. Validate route parameter format (positive integer order ID).
 * 2. Authenticate session and enforce RBAC permissions (`orders:read`).
 * 3. Enforce multi-tenant store manager isolation (404 on regional mismatch to prevent enumeration).
 * 4. Fetch the primary order header record joined with customer, route, and destination city.
 * 5. Concurrently query child collections (items, rail bookings with items, latest delivery, status history)
 *    in parallel via `Promise.all` across the MySQL connection pool.
 * 6. Assemble and return a composite JSON payload for the Order Detail view.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/05_api-and-pages.md §A4
 * Owner: Member 1 (Dineth)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { query, queryOne } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

/**
 * Route context interface matching Next.js 15/16 async dynamic route parameters.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Raw database row interface for store city lookup.
 */
interface StoreCityRow extends RowDataPacket {
  city_id: number;
}

/**
 * Raw database row interface for order header joined with customer, city, route, and creator.
 */
interface OrderHeaderRow extends RowDataPacket {
  order_id: number;
  customer_id: number;
  customer_name: string;
  customer_type: 'retail' | 'wholesale';
  customer_phone: string;
  customer_email: string | null;
  customer_address: string | null;
  delivery_address: string;
  delivery_area: string;
  destination_city_id: number;
  destination_city: string;
  route_id: number | null;
  route_name: string | null;
  max_delivery_time_hours: number | null;
  order_placed_at: Date | string;
  expected_delivery_date: Date | string;
  status: string;
  total_value: number | string;
  total_space_required: number | string;
  created_by: string | null;
  created_by_name: string;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * Raw database row interface for order line items joined with products.
 */
interface OrderItemRow extends RowDataPacket {
  order_item_id: number;
  order_id: number;
  product_id: number;
  sku: string;
  product_name: string;
  category: string | null;
  unit_of_measure: string | null;
  quantity: number | string;
  unit_price_at_order: number | string;
  space_rate_at_order: number | string;
  line_space: number | string;
  line_value: number | string;
}

/**
 * Raw database row interface for train bookings joined with trips and destination.
 */
interface TrainBookingRow extends RowDataPacket {
  booking_id: number;
  trip_id: number;
  space_booked: number | string;
  booked_at: Date | string;
  departure_datetime: Date | string;
  arrival_datetime: Date | string;
  total_capacity: number | string;
  trip_booked_space: number | string;
  trip_status: string;
  destination_city: string;
}

/**
 * Raw database row interface for train booking items linked to order items.
 */
interface TrainBookingItemRow extends RowDataPacket {
  booking_item_id: number;
  booking_id: number;
  order_item_id: number;
  quantity_shipped: number | string;
  space_consumed: number | string;
  product_name: string;
  sku: string;
}

/**
 * Raw database row interface for the latest final-mile delivery joined with truck, driver, and assistant.
 */
interface DeliveryRow extends RowDataPacket {
  delivery_id: number;
  truck_schedule_id: number;
  delivery_status: string;
  delivered_at: Date | string | null;
  notes: string | null;
  exception_reason: string | null;
  schedule_start_time: Date | string;
  schedule_end_time: Date | string;
  truck_plate: string;
  driver_name: string;
  driver_phone: string | null;
  assistant_name: string;
  assistant_phone: string | null;
}

/**
 * Raw database row interface for order status history audit log.
 */
interface StatusHistoryRow extends RowDataPacket {
  history_id: number;
  old_status: string | null;
  new_status: string;
  changed_at: Date | string;
  changed_by: string | null;
  notes: string | null;
  changed_by_name: string;
}

/**
 * Formats a Date object or MySQL timestamp string into a standardized ISO 8601 string.
 *
 * @param dateVal - Raw date representation from database driver
 * @returns ISO 8601 formatted date string
 */
function toIsoString(dateVal: Date | string | null | undefined): string | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal.toISOString();
  const parsed = new Date(dateVal);
  return isNaN(parsed.getTime()) ? String(dateVal) : parsed.toISOString();
}

/**
 * Formats a DATE column into a YYYY-MM-DD string.
 *
 * @param dateVal - Raw date representation from database driver
 * @returns YYYY-MM-DD string
 */
function toDateString(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    return dateVal.split('T')[0].split(' ')[0];
  }
  return dateVal.toISOString().split('T')[0];
}

/**
 * GET handler for retrieving comprehensive details of a single order.
 * 
 * URL: GET /api/orders/[id]
 * Access Control: system_administrator, logistics_manager, order_entry_clerk, fleet_supervisor, store_manager (own city).
 * 
 * @param req - Incoming HTTP Request
 * @param context - Dynamic route context containing async params
 * @returns JSON response with full composite order object or structured error
 */
export async function GET(
  req: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. Resolve and validate route parameter
    const { id } = await context.params;
    const orderId = parseInt(id, 10);

    if (isNaN(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'A valid positive integer order ID is required.'
          }
        },
        { status: 400 }
      );
    }

    // 2. Authenticate session and check user permissions
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be authenticated to view order details.'
          }
        },
        { status: 401 }
      );
    }

    if (!hasPermission(session.role, 'orders', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to view order details.'
          }
        },
        { status: 403 }
      );
    }

    // 3. Enforce multi-tenant store manager isolation
    let enforcedCityId: number | null = null;
    if (session.role === 'store_manager') {
      if (!session.store_id) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Store manager account is not assigned to any regional warehouse store.'
            }
          },
          { status: 403 }
        );
      }

      // Lookup the city_id associated with the store manager's assigned store
      const store = await queryOne<StoreCityRow>(
        'SELECT city_id FROM stores WHERE store_id = ? AND is_deleted = 0',
        [session.store_id]
      );

      if (!store) {
        return NextResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Assigned store was not found or has been deactivated.'
            }
          },
          { status: 404 }
        );
      }

      enforcedCityId = store.city_id;
    }

    // 4. Fetch the primary order header record
    const orderHeaderSql = `
      SELECT 
        o.order_id,
        o.customer_id,
        c.customer_name,
        c.customer_type,
        c.phone AS customer_phone,
        c.email AS customer_email,
        c.address_line AS customer_address,
        o.delivery_address,
        o.delivery_area,
        o.destination_city_id,
        dest.city_name AS destination_city,
        o.route_id,
        r.route_name,
        r.max_delivery_time_hours,
        o.order_placed_at,
        o.expected_delivery_date,
        o.status,
        o.total_value,
        o.total_space_required,
        o.created_by,
        COALESCE(emp_c.full_name, up_c.display_name_override, 'System') AS created_by_name,
        o.created_at,
        o.updated_at
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      JOIN cities dest ON o.destination_city_id = dest.city_id
      LEFT JOIN routes r ON o.route_id = r.route_id
      LEFT JOIN user_profiles up_c ON o.created_by = up_c.user_id
      LEFT JOIN employees emp_c ON up_c.employee_id = emp_c.employee_id
      WHERE o.order_id = ?
    `;

    const order = await queryOne<OrderHeaderRow>(orderHeaderSql, [orderId]);

    // If order does not exist or belongs to another city for store_manager, return 404
    // (Returning 404 rather than 403 prevents leaking existence of orders across regional warehouses)
    if (!order || (enforcedCityId !== null && order.destination_city_id !== enforcedCityId)) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: `Order #${orderId} was not found.`
          }
        },
        { status: 404 }
      );
    }

    // 5. Define queries for secondary child collections
    const itemsSql = `
      SELECT 
        oi.order_item_id,
        oi.order_id,
        oi.product_id,
        p.sku,
        p.product_name,
        p.category,
        p.unit_of_measure,
        oi.quantity,
        oi.unit_price_at_order,
        oi.space_rate_at_order,
        oi.line_space,
        oi.line_value
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.order_item_id ASC
    `;

    const trainBookingsSql = `
      SELECT 
        tb.booking_id,
        tb.trip_id,
        tb.space_booked,
        tb.booked_at,
        tt.departure_datetime,
        tt.arrival_datetime,
        tt.total_capacity,
        tt.booked_space AS trip_booked_space,
        tt.status AS trip_status,
        dest.city_name AS destination_city
      FROM train_bookings tb
      JOIN train_trips tt ON tb.trip_id = tt.trip_id
      JOIN cities dest ON tt.destination_city_id = dest.city_id
      WHERE tb.order_id = ?
      ORDER BY tt.departure_datetime ASC, tb.booking_id ASC
    `;

    const bookingItemsSql = `
      SELECT 
        tbi.booking_item_id,
        tbi.booking_id,
        tbi.order_item_id,
        tbi.quantity_shipped,
        tbi.space_consumed,
        p.product_name,
        p.sku
      FROM train_booking_items tbi
      JOIN train_bookings tb ON tbi.booking_id = tb.booking_id
      JOIN order_items oi ON tbi.order_item_id = oi.order_item_id
      JOIN products p ON oi.product_id = p.product_id
      WHERE tb.order_id = ?
      ORDER BY tbi.booking_item_id ASC
    `;

    const deliverySql = `
      SELECT 
        d.delivery_id,
        d.truck_schedule_id,
        d.status AS delivery_status,
        d.delivered_at,
        d.notes,
        d.exception_reason,
        ts.start_time AS schedule_start_time,
        ts.end_time AS schedule_end_time,
        tr.plate_number AS truck_plate,
        emp_d.full_name AS driver_name,
        emp_d.phone AS driver_phone,
        emp_a.full_name AS assistant_name,
        emp_a.phone AS assistant_phone
      FROM deliveries d
      JOIN truck_schedules ts ON d.truck_schedule_id = ts.schedule_id
      JOIN trucks tr ON ts.truck_id = tr.truck_id
      JOIN drivers dr ON ts.driver_id = dr.driver_id
      JOIN employees emp_d ON dr.employee_id = emp_d.employee_id
      JOIN assistants ast ON ts.assistant_id = ast.assistant_id
      JOIN employees emp_a ON ast.employee_id = emp_a.employee_id
      WHERE d.order_id = ?
      ORDER BY d.delivery_id DESC
      LIMIT 1
    `;

    const statusHistorySql = `
      SELECT 
        osh.history_id,
        osh.old_status,
        osh.new_status,
        osh.changed_at,
        osh.changed_by,
        osh.notes,
        COALESCE(emp.full_name, up.display_name_override, 'System') AS changed_by_name
      FROM order_status_history osh
      LEFT JOIN user_profiles up ON osh.changed_by = up.user_id
      LEFT JOIN employees emp ON up.employee_id = emp.employee_id
      WHERE osh.order_id = ?
      ORDER BY osh.changed_at ASC, osh.history_id ASC
    `;

    // 6. Execute all child queries in parallel via Promise.all across the pool
    const [items, trainBookings, bookingItems, delivery, statusHistory] = await Promise.all([
      query<OrderItemRow[]>(itemsSql, [orderId]),
      query<TrainBookingRow[]>(trainBookingsSql, [orderId]),
      query<TrainBookingItemRow[]>(bookingItemsSql, [orderId]),
      queryOne<DeliveryRow>(deliverySql, [orderId]),
      query<StatusHistoryRow[]>(statusHistorySql, [orderId])
    ]);

    // 7. Group train booking items by booking_id for structured nesting
    const bookingItemsByBookingId = new Map<number, Array<{
      booking_item_id: number;
      order_item_id: number;
      product_name: string;
      sku: string;
      quantity_shipped: number;
      space_consumed: number;
    }>>();

    for (const bi of bookingItems) {
      const list = bookingItemsByBookingId.get(bi.booking_id) || [];
      list.push({
        booking_item_id: bi.booking_item_id,
        order_item_id: bi.order_item_id,
        product_name: bi.product_name,
        sku: bi.sku,
        quantity_shipped: Number(bi.quantity_shipped),
        space_consumed: Number(bi.space_consumed)
      });
      bookingItemsByBookingId.set(bi.booking_id, list);
    }

    // Format train bookings with trip info and nested items
    const formattedTrainBookings = trainBookings.map((b) => ({
      booking_id: b.booking_id,
      trip_id: b.trip_id,
      space_booked: Number(b.space_booked).toFixed(2),
      booked_at: toIsoString(b.booked_at),
      trip: {
        trip_id: b.trip_id,
        departure_datetime: toIsoString(b.departure_datetime),
        arrival_datetime: toIsoString(b.arrival_datetime),
        total_capacity: Number(b.total_capacity).toFixed(2),
        booked_space: Number(b.trip_booked_space).toFixed(2),
        status: b.trip_status,
        destination_city: b.destination_city
      },
      items: bookingItemsByBookingId.get(b.booking_id) || []
    }));

    // Format delivery info if scheduled/active, or null otherwise
    const formattedDelivery = delivery
      ? {
          delivery_id: delivery.delivery_id,
          truck_schedule_id: delivery.truck_schedule_id,
          status: delivery.delivery_status,
          delivered_at: toIsoString(delivery.delivered_at),
          notes: delivery.notes,
          exception_reason: delivery.exception_reason,
          schedule: {
            start_time: toIsoString(delivery.schedule_start_time),
            end_time: toIsoString(delivery.schedule_end_time),
            truck_plate: delivery.truck_plate,
            driver_name: delivery.driver_name,
            driver_phone: delivery.driver_phone,
            assistant_name: delivery.assistant_name,
            assistant_phone: delivery.assistant_phone
          }
        }
      : null;

    // Format status history timeline
    const formattedStatusHistory = statusHistory.map((h) => ({
      history_id: h.history_id,
      old_status: h.old_status,
      new_status: h.new_status,
      changed_at: toIsoString(h.changed_at),
      changed_by: h.changed_by,
      changed_by_name: h.changed_by_name,
      notes: h.notes
    }));

    // Format line items
    const formattedItems = items.map((i) => ({
      order_item_id: i.order_item_id,
      product_id: i.product_id,
      sku: i.sku,
      product_name: i.product_name,
      category: i.category,
      unit_of_measure: i.unit_of_measure,
      quantity: Number(i.quantity),
      unit_price_at_order: Number(i.unit_price_at_order).toFixed(2),
      space_rate_at_order: Number(i.space_rate_at_order).toFixed(4),
      line_space: Number(i.line_space).toFixed(2),
      line_value: Number(i.line_value).toFixed(2)
    }));

    // 8. Assemble full composite order payload
    return NextResponse.json(
      {
        order: {
          order_id: order.order_id,
          status: order.status,
          order_placed_at: toIsoString(order.order_placed_at),
          expected_delivery_date: toDateString(order.expected_delivery_date),
          total_value: Number(order.total_value).toFixed(2),
          total_space_required: Number(order.total_space_required).toFixed(2),
          customer: {
            customer_id: order.customer_id,
            customer_name: order.customer_name,
            customer_type: order.customer_type,
            phone: order.customer_phone,
            email: order.customer_email,
            address: order.customer_address
          },
          destination: {
            city_id: order.destination_city_id,
            city_name: order.destination_city,
            delivery_address: order.delivery_address,
            delivery_area: order.delivery_area
          },
          route: order.route_id
            ? {
                route_id: order.route_id,
                route_name: order.route_name,
                max_delivery_time_hours: order.max_delivery_time_hours
              }
            : null,
          created_by: {
            user_id: order.created_by,
            display_name: order.created_by_name
          },
          created_at: toIsoString(order.created_at),
          updated_at: toIsoString(order.updated_at),
          items: formattedItems,
          train_bookings: formattedTrainBookings,
          delivery: formattedDelivery,
          status_history: formattedStatusHistory
        }
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[GET /api/orders/[id]] Unexpected error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected server error occurred while retrieving order details.'
        }
      },
      { status: 500 }
    );
  }
}
