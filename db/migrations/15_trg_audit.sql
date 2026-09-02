-- =========================================================
-- 15_trg_audit.sql
-- Dedicated Audit Logging Triggers
-- Captures INSERT, UPDATE, DELETE actions into audit_log
-- using @current_user_id
-- =========================================================

-- 1. Orders
DROP TRIGGER IF EXISTS trg_audit_orders_ins;
CREATE TRIGGER trg_audit_orders_ins AFTER INSERT ON orders FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('orders',NEW.order_id,'INSERT',@current_user_id,
        JSON_OBJECT('order_id',NEW.order_id,'customer_id',NEW.customer_id,'status',NEW.status,'total_value',NEW.total_value));
END;

DROP TRIGGER IF EXISTS trg_audit_orders_upd;
CREATE TRIGGER trg_audit_orders_upd AFTER UPDATE ON orders FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('orders',NEW.order_id,'UPDATE',@current_user_id,
        JSON_OBJECT('status',OLD.status,'total_value',OLD.total_value),
        JSON_OBJECT('status',NEW.status,'total_value',NEW.total_value));
END;

DROP TRIGGER IF EXISTS trg_audit_orders_del;
CREATE TRIGGER trg_audit_orders_del AFTER DELETE ON orders FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data)
    VALUES('orders',OLD.order_id,'DELETE',@current_user_id,
        JSON_OBJECT('order_id',OLD.order_id,'status',OLD.status));
END;

-- 2. Order Items
DROP TRIGGER IF EXISTS trg_audit_order_items_ins;
CREATE TRIGGER trg_audit_order_items_ins AFTER INSERT ON order_items FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('order_items',NEW.order_item_id,'INSERT',@current_user_id,
        JSON_OBJECT('order_item_id',NEW.order_item_id,'order_id',NEW.order_id,'product_id',NEW.product_id,'quantity',NEW.quantity));
END;

DROP TRIGGER IF EXISTS trg_audit_order_items_upd;
CREATE TRIGGER trg_audit_order_items_upd AFTER UPDATE ON order_items FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('order_items',NEW.order_item_id,'UPDATE',@current_user_id,
        JSON_OBJECT('quantity',OLD.quantity,'unit_price',OLD.unit_price_at_order),
        JSON_OBJECT('quantity',NEW.quantity,'unit_price',NEW.unit_price_at_order));
END;

DROP TRIGGER IF EXISTS trg_audit_order_items_del;
CREATE TRIGGER trg_audit_order_items_del AFTER DELETE ON order_items FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data)
    VALUES('order_items',OLD.order_item_id,'DELETE',@current_user_id,
        JSON_OBJECT('order_item_id',OLD.order_item_id,'order_id',OLD.order_id));
END;

-- 3. Customers
DROP TRIGGER IF EXISTS trg_audit_customers_ins;
CREATE TRIGGER trg_audit_customers_ins AFTER INSERT ON customers FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('customers',NEW.customer_id,'INSERT',@current_user_id,
        JSON_OBJECT('customer_id',NEW.customer_id,'name',NEW.customer_name,'phone',NEW.phone,'city_id',NEW.registered_city_id));
END;

DROP TRIGGER IF EXISTS trg_audit_customers_upd;
CREATE TRIGGER trg_audit_customers_upd AFTER UPDATE ON customers FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('customers',NEW.customer_id,'UPDATE',@current_user_id,
        JSON_OBJECT('name',OLD.customer_name,'phone',OLD.phone,'is_deleted',OLD.is_deleted),
        JSON_OBJECT('name',NEW.customer_name,'phone',NEW.phone,'is_deleted',NEW.is_deleted));
END;

-- 4. Products
DROP TRIGGER IF EXISTS trg_audit_products_ins;
CREATE TRIGGER trg_audit_products_ins AFTER INSERT ON products FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('products',NEW.product_id,'INSERT',@current_user_id,
        JSON_OBJECT('product_id',NEW.product_id,'sku',NEW.sku,'name',NEW.product_name,'price',NEW.unit_price,'space_rate',NEW.space_rate));
END;

DROP TRIGGER IF EXISTS trg_audit_products_upd;
CREATE TRIGGER trg_audit_products_upd AFTER UPDATE ON products FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('products',NEW.product_id,'UPDATE',@current_user_id,
        JSON_OBJECT('price',OLD.unit_price,'space_rate',OLD.space_rate,'is_deleted',OLD.is_deleted),
        JSON_OBJECT('price',NEW.unit_price,'space_rate',NEW.space_rate,'is_deleted',NEW.is_deleted));
END;

-- 5. Stores
DROP TRIGGER IF EXISTS trg_audit_stores_ins;
CREATE TRIGGER trg_audit_stores_ins AFTER INSERT ON stores FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('stores',NEW.store_id,'INSERT',@current_user_id,
        JSON_OBJECT('store_id',NEW.store_id,'store_name',NEW.store_name,'city_id',NEW.city_id));
END;

DROP TRIGGER IF EXISTS trg_audit_stores_upd;
CREATE TRIGGER trg_audit_stores_upd AFTER UPDATE ON stores FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('stores',NEW.store_id,'UPDATE',@current_user_id,
        JSON_OBJECT('store_name',OLD.store_name,'is_deleted',OLD.is_deleted),
        JSON_OBJECT('store_name',NEW.store_name,'is_deleted',NEW.is_deleted));
END;

-- 6. Employees
DROP TRIGGER IF EXISTS trg_audit_employees_ins;
CREATE TRIGGER trg_audit_employees_ins AFTER INSERT ON employees FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('employees',NEW.employee_id,'INSERT',@current_user_id,
        JSON_OBJECT('employee_id',NEW.employee_id,'full_name',NEW.full_name,'nic',NEW.nic_number,'type',NEW.employee_type));
END;

DROP TRIGGER IF EXISTS trg_audit_employees_upd;
CREATE TRIGGER trg_audit_employees_upd AFTER UPDATE ON employees FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('employees',NEW.employee_id,'UPDATE',@current_user_id,
        JSON_OBJECT('full_name',OLD.full_name,'type',OLD.employee_type,'is_deleted',OLD.is_deleted),
        JSON_OBJECT('full_name',NEW.full_name,'type',NEW.employee_type,'is_deleted',NEW.is_deleted));
END;

-- 7. Drivers
DROP TRIGGER IF EXISTS trg_audit_drivers_ins;
CREATE TRIGGER trg_audit_drivers_ins AFTER INSERT ON drivers FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('drivers',NEW.driver_id,'INSERT',@current_user_id,
        JSON_OBJECT('driver_id',NEW.driver_id,'employee_id',NEW.employee_id,'license',NEW.license_number));
END;

DROP TRIGGER IF EXISTS trg_audit_drivers_upd;
CREATE TRIGGER trg_audit_drivers_upd AFTER UPDATE ON drivers FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('drivers',NEW.driver_id,'UPDATE',@current_user_id,
        JSON_OBJECT('license',OLD.license_number,'is_deleted',OLD.is_deleted),
        JSON_OBJECT('license',NEW.license_number,'is_deleted',NEW.is_deleted));
END;

-- 8. Assistants
DROP TRIGGER IF EXISTS trg_audit_assistants_ins;
CREATE TRIGGER trg_audit_assistants_ins AFTER INSERT ON assistants FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('assistants',NEW.assistant_id,'INSERT',@current_user_id,
        JSON_OBJECT('assistant_id',NEW.assistant_id,'employee_id',NEW.employee_id));
END;

DROP TRIGGER IF EXISTS trg_audit_assistants_upd;
CREATE TRIGGER trg_audit_assistants_upd AFTER UPDATE ON assistants FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('assistants',NEW.assistant_id,'UPDATE',@current_user_id,
        JSON_OBJECT('is_deleted',OLD.is_deleted),
        JSON_OBJECT('is_deleted',NEW.is_deleted));
END;

-- 9. Trucks
DROP TRIGGER IF EXISTS trg_audit_trucks_ins;
CREATE TRIGGER trg_audit_trucks_ins AFTER INSERT ON trucks FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('trucks',NEW.truck_id,'INSERT',@current_user_id,
        JSON_OBJECT('truck_id',NEW.truck_id,'plate',NEW.plate_number,'capacity',NEW.capacity_kg));
END;

DROP TRIGGER IF EXISTS trg_audit_trucks_upd;
CREATE TRIGGER trg_audit_trucks_upd AFTER UPDATE ON trucks FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('trucks',NEW.truck_id,'UPDATE',@current_user_id,
        JSON_OBJECT('plate',OLD.plate_number,'capacity',OLD.capacity_kg,'is_deleted',OLD.is_deleted),
        JSON_OBJECT('plate',NEW.plate_number,'capacity',NEW.capacity_kg,'is_deleted',NEW.is_deleted));
END;

-- 10. Routes
DROP TRIGGER IF EXISTS trg_audit_routes_ins;
CREATE TRIGGER trg_audit_routes_ins AFTER INSERT ON routes FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('routes',NEW.route_id,'INSERT',@current_user_id,
        JSON_OBJECT('route_id',NEW.route_id,'name',NEW.route_name,'store_id',NEW.store_id));
END;

DROP TRIGGER IF EXISTS trg_audit_routes_upd;
CREATE TRIGGER trg_audit_routes_upd AFTER UPDATE ON routes FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('routes',NEW.route_id,'UPDATE',@current_user_id,
        JSON_OBJECT('name',OLD.route_name,'hours',OLD.max_delivery_time_hours,'is_deleted',OLD.is_deleted),
        JSON_OBJECT('name',NEW.route_name,'hours',NEW.max_delivery_time_hours,'is_deleted',NEW.is_deleted));
END;

-- 11. Truck Schedules
DROP TRIGGER IF EXISTS trg_audit_truck_schedules_ins;
CREATE TRIGGER trg_audit_truck_schedules_ins AFTER INSERT ON truck_schedules FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('truck_schedules',NEW.schedule_id,'INSERT',@current_user_id,
        JSON_OBJECT('schedule_id',NEW.schedule_id,'truck_id',NEW.truck_id,'driver_id',NEW.driver_id,'status',NEW.status));
END;

DROP TRIGGER IF EXISTS trg_audit_truck_schedules_upd;
CREATE TRIGGER trg_audit_truck_schedules_upd AFTER UPDATE ON truck_schedules FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('truck_schedules',NEW.schedule_id,'UPDATE',@current_user_id,
        JSON_OBJECT('status',OLD.status,'start_time',OLD.start_time,'end_time',OLD.end_time),
        JSON_OBJECT('status',NEW.status,'start_time',NEW.start_time,'end_time',NEW.end_time));
END;

-- 12. Deliveries
DROP TRIGGER IF EXISTS trg_audit_deliveries_ins;
CREATE TRIGGER trg_audit_deliveries_ins AFTER INSERT ON deliveries FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('deliveries',NEW.delivery_id,'INSERT',@current_user_id,
        JSON_OBJECT('delivery_id',NEW.delivery_id,'order_id',NEW.order_id,'schedule_id',NEW.truck_schedule_id,'status',NEW.status));
END;

DROP TRIGGER IF EXISTS trg_audit_deliveries_upd;
CREATE TRIGGER trg_audit_deliveries_upd AFTER UPDATE ON deliveries FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
    VALUES('deliveries',NEW.delivery_id,'UPDATE',@current_user_id,
        JSON_OBJECT('status',OLD.status,'delivered_at',OLD.delivered_at),
        JSON_OBJECT('status',NEW.status,'delivered_at',NEW.delivered_at));
END;

-- 13. Train Bookings
DROP TRIGGER IF EXISTS trg_audit_train_bookings_ins;
CREATE TRIGGER trg_audit_train_bookings_ins AFTER INSERT ON train_bookings FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('train_bookings',NEW.booking_id,'INSERT',@current_user_id,
        JSON_OBJECT('booking_id',NEW.booking_id,'trip_id',NEW.trip_id,'order_id',NEW.order_id,'space',NEW.space_booked));
END;

DROP TRIGGER IF EXISTS trg_audit_train_bookings_del;
CREATE TRIGGER trg_audit_train_bookings_del AFTER DELETE ON train_bookings FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,old_data)
    VALUES('train_bookings',OLD.booking_id,'DELETE',@current_user_id,
        JSON_OBJECT('booking_id',OLD.booking_id,'trip_id',OLD.trip_id,'order_id',OLD.order_id));
END;
