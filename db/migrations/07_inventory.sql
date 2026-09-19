-- =========================================================
-- 07_inventory.sql
-- Store Inventory and Inventory Transactions
-- NOTE: delivery_id FK is closed after 08_fleet.sql via ALTER TABLE.
-- =========================================================

CREATE TABLE store_inventory (
    inventory_id     BIGINT        NOT NULL AUTO_INCREMENT,
    store_id         BIGINT        NOT NULL,
    product_id       BIGINT        NOT NULL,
    quantity_on_hand DECIMAL(12,2) NOT NULL DEFAULT 0,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_store_inventory               PRIMARY KEY (inventory_id),
    CONSTRAINT uq_store_inventory_store_product UNIQUE (store_id, product_id),
    CONSTRAINT chk_si_qty    CHECK (quantity_on_hand >= 0),
    CONSTRAINT fk_si_store   FOREIGN KEY (store_id)   REFERENCES stores(store_id),
    CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_store_inventory_store ON store_inventory (store_id);

CREATE TABLE inventory_transactions (
    transaction_id   BIGINT        NOT NULL AUTO_INCREMENT,
    store_id         BIGINT        NOT NULL,
    product_id       BIGINT        NOT NULL,
    change_qty       DECIMAL(12,2) NOT NULL,
    transaction_type VARCHAR(20)   NOT NULL,
    train_booking_id BIGINT,
    delivery_id      BIGINT,        -- FK closed in 08_fleet.sql
    created_by       CHAR(36),
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_inventory_transactions PRIMARY KEY (transaction_id),
    CONSTRAINT chk_it_type CHECK (transaction_type IN ('receive','dispatch','adjustment')),
    CONSTRAINT chk_it_fk_consistency CHECK (
        (transaction_type = 'receive'    AND train_booking_id IS NOT NULL AND delivery_id IS NULL)
        OR (transaction_type = 'dispatch'   AND delivery_id IS NOT NULL AND train_booking_id IS NULL)
        OR (transaction_type = 'adjustment' AND train_booking_id IS NULL AND delivery_id IS NULL)
    ),
    CONSTRAINT fk_it_store   FOREIGN KEY (store_id)         REFERENCES stores(store_id),
    CONSTRAINT fk_it_product FOREIGN KEY (product_id)       REFERENCES products(product_id),
    CONSTRAINT fk_it_booking FOREIGN KEY (train_booking_id) REFERENCES train_bookings(booking_id),
    CONSTRAINT fk_it_created FOREIGN KEY (created_by)       REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_inventory_txn_store_product ON inventory_transactions (store_id, product_id);
CREATE INDEX idx_inventory_txn_booking       ON inventory_transactions (train_booking_id);
CREATE INDEX idx_inventory_txn_delivery      ON inventory_transactions (delivery_id);
