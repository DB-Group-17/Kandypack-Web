-- =========================================================
-- 05_orders.sql
-- Orders, Order Items, and Order Status History
-- =========================================================

CREATE TABLE orders (
    order_id               BIGINT        NOT NULL AUTO_INCREMENT,
    customer_id            BIGINT        NOT NULL,
    delivery_address       TEXT          NOT NULL,
    delivery_area          VARCHAR(255)  NOT NULL COLLATE utf8mb4_general_ci,
    destination_city_id    BIGINT        NOT NULL,
    route_id               BIGINT,
    order_placed_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expected_delivery_date DATE          NOT NULL,
    status                 VARCHAR(30)   NOT NULL DEFAULT 'Pending',
    total_value            DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_space_required   DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_by             CHAR(36),
    created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_orders           PRIMARY KEY (order_id),
    CONSTRAINT chk_orders_status   CHECK (status IN
        ('Pending','In Transit','At Store','Out for Delivery','Delivered','Cancelled')),
    CONSTRAINT chk_orders_value    CHECK (total_value >= 0),
    CONSTRAINT chk_orders_space    CHECK (total_space_required >= 0),
    CONSTRAINT chk_orders_min_lead CHECK (DATEDIFF(expected_delivery_date, DATE(order_placed_at)) >= 7),
    CONSTRAINT fk_orders_customer  FOREIGN KEY (customer_id)         REFERENCES customers(customer_id),
    CONSTRAINT fk_orders_city      FOREIGN KEY (destination_city_id) REFERENCES cities(city_id),
    CONSTRAINT fk_orders_route     FOREIGN KEY (route_id)            REFERENCES routes(route_id),
    CONSTRAINT fk_orders_created   FOREIGN KEY (created_by)          REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_orders_customer          ON orders (customer_id);
CREATE INDEX idx_orders_status            ON orders (status);
CREATE INDEX idx_orders_expected_delivery ON orders (expected_delivery_date);
CREATE INDEX idx_orders_city_placed       ON orders (destination_city_id, order_placed_at);

CREATE TABLE order_items (
    order_item_id       BIGINT        NOT NULL AUTO_INCREMENT,
    order_id            BIGINT        NOT NULL,
    product_id          BIGINT        NOT NULL,
    quantity            DECIMAL(10,2) NOT NULL,
    unit_price_at_order DECIMAL(12,2) NOT NULL,
    space_rate_at_order DECIMAL(10,4) NOT NULL,
    -- Generated columns: stored
    line_space DECIMAL(10,2) GENERATED ALWAYS AS (quantity * space_rate_at_order) STORED,
    line_value DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price_at_order) STORED,
    CONSTRAINT pk_order_items  PRIMARY KEY (order_item_id),
    CONSTRAINT chk_oi_quantity CHECK (quantity > 0),
    CONSTRAINT chk_oi_price    CHECK (unit_price_at_order >= 0),
    CONSTRAINT chk_oi_space    CHECK (space_rate_at_order > 0),
    CONSTRAINT fk_oi_order     FOREIGN KEY (order_id)   REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_oi_product   FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

CREATE TABLE order_status_history (
    history_id BIGINT      NOT NULL AUTO_INCREMENT,
    order_id   BIGINT      NOT NULL,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by CHAR(36),
    notes      TEXT,
    CONSTRAINT pk_order_status_history PRIMARY KEY (history_id),
    CONSTRAINT fk_osh_order      FOREIGN KEY (order_id)   REFERENCES orders(order_id),
    CONSTRAINT fk_osh_changed_by FOREIGN KEY (changed_by) REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_order_status_history_order ON order_status_history (order_id);
