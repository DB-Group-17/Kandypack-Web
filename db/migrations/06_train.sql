-- =========================================================
-- 06_train.sql
-- Train Trips, Train Bookings, and Train Booking Items
-- =========================================================

CREATE TABLE train_trips (
    trip_id             BIGINT        NOT NULL AUTO_INCREMENT,
    destination_city_id BIGINT        NOT NULL,
    departure_datetime  DATETIME      NOT NULL,
    arrival_datetime    DATETIME      NOT NULL,
    total_capacity      DECIMAL(10,2) NOT NULL,
    booked_space        DECIMAL(10,2) NOT NULL DEFAULT 0,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Scheduled',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_train_trips      PRIMARY KEY (trip_id),
    CONSTRAINT chk_tt_capacity     CHECK (total_capacity > 0),
    CONSTRAINT chk_tt_booked       CHECK (booked_space >= 0),
    CONSTRAINT chk_tt_arrival      CHECK (arrival_datetime > departure_datetime),
    CONSTRAINT chk_tt_not_overbook CHECK (booked_space <= total_capacity),
    CONSTRAINT chk_tt_status       CHECK (status IN ('Scheduled','Departed','Arrived','Cancelled')),
    CONSTRAINT fk_tt_city FOREIGN KEY (destination_city_id) REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_train_trips_dest_departure ON train_trips (destination_city_id, departure_datetime);

CREATE TABLE train_bookings (
    booking_id   BIGINT        NOT NULL AUTO_INCREMENT,
    trip_id      BIGINT        NOT NULL,
    order_id     BIGINT        NOT NULL,
    space_booked DECIMAL(10,2) NOT NULL,
    booked_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_train_bookings PRIMARY KEY (booking_id),
    CONSTRAINT chk_tb_space CHECK (space_booked > 0),
    CONSTRAINT fk_tb_trip  FOREIGN KEY (trip_id)  REFERENCES train_trips(trip_id),
    CONSTRAINT fk_tb_order FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_train_bookings_trip  ON train_bookings (trip_id);
CREATE INDEX idx_train_bookings_order ON train_bookings (order_id);

CREATE TABLE train_booking_items (
    booking_item_id  BIGINT        NOT NULL AUTO_INCREMENT,
    booking_id       BIGINT        NOT NULL,
    order_item_id    BIGINT        NOT NULL,
    quantity_shipped DECIMAL(10,2) NOT NULL,
    space_consumed   DECIMAL(10,2) NOT NULL,
    CONSTRAINT pk_train_booking_items PRIMARY KEY (booking_item_id),
    CONSTRAINT chk_tbi_qty   CHECK (quantity_shipped > 0),
    CONSTRAINT chk_tbi_space CHECK (space_consumed > 0),
    CONSTRAINT fk_tbi_booking    FOREIGN KEY (booking_id)    REFERENCES train_bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT fk_tbi_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_booking_items_booking    ON train_booking_items (booking_id);
CREATE INDEX idx_booking_items_order_item ON train_booking_items (order_item_id);
