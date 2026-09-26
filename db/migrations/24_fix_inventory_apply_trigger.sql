-- =========================================================
-- 24_fix_inventory_apply_trigger.sql
-- Fixes a defect that made every stock decrease fail, so no
-- dispatch (and therefore no complete_delivery call) could succeed.
--
-- trg_apply_inventory_transaction (migration 14) applied each
-- movement with
--     INSERT INTO store_inventory (...) VALUES (..., NEW.change_qty, ...)
--     ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + NEW.change_qty
-- MySQL evaluates CHECK constraints against the VALUES row before it
-- detects the duplicate key and switches to the UPDATE branch. For a
-- negative change_qty that row has quantity_on_hand < 0, so
-- chk_si_qty rejected the statement even when the existing stock
-- was ample (verified: -10 against a row holding 100 fails).
-- Receipts are positive, which is why the defect went unnoticed.
--
-- Fix: update the existing row when there is one (every decrease
-- lands here), and insert only when the store has no row for the
-- product yet. The insert keeps ON DUPLICATE KEY UPDATE so two
-- first-ever receipts racing for the same product still succeed.
-- Nothing else changes:
--   - trg_check_inventory_before_dispatch still rejects a dispatch
--     that would drive stock negative, including against a missing row;
--   - a negative adjustment on a missing row still fails chk_si_qty,
--     which is correct, since stock cannot start negative.
--
-- Migration 14 cannot be edited instead: it is already recorded in
-- _schema_migrations, so the runner would never re-apply it.
-- Found by the §11 seed dry run, 2026-09-26.
-- =========================================================

DROP TRIGGER IF EXISTS trg_apply_inventory_transaction;
CREATE TRIGGER trg_apply_inventory_transaction AFTER INSERT ON inventory_transactions FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM store_inventory
                WHERE store_id=NEW.store_id AND product_id=NEW.product_id) THEN
        -- Existing row: a plain UPDATE, so chk_si_qty sees only the resulting quantity.
        UPDATE store_inventory
           SET quantity_on_hand=quantity_on_hand+NEW.change_qty, updated_at=NOW()
         WHERE store_id=NEW.store_id AND product_id=NEW.product_id;
    ELSE
        -- First movement for this store and product.
        INSERT INTO store_inventory (store_id,product_id,quantity_on_hand,updated_at)
        VALUES (NEW.store_id,NEW.product_id,NEW.change_qty,NOW())
        ON DUPLICATE KEY UPDATE quantity_on_hand=quantity_on_hand+NEW.change_qty, updated_at=NOW();
    END IF;
END;
