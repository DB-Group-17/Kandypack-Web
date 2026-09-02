-- =========================================================
-- 02_master.sql
-- Cities, Customers, Products, Stores
-- =========================================================

CREATE TABLE cities (
    city_id        BIGINT       NOT NULL AUTO_INCREMENT,
    city_name      VARCHAR(150) NOT NULL COLLATE utf8mb4_general_ci,
    is_origin      TINYINT(1)   NOT NULL DEFAULT 0,
    is_destination TINYINT(1)   NOT NULL DEFAULT 0,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_cities      PRIMARY KEY (city_id),
    CONSTRAINT uq_cities_name UNIQUE (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
    customer_id        BIGINT       NOT NULL AUTO_INCREMENT,
    customer_name      VARCHAR(255) NOT NULL,
    customer_type      VARCHAR(20)  NOT NULL DEFAULT 'retail',
    phone              VARCHAR(50)  NOT NULL,
    email              VARCHAR(255) COLLATE utf8mb4_general_ci,
    registered_city_id BIGINT,
    address_line       TEXT,
    is_deleted         TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at         DATETIME,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_customers      PRIMARY KEY (customer_id),
    CONSTRAINT chk_customer_type CHECK (customer_type IN ('retail','wholesale')),
    CONSTRAINT fk_customers_city FOREIGN KEY (registered_city_id) REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    product_id      BIGINT        NOT NULL AUTO_INCREMENT,
    sku             VARCHAR(100)  NOT NULL,
    product_name    VARCHAR(255)  NOT NULL,
    category        VARCHAR(100),
    unit_of_measure VARCHAR(50)   NOT NULL DEFAULT 'unit',
    unit_price      DECIMAL(12,2) NOT NULL,
    space_rate      DECIMAL(10,4) NOT NULL,
    is_deleted      TINYINT(1)    NOT NULL DEFAULT 0,
    deleted_at      DATETIME,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_products        PRIMARY KEY (product_id),
    CONSTRAINT uq_products_sku    UNIQUE (sku),
    CONSTRAINT chk_products_price CHECK (unit_price >= 0),
    CONSTRAINT chk_products_space CHECK (space_rate > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stores (
    store_id             BIGINT       NOT NULL AUTO_INCREMENT,
    city_id              BIGINT       NOT NULL,
    store_name           VARCHAR(255) NOT NULL,
    railway_station_name VARCHAR(255),
    address_line         TEXT,
    contact_phone        VARCHAR(50),
    is_deleted           TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at           DATETIME,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_stores      PRIMARY KEY (store_id),
    CONSTRAINT uq_stores_city UNIQUE (city_id),
    CONSTRAINT fk_stores_city FOREIGN KEY (city_id) REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
