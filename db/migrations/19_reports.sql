-- =========================================================
-- 19_reports.sql
-- Reporting Views 1 through 6
-- =========================================================

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
