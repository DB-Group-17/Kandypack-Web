-- =========================================================
-- 13_trg_truck_schedule.sql
-- Truck Schedule Validation Triggers
-- Overlaps, Roster Breaks (BR-004, BR-005),
-- Weekly Hour Limits (BR-006, BR-007)
-- =========================================================

DROP TRIGGER IF EXISTS trg_validate_truck_schedule;
CREATE TRIGGER trg_validate_truck_schedule BEFORE INSERT ON truck_schedules FOR EACH ROW
BEGIN
    DECLARE v_cid BIGINT DEFAULT NULL; DECLARE v_cs DATETIME; DECLARE v_ce DATETIME;
    DECLARE v_dc INT; DECLARE v_ac INT;
    DECLARE v_dh DECIMAL(10,2); DECLARE v_ah DECIMAL(10,2); DECLARE v_nh DECIMAL(10,2);
    DECLARE v_dn VARCHAR(255); DECLARE v_an VARCHAR(255); DECLARE v_msg VARCHAR(500);

    SELECT schedule_id INTO @_lock FROM truck_schedules
     WHERE (truck_id=NEW.truck_id OR driver_id=NEW.driver_id OR assistant_id=NEW.assistant_id)
       AND status<>'Cancelled' ORDER BY schedule_id FOR UPDATE;

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
