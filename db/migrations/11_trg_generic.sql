-- =========================================================
-- 11_trg_generic.sql
-- updated_at Triggers and Soft-Delete Prevention Triggers
-- =========================================================

-- updated_at triggers: one per table
DROP TRIGGER IF EXISTS trg_touch_updated_at_customers;
CREATE TRIGGER trg_touch_updated_at_customers BEFORE UPDATE ON customers FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_products;
CREATE TRIGGER trg_touch_updated_at_products BEFORE UPDATE ON products FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_stores;
CREATE TRIGGER trg_touch_updated_at_stores BEFORE UPDATE ON stores FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_employees;
CREATE TRIGGER trg_touch_updated_at_employees BEFORE UPDATE ON employees FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_drivers;
CREATE TRIGGER trg_touch_updated_at_drivers BEFORE UPDATE ON drivers FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_assistants;
CREATE TRIGGER trg_touch_updated_at_assistants BEFORE UPDATE ON assistants FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_trucks;
CREATE TRIGGER trg_touch_updated_at_trucks BEFORE UPDATE ON trucks FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_routes;
CREATE TRIGGER trg_touch_updated_at_routes BEFORE UPDATE ON routes FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_orders;
CREATE TRIGGER trg_touch_updated_at_orders BEFORE UPDATE ON orders FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_train_trips;
CREATE TRIGGER trg_touch_updated_at_train_trips BEFORE UPDATE ON train_trips FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_truck_schedules;
CREATE TRIGGER trg_touch_updated_at_truck_schedules BEFORE UPDATE ON truck_schedules FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

DROP TRIGGER IF EXISTS trg_touch_updated_at_deliveries;
CREATE TRIGGER trg_touch_updated_at_deliveries BEFORE UPDATE ON deliveries FOR EACH ROW BEGIN SET NEW.updated_at = NOW(); END;

-- Hard-delete prevention triggers
DROP TRIGGER IF EXISTS trg_prevent_hard_delete_customers;
CREATE TRIGGER trg_prevent_hard_delete_customers BEFORE DELETE ON customers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on customers. Use is_deleted=1.'; END;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_products;
CREATE TRIGGER trg_prevent_hard_delete_products BEFORE DELETE ON products FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on products. Use is_deleted=1.'; END;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_stores;
CREATE TRIGGER trg_prevent_hard_delete_stores BEFORE DELETE ON stores FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on stores. Use is_deleted=1.'; END;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_employees;
CREATE TRIGGER trg_prevent_hard_delete_employees BEFORE DELETE ON employees FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on employees. Use is_deleted=1.'; END;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_drivers;
CREATE TRIGGER trg_prevent_hard_delete_drivers BEFORE DELETE ON drivers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on drivers. Use is_deleted=1.'; END;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_assistants;
CREATE TRIGGER trg_prevent_hard_delete_assistants BEFORE DELETE ON assistants FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on assistants. Use is_deleted=1.'; END;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_trucks;
CREATE TRIGGER trg_prevent_hard_delete_trucks BEFORE DELETE ON trucks FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on trucks. Use is_deleted=1.'; END;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_routes;
CREATE TRIGGER trg_prevent_hard_delete_routes BEFORE DELETE ON routes FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete not allowed on routes. Use is_deleted=1.'; END;
