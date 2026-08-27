-- =========================================================
-- 16_trg_subtype_integrity.sql
-- Subtype Integrity Triggers for Drivers and Assistants
-- =========================================================

DROP TRIGGER IF EXISTS trg_validate_driver_subtype;
CREATE TRIGGER trg_validate_driver_subtype BEFORE INSERT ON drivers FOR EACH ROW
BEGIN
    DECLARE v_type VARCHAR(50);
    SELECT employee_type INTO v_type FROM employees WHERE employee_id=NEW.employee_id;
    IF v_type<>'driver' OR v_type IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot create drivers row: employee_type must be ''driver''.';
    END IF;
END;

DROP TRIGGER IF EXISTS trg_validate_assistant_subtype;
CREATE TRIGGER trg_validate_assistant_subtype BEFORE INSERT ON assistants FOR EACH ROW
BEGIN
    DECLARE v_type VARCHAR(50);
    SELECT employee_type INTO v_type FROM employees WHERE employee_id=NEW.employee_id;
    IF v_type<>'assistant' OR v_type IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot create assistants row: employee_type must be ''assistant''.';
    END IF;
END;

DROP TRIGGER IF EXISTS trg_guard_employee_type_change;
CREATE TRIGGER trg_guard_employee_type_change BEFORE UPDATE ON employees FOR EACH ROW
BEGIN
    DECLARE v_ex INT DEFAULT 0;
    IF NEW.employee_type<>OLD.employee_type THEN
        IF OLD.employee_type='driver' THEN
            SELECT COUNT(*) INTO v_ex FROM drivers WHERE employee_id=OLD.employee_id;
            IF v_ex>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot retype from ''driver'' while drivers row exists.'; END IF;
        END IF;
        IF OLD.employee_type='assistant' THEN
            SELECT COUNT(*) INTO v_ex FROM assistants WHERE employee_id=OLD.employee_id;
            IF v_ex>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot retype from ''assistant'' while assistants row exists.'; END IF;
        END IF;
    END IF;
END;
