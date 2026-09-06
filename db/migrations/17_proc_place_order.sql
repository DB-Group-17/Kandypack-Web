-- =========================================================
-- 17_proc_place_order.sql
-- Stored Procedure: place_order
-- Validates 7-day rule, route coverage, calculates totals,
-- books train space, and handles overflow across trips.
-- =========================================================

DROP PROCEDURE IF EXISTS place_order;
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
               product_id BIGINT        PATH '$.product_id',
               quantity   DECIMAL(10,2) PATH '$.quantity')) AS jt;

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_item_remaining(
        order_item_id BIGINT PRIMARY KEY, remaining_qty DECIMAL(10,2), space_rate DECIMAL(10,4));
    TRUNCATE TABLE tmp_item_remaining;
    INSERT INTO tmp_item_remaining SELECT order_item_id,quantity,space_rate_at_order FROM order_items WHERE order_id=p_order_id;

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_trip_alloc(order_item_id BIGINT, qty DECIMAL(10,2), space DECIMAL(10,2));

    SET v_search_after=COALESCE(p_order_placed_at,NOW());

    -- Overflow-split booking loop
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

    -- Explicit temp table cleanup
    DROP TEMPORARY TABLE IF EXISTS tmp_item_remaining;
    DROP TEMPORARY TABLE IF EXISTS tmp_trip_alloc;
END;
