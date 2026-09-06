-- =========================================================
-- 14_trg_delivery_inventory.sql
-- Active Delivery Prevention, Order Status Flip on Delivery,
-- Inventory Dispatch Validation, and Stock Updates
-- =========================================================

DROP TRIGGER IF EXISTS trg_check_active_delivery_on_insert;
CREATE TRIGGER trg_check_active_delivery_on_insert BEFORE INSERT ON deliveries FOR EACH ROW
BEGIN
    DECLARE v_ex INT DEFAULT 0; DECLARE v_msg VARCHAR(200);
    SELECT COUNT(*) INTO v_ex FROM deliveries
     WHERE order_id=NEW.order_id AND status IN ('Scheduled','In Progress');
    IF v_ex > 0 THEN
        SET v_msg=CONCAT('Delivery rejected: order ',NEW.order_id,' already has an active delivery.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;
END;

DROP TRIGGER IF EXISTS trg_delivery_complete_order;
CREATE TRIGGER trg_delivery_complete_order BEFORE UPDATE ON deliveries FOR EACH ROW
BEGIN
    IF NEW.status='Completed' AND OLD.status<>'Completed' THEN
        IF NEW.delivered_at IS NULL THEN SET NEW.delivered_at=NOW(); END IF;
        UPDATE orders SET status='Delivered' WHERE order_id=NEW.order_id;
    END IF;
END;

DROP TRIGGER IF EXISTS trg_check_inventory_before_dispatch;
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
END;

DROP TRIGGER IF EXISTS trg_apply_inventory_transaction;
CREATE TRIGGER trg_apply_inventory_transaction AFTER INSERT ON inventory_transactions FOR EACH ROW
BEGIN
    INSERT INTO store_inventory (store_id,product_id,quantity_on_hand,updated_at)
    VALUES (NEW.store_id,NEW.product_id,NEW.change_qty,NOW())
    ON DUPLICATE KEY UPDATE quantity_on_hand=quantity_on_hand+NEW.change_qty, updated_at=NOW();
END;
