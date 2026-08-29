-- =========================================================
-- 18_proc_remaining.sql
-- Stored Procedures: schedule_truck_delivery,
-- receive_goods_at_store, complete_delivery
-- =========================================================

DROP PROCEDURE IF EXISTS schedule_truck_delivery;
CREATE PROCEDURE schedule_truck_delivery(
    IN  p_truck_id     BIGINT,
    IN  p_driver_id    BIGINT,
    IN  p_assistant_id BIGINT,
    IN  p_route_id     BIGINT,
    IN  p_start_time   DATETIME,
    OUT p_schedule_id  BIGINT
) SQL SECURITY DEFINER
BEGIN
    DECLARE v_hours DECIMAL(4,2);
    DECLARE v_end DATETIME;
    DECLARE v_msg VARCHAR(200);

    IF @current_app_role NOT IN ('fleet_supervisor','system_administrator') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='schedule_truck_delivery: role not authorized.';
    END IF;
    SELECT max_delivery_time_hours INTO v_hours FROM routes WHERE route_id=p_route_id AND is_deleted=0;
    IF v_hours IS NULL THEN
        SET v_msg=CONCAT('Route ',p_route_id,' not found or inactive.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    SET v_end=DATE_ADD(p_start_time, INTERVAL (v_hours*3600) SECOND);
    INSERT INTO truck_schedules(truck_id,driver_id,assistant_id,route_id,start_time,end_time)
    VALUES(p_truck_id,p_driver_id,p_assistant_id,p_route_id,p_start_time,v_end);
    SET p_schedule_id=LAST_INSERT_ID();
END;

DROP PROCEDURE IF EXISTS receive_goods_at_store;
CREATE PROCEDURE receive_goods_at_store(
    IN p_booking_id BIGINT,
    IN p_received_by CHAR(36)
)
SQL SECURITY DEFINER
BEGIN
    DECLARE v_trip_status VARCHAR(20);
    DECLARE v_store_id BIGINT;
    DECLARE v_order_id BIGINT;
    DECLARE v_still INT DEFAULT 0;
    DECLARE v_msg VARCHAR(300);

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
END;

DROP PROCEDURE IF EXISTS complete_delivery;
CREATE PROCEDURE complete_delivery(
    IN p_delivery_id BIGINT,
    IN p_notes TEXT
)
SQL SECURITY DEFINER
BEGIN
    DECLARE v_rows INT;
    DECLARE v_order_id BIGINT;
    DECLARE v_store_id BIGINT;
    DECLARE v_msg VARCHAR(200);

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
    SET v_rows=ROW_COUNT();
    IF v_rows=0 THEN
        SET v_msg=CONCAT('Delivery ',p_delivery_id,' is already Completed.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    INSERT INTO inventory_transactions(store_id,product_id,change_qty,transaction_type,delivery_id)
    SELECT v_store_id,oi.product_id,-SUM(oi.quantity),'dispatch',p_delivery_id
      FROM order_items oi WHERE oi.order_id=v_order_id GROUP BY oi.product_id;
END;
