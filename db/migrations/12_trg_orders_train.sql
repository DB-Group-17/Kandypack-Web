-- =========================================================
-- 12_trg_orders_train.sql
-- Order Lead-Time, Item Snapshot, Totals, Status Log,
-- and Train Capacity Triggers
-- =========================================================

DROP TRIGGER IF EXISTS trg_validate_order_date;
CREATE TRIGGER trg_validate_order_date BEFORE INSERT ON orders FOR EACH ROW
BEGIN
    IF DATEDIFF(NEW.expected_delivery_date, DATE(NEW.order_placed_at)) < 7 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'expected_delivery_date must be >= 7 days after order date.';
    END IF;
END;

DROP TRIGGER IF EXISTS trg_snapshot_order_item_prices;
CREATE TRIGGER trg_snapshot_order_item_prices BEFORE INSERT ON order_items FOR EACH ROW
BEGIN
    DECLARE v_price DECIMAL(12,2); DECLARE v_space DECIMAL(10,4);
    SELECT unit_price, space_rate INTO v_price, v_space FROM products WHERE product_id=NEW.product_id;
    IF v_price IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Product not found.'; END IF;
    IF NEW.unit_price_at_order IS NULL THEN SET NEW.unit_price_at_order=v_price; END IF;
    IF NEW.space_rate_at_order IS NULL THEN SET NEW.space_rate_at_order=v_space; END IF;
END;

DROP TRIGGER IF EXISTS trg_maintain_order_totals_ins;
CREATE TRIGGER trg_maintain_order_totals_ins AFTER INSERT ON order_items FOR EACH ROW
BEGIN
    UPDATE orders SET
        total_value=(SELECT COALESCE(SUM(line_value),0) FROM order_items WHERE order_id=NEW.order_id),
        total_space_required=(SELECT COALESCE(SUM(line_space),0) FROM order_items WHERE order_id=NEW.order_id)
    WHERE order_id=NEW.order_id;
END;

DROP TRIGGER IF EXISTS trg_maintain_order_totals_upd;
CREATE TRIGGER trg_maintain_order_totals_upd AFTER UPDATE ON order_items FOR EACH ROW
BEGIN
    UPDATE orders SET
        total_value=(SELECT COALESCE(SUM(line_value),0) FROM order_items WHERE order_id=NEW.order_id),
        total_space_required=(SELECT COALESCE(SUM(line_space),0) FROM order_items WHERE order_id=NEW.order_id)
    WHERE order_id=NEW.order_id;
END;

DROP TRIGGER IF EXISTS trg_maintain_order_totals_del;
CREATE TRIGGER trg_maintain_order_totals_del AFTER DELETE ON order_items FOR EACH ROW
BEGIN
    UPDATE orders SET
        total_value=(SELECT COALESCE(SUM(line_value),0) FROM order_items WHERE order_id=OLD.order_id),
        total_space_required=(SELECT COALESCE(SUM(line_space),0) FROM order_items WHERE order_id=OLD.order_id)
    WHERE order_id=OLD.order_id;
END;

DROP TRIGGER IF EXISTS trg_log_order_status_change;
CREATE TRIGGER trg_log_order_status_change AFTER UPDATE ON orders FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status THEN
        INSERT INTO order_status_history (order_id,old_status,new_status,changed_by)
        VALUES (NEW.order_id,OLD.status,NEW.status,@current_user_id);
    END IF;
END;

DROP TRIGGER IF EXISTS trg_check_trip_capacity;
CREATE TRIGGER trg_check_trip_capacity BEFORE INSERT ON train_bookings FOR EACH ROW
BEGIN
    DECLARE v_cap DECIMAL(10,2); DECLARE v_bk DECIMAL(10,2); DECLARE v_msg VARCHAR(300);
    SELECT total_capacity,booked_space INTO v_cap,v_bk FROM train_trips WHERE trip_id=NEW.trip_id FOR UPDATE;
    IF v_cap IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Train trip does not exist.'; END IF;
    IF v_bk+NEW.space_booked > v_cap THEN
        SET v_msg=CONCAT('Booking rejected: trip ',NEW.trip_id,' has ',(v_cap-v_bk),' free, requested ',NEW.space_booked,'.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;
END;

DROP TRIGGER IF EXISTS trg_update_trip_booked_space_ins;
CREATE TRIGGER trg_update_trip_booked_space_ins AFTER INSERT ON train_bookings FOR EACH ROW
BEGIN UPDATE train_trips SET booked_space=booked_space+NEW.space_booked WHERE trip_id=NEW.trip_id; END;

DROP TRIGGER IF EXISTS trg_update_trip_booked_space_upd;
CREATE TRIGGER trg_update_trip_booked_space_upd AFTER UPDATE ON train_bookings FOR EACH ROW
BEGIN UPDATE train_trips SET booked_space=booked_space-OLD.space_booked+NEW.space_booked WHERE trip_id=NEW.trip_id; END;

DROP TRIGGER IF EXISTS trg_update_trip_booked_space_del;
CREATE TRIGGER trg_update_trip_booked_space_del AFTER DELETE ON train_bookings FOR EACH ROW
BEGIN UPDATE train_trips SET booked_space=booked_space-OLD.space_booked WHERE trip_id=OLD.trip_id; END;
