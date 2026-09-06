-- =========================================================
-- 10_functions.sql
-- Helper Functions
-- =========================================================

DROP FUNCTION IF EXISTS fn_week_start;
CREATE FUNCTION fn_week_start(p_ts DATETIME)
RETURNS DATETIME DETERMINISTIC
BEGIN
    RETURN DATE_FORMAT(
        DATE_SUB(p_ts, INTERVAL ((DAYOFWEEK(p_ts) + 5) % 7) DAY),
        '%Y-%m-%d 00:00:00');
END;

DROP FUNCTION IF EXISTS calculate_order_space;
CREATE FUNCTION calculate_order_space(p_order_id BIGINT)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT COALESCE(SUM(quantity * space_rate_at_order),0) INTO v FROM order_items WHERE order_id=p_order_id;
    RETURN v;
END;

DROP FUNCTION IF EXISTS get_available_capacity;
CREATE FUNCTION get_available_capacity(p_trip_id BIGINT)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT (total_capacity - booked_space) INTO v FROM train_trips WHERE trip_id=p_trip_id;
    RETURN v;
END;

DROP FUNCTION IF EXISTS get_driver_weekly_hours;
CREATE FUNCTION get_driver_weekly_hours(p_driver_id BIGINT, p_week_start DATETIME)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND,ts.start_time,ts.end_time)/3600.0),0) INTO v
      FROM truck_schedules ts
     WHERE ts.driver_id=p_driver_id AND ts.status<>'Cancelled'
       AND ts.start_time >= fn_week_start(p_week_start)
       AND ts.start_time <  DATE_ADD(fn_week_start(p_week_start), INTERVAL 7 DAY);
    RETURN v;
END;

DROP FUNCTION IF EXISTS get_assistant_weekly_hours;
CREATE FUNCTION get_assistant_weekly_hours(p_assistant_id BIGINT, p_week_start DATETIME)
RETURNS DECIMAL(10,2) READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v DECIMAL(10,2);
    SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND,ts.start_time,ts.end_time)/3600.0),0) INTO v
      FROM truck_schedules ts
     WHERE ts.assistant_id=p_assistant_id AND ts.status<>'Cancelled'
       AND ts.start_time >= fn_week_start(p_week_start)
       AND ts.start_time <  DATE_ADD(fn_week_start(p_week_start), INTERVAL 7 DAY);
    RETURN v;
END;

DROP FUNCTION IF EXISTS fn_driver_chain_length;
CREATE FUNCTION fn_driver_chain_length(p_driver_id BIGINT, p_new_start DATETIME, p_new_end DATETIME)
RETURNS INT READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v_chain INT DEFAULT 1;
    DECLARE v_cs DATETIME DEFAULT p_new_start;
    DECLARE v_ce DATETIME DEFAULT p_new_end;
    DECLARE v_ps DATETIME DEFAULT NULL;
    DECLARE v_pe DATETIME DEFAULT NULL;
    DECLARE v_ns DATETIME DEFAULT NULL;
    DECLARE v_ne DATETIME DEFAULT NULL;
    chain_back: LOOP
        SET v_ps = NULL;
        SELECT start_time,end_time INTO v_ps,v_pe FROM truck_schedules
         WHERE driver_id=p_driver_id AND status<>'Cancelled'
           AND end_time <= v_cs AND end_time > DATE_SUB(v_cs, INTERVAL 2 HOUR)
         ORDER BY end_time DESC LIMIT 1;
        IF v_ps IS NULL THEN LEAVE chain_back; END IF;
        SET v_chain=v_chain+1; SET v_cs=v_ps;
    END LOOP;
    SET v_ce=p_new_end;
    chain_fwd: LOOP
        SET v_ns=NULL;
        SELECT start_time,end_time INTO v_ns,v_ne FROM truck_schedules
         WHERE driver_id=p_driver_id AND status<>'Cancelled'
           AND start_time >= v_ce AND start_time < DATE_ADD(v_ce, INTERVAL 2 HOUR)
         ORDER BY start_time ASC LIMIT 1;
        IF v_ns IS NULL THEN LEAVE chain_fwd; END IF;
        SET v_chain=v_chain+1; SET v_ce=v_ne;
    END LOOP;
    RETURN v_chain;
END;

DROP FUNCTION IF EXISTS fn_assistant_chain_length;
CREATE FUNCTION fn_assistant_chain_length(p_assistant_id BIGINT, p_new_start DATETIME, p_new_end DATETIME)
RETURNS INT READS SQL DATA DETERMINISTIC
BEGIN
    DECLARE v_chain INT DEFAULT 1;
    DECLARE v_cs DATETIME DEFAULT p_new_start;
    DECLARE v_ce DATETIME DEFAULT p_new_end;
    DECLARE v_ps DATETIME DEFAULT NULL;
    DECLARE v_pe DATETIME DEFAULT NULL;
    DECLARE v_ns DATETIME DEFAULT NULL;
    DECLARE v_ne DATETIME DEFAULT NULL;
    chain_back: LOOP
        SET v_ps=NULL;
        SELECT start_time,end_time INTO v_ps,v_pe FROM truck_schedules
         WHERE assistant_id=p_assistant_id AND status<>'Cancelled'
           AND end_time <= v_cs AND end_time > DATE_SUB(v_cs, INTERVAL 2 HOUR)
         ORDER BY end_time DESC LIMIT 1;
        IF v_ps IS NULL THEN LEAVE chain_back; END IF;
        SET v_chain=v_chain+1; SET v_cs=v_ps;
    END LOOP;
    SET v_ce=p_new_end;
    chain_fwd: LOOP
        SET v_ns=NULL;
        SELECT start_time,end_time INTO v_ns,v_ne FROM truck_schedules
         WHERE assistant_id=p_assistant_id AND status<>'Cancelled'
           AND start_time >= v_ce AND start_time < DATE_ADD(v_ce, INTERVAL 2 HOUR)
         ORDER BY start_time ASC LIMIT 1;
        IF v_ns IS NULL THEN LEAVE chain_fwd; END IF;
        SET v_chain=v_chain+1; SET v_ce=v_ne;
    END LOOP;
    RETURN v_chain;
END;

DROP FUNCTION IF EXISTS get_user_display_name;
CREATE FUNCTION get_user_display_name(p_user_id CHAR(36))
RETURNS VARCHAR(255) READS SQL DATA SQL SECURITY DEFINER
BEGIN
    DECLARE v VARCHAR(255);
    SELECT COALESCE(e.full_name, up.display_name_override) INTO v
      FROM user_profiles up LEFT JOIN employees e ON e.employee_id=up.employee_id
     WHERE up.user_id=p_user_id;
    RETURN v;
END;
