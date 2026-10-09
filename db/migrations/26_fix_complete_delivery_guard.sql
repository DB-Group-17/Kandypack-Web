-- =========================================================
-- 26_fix_complete_delivery_guard.sql
-- complete_delivery() accepted deliveries it should refuse.
--
-- Migration 18's procedure only checked `status <> 'Completed'`. A delivery that is
-- 'Failed' or 'Cancelled' could therefore still be completed through
-- PATCH /api/deliveries/:id/complete: the order flipped to 'Delivered' and stock was
-- dispatched for a delivery that never happened. The /deliveries page hides the button
-- for those statuses, so only a direct API call reached it (found in the Member 3 Phase 2
-- review, 2026-10-07).
--
-- Fix: recreate the procedure so only a 'Scheduled' or 'In Progress' delivery can be
-- completed. Everything else is carried forward verbatim from migration 18:
--   * the role guard and the "not found" message,
--   * the "Delivery N is already Completed." message (the API and its tests rely on it),
--   * the dispatch rows written for the order's items.
-- New: a 'Failed' or 'Cancelled' delivery is rejected with
--   "Delivery N is <status> and cannot be completed."
-- The UPDATE keeps the status condition, so a status that changes between the check and
-- the UPDATE (a concurrent caller) is still caught by the row count.
--
-- Migration 18 cannot be edited instead: it is already recorded in _schema_migrations, so
-- the runner would never re-apply it.
--
-- ROLLBACK: re-run the complete_delivery definition from 18_proc_remaining.sql.
-- NOTE: a stored-procedure change is live for every member the moment it is applied.
-- =========================================================

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
    DECLARE v_status VARCHAR(20);
    DECLARE v_msg VARCHAR(200);

    IF @current_app_role NOT IN ('fleet_supervisor','logistics_manager','system_administrator') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='complete_delivery: role not authorized.';
    END IF;

    SELECT d.order_id,r.store_id,d.status INTO v_order_id,v_store_id,v_status
      FROM deliveries d JOIN truck_schedules ts ON ts.schedule_id=d.truck_schedule_id
      JOIN routes r ON r.route_id=ts.route_id WHERE d.delivery_id=p_delivery_id;
    IF v_order_id IS NULL THEN
        SET v_msg=CONCAT('Delivery ',p_delivery_id,' not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    -- Same wording as migration 18 for the already-completed case.
    IF v_status='Completed' THEN
        SET v_msg=CONCAT('Delivery ',p_delivery_id,' is already Completed.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    -- New guard: only a delivery that is still open can be completed.
    IF v_status NOT IN ('Scheduled','In Progress') THEN
        SET v_msg=CONCAT('Delivery ',p_delivery_id,' is ',v_status,' and cannot be completed.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    UPDATE deliveries SET status='Completed',notes=COALESCE(p_notes,notes)
     WHERE delivery_id=p_delivery_id AND status IN ('Scheduled','In Progress');
    SET v_rows=ROW_COUNT();
    IF v_rows=0 THEN
        -- The status changed between the check above and this UPDATE (a concurrent caller).
        SET v_msg=CONCAT('Delivery ',p_delivery_id,' changed status and cannot be completed.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    INSERT INTO inventory_transactions(store_id,product_id,change_qty,transaction_type,delivery_id)
    SELECT v_store_id,oi.product_id,-SUM(oi.quantity),'dispatch',p_delivery_id
      FROM order_items oi WHERE oi.order_id=v_order_id GROUP BY oi.product_id;
END;
