-- =========================================================
-- 23_fix_truck_schedule_lock.sql
-- Fixes a defect that made schedule_truck_delivery fail for
-- every caller, so no truck schedule could ever be created.
--
-- trg_validate_truck_schedule (migration 13) opened with
--     SELECT schedule_id INTO @_lock FROM truck_schedules ... FOR UPDATE;
-- A BEFORE INSERT trigger on truck_schedules may read that table,
-- but FOR UPDATE requests write locks on it, which MySQL refuses
-- while the invoking INSERT is using the table:
--     ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG (1442).
-- The same statement would also have failed with "Result consisted
-- of more than one row" once two matching schedules existed.
--
-- Fix:
-- 1. Recreate the trigger without that statement. Every rule check
--    (overlaps, BR-004 to BR-008, weekly caps) is carried forward
--    verbatim from migration 13.
-- 2. Recreate schedule_truck_delivery so it takes the lock itself,
--    before its INSERT, on the truck, driver and assistant rows
--    (always in that order, to avoid lock-order deadlocks). Two
--    concurrent calls sharing any of the three therefore serialise,
--    so the trigger's overlap and hour checks cannot both pass for
--    conflicting schedules. The API's Redis lock remains the
--    app-level guard; this is the database-level backstop.
--
-- Migrations 13 and 18 cannot be edited instead: both are already
-- recorded in _schema_migrations, so the runner would never re-apply
-- them. Found by the §10 seed dry run, 2026-09-26.
-- =========================================================

DROP TRIGGER IF EXISTS trg_validate_truck_schedule;
CREATE TRIGGER trg_validate_truck_schedule BEFORE INSERT ON truck_schedules FOR EACH ROW
BEGIN
    DECLARE v_cid BIGINT DEFAULT NULL; DECLARE v_cs DATETIME; DECLARE v_ce DATETIME;
    DECLARE v_dc INT; DECLARE v_ac INT;
    DECLARE v_dh DECIMAL(10,2); DECLARE v_ah DECIMAL(10,2); DECLARE v_nh DECIMAL(10,2);
    DECLARE v_dn VARCHAR(255); DECLARE v_an VARCHAR(255); DECLARE v_msg VARCHAR(500);

    -- (Migration 23) The locking read that stood here was removed: a trigger may
    -- not take write locks on the table its own statement is inserting into
    -- (ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG). schedule_truck_delivery now locks
    -- the truck, driver and assistant rows before its INSERT instead.

    -- 1) Truck overlap
    SELECT schedule_id,start_time,end_time INTO v_cid,v_cs,v_ce FROM truck_schedules
     WHERE truck_id=NEW.truck_id AND status<>'Cancelled'
       AND start_time<NEW.end_time AND end_time>NEW.start_time LIMIT 1;
    IF v_cid IS NOT NULL THEN
        SET v_msg=CONCAT('Truck ',NEW.truck_id,' already booked ',v_cs,' to ',v_ce,' (sched ',v_cid,').');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 2) Driver overlap
    SET v_cid=NULL;
    SELECT schedule_id,start_time,end_time INTO v_cid,v_cs,v_ce FROM truck_schedules
     WHERE driver_id=NEW.driver_id AND status<>'Cancelled'
       AND start_time<NEW.end_time AND end_time>NEW.start_time LIMIT 1;
    IF v_cid IS NOT NULL THEN
        SET v_msg=CONCAT('Driver ',NEW.driver_id,' already booked ',v_cs,' to ',v_ce,' (sched ',v_cid,').');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 3) Assistant overlap
    SET v_cid=NULL;
    SELECT schedule_id,start_time,end_time INTO v_cid,v_cs,v_ce FROM truck_schedules
     WHERE assistant_id=NEW.assistant_id AND status<>'Cancelled'
       AND start_time<NEW.end_time AND end_time>NEW.start_time LIMIT 1;
    IF v_cid IS NOT NULL THEN
        SET v_msg=CONCAT('Assistant ',NEW.assistant_id,' already booked ',v_cs,' to ',v_ce,' (sched ',v_cid,').');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 4) Driver consecutive rule (BR-004): chain <= 1
    SET v_dc=fn_driver_chain_length(NEW.driver_id,NEW.start_time,NEW.end_time);
    IF v_dc > 1 THEN
        SELECT e.full_name INTO v_dn FROM drivers d JOIN employees e ON e.employee_id=d.employee_id WHERE d.driver_id=NEW.driver_id;
        SET v_msg=CONCAT('Driver ',NEW.driver_id,' (',v_dn,') would have back-to-back delivery with <2h break.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 5) Assistant max-two-consecutive rule (BR-005): chain <= 2
    SET v_ac=fn_assistant_chain_length(NEW.assistant_id,NEW.start_time,NEW.end_time);
    IF v_ac > 2 THEN
        SELECT e.full_name INTO v_an FROM assistants a JOIN employees e ON e.employee_id=a.employee_id WHERE a.assistant_id=NEW.assistant_id;
        SET v_msg=CONCAT('Assistant ',NEW.assistant_id,' (',v_an,') on ',v_ac,' consecutive routes (max 2).');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 6) Driver weekly 40h limit (BR-006)
    SET v_nh=TIMESTAMPDIFF(SECOND,NEW.start_time,NEW.end_time)/3600.0;
    SET v_dh=get_driver_weekly_hours(NEW.driver_id,NEW.start_time);
    IF v_dh+v_nh > 40 THEN
        SELECT e.full_name INTO v_dn FROM drivers d JOIN employees e ON e.employee_id=d.employee_id WHERE d.driver_id=NEW.driver_id;
        SET v_msg=CONCAT('Driver ',NEW.driver_id,' (',v_dn,') exceeds 40h limit (already ',ROUND(v_dh,2),'h + ',ROUND(v_nh,2),'h).');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;

    -- 7) Assistant weekly 60h limit (BR-007)
    SET v_ah=get_assistant_weekly_hours(NEW.assistant_id,NEW.start_time);
    IF v_ah+v_nh > 60 THEN
        SELECT e.full_name INTO v_an FROM assistants a JOIN employees e ON e.employee_id=a.employee_id WHERE a.assistant_id=NEW.assistant_id;
        SET v_msg=CONCAT('Assistant ',NEW.assistant_id,' (',v_an,') exceeds 60h limit (already ',ROUND(v_ah,2),'h + ',ROUND(v_nh,2),'h).');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg; END IF;
END;


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
    DECLARE v_locked BIGINT;

    IF @current_app_role NOT IN ('fleet_supervisor','system_administrator') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='schedule_truck_delivery: role not authorized.';
    END IF;
    SELECT max_delivery_time_hours INTO v_hours FROM routes WHERE route_id=p_route_id AND is_deleted=0;
    IF v_hours IS NULL THEN
        SET v_msg=CONCAT('Route ',p_route_id,' not found or inactive.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
    END IF;

    -- (Migration 23) Serialise concurrent schedules for the same resources by
    -- locking their parent rows, in a fixed order. Held until the caller's
    -- transaction ends. Each lookup is by primary key, so it returns one row.
    SELECT truck_id     INTO v_locked FROM trucks     WHERE truck_id=p_truck_id         FOR UPDATE;
    SELECT driver_id    INTO v_locked FROM drivers    WHERE driver_id=p_driver_id       FOR UPDATE;
    SELECT assistant_id INTO v_locked FROM assistants WHERE assistant_id=p_assistant_id FOR UPDATE;

    SET v_end=DATE_ADD(p_start_time, INTERVAL (v_hours*3600) SECOND);
    INSERT INTO truck_schedules(truck_id,driver_id,assistant_id,route_id,start_time,end_time)
    VALUES(p_truck_id,p_driver_id,p_assistant_id,p_route_id,p_start_time,v_end);
    SET p_schedule_id=LAST_INSERT_ID();
END;
