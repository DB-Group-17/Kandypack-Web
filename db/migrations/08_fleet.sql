-- =========================================================
-- 08_fleet.sql
-- Truck Schedules and Deliveries
-- Also closes the circular FK on inventory_transactions(delivery_id)
-- =========================================================

CREATE TABLE truck_schedules (
    schedule_id  BIGINT      NOT NULL AUTO_INCREMENT,
    truck_id     BIGINT      NOT NULL,
    driver_id    BIGINT      NOT NULL,
    assistant_id BIGINT      NOT NULL,
    route_id     BIGINT      NOT NULL,
    start_time   DATETIME    NOT NULL,
    end_time     DATETIME    NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_truck_schedules     PRIMARY KEY (schedule_id),
    CONSTRAINT chk_ts_status          CHECK (status IN ('Scheduled','In Progress','Completed','Cancelled')),
    CONSTRAINT chk_ts_end_after_start CHECK (end_time > start_time),
    -- Operating hours 06:00–20:00 same calendar day (MySQL syntax)
    CONSTRAINT chk_ts_operating_hours CHECK (
        TIME(start_time) >= '06:00:00'
        AND TIME(end_time) <= '20:00:00'
        AND DATE(start_time) = DATE(end_time)
    ),
    CONSTRAINT fk_ts_truck     FOREIGN KEY (truck_id)     REFERENCES trucks(truck_id),
    CONSTRAINT fk_ts_driver    FOREIGN KEY (driver_id)    REFERENCES drivers(driver_id),
    CONSTRAINT fk_ts_assistant FOREIGN KEY (assistant_id) REFERENCES assistants(assistant_id),
    CONSTRAINT fk_ts_route     FOREIGN KEY (route_id)     REFERENCES routes(route_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_truck_schedules_truck_time     ON truck_schedules (truck_id, start_time, end_time);
CREATE INDEX idx_truck_schedules_driver_time    ON truck_schedules (driver_id, start_time, end_time);
CREATE INDEX idx_truck_schedules_assistant_time ON truck_schedules (assistant_id, start_time, end_time);
CREATE INDEX idx_truck_schedules_start_end      ON truck_schedules (start_time, end_time);

CREATE TABLE deliveries (
    delivery_id       BIGINT      NOT NULL AUTO_INCREMENT,
    order_id          BIGINT      NOT NULL,
    truck_schedule_id BIGINT      NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    delivered_at      DATETIME,
    notes             TEXT,
    exception_reason  TEXT,
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_deliveries   PRIMARY KEY (delivery_id),
    CONSTRAINT chk_del_status  CHECK (status IN ('Scheduled','In Progress','Completed','Failed')),
    CONSTRAINT fk_del_order    FOREIGN KEY (order_id)          REFERENCES orders(order_id),
    CONSTRAINT fk_del_schedule FOREIGN KEY (truck_schedule_id) REFERENCES truck_schedules(schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_deliveries_order    ON deliveries (order_id);
CREATE INDEX idx_deliveries_schedule ON deliveries (truck_schedule_id);

-- Close the circular FK: inventory_transactions.delivery_id -> deliveries
ALTER TABLE inventory_transactions
    ADD CONSTRAINT fk_it_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(delivery_id);
