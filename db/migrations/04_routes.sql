-- =========================================================
-- 04_routes.sql
-- Routes and Route Coverage Areas
-- =========================================================

CREATE TABLE routes (
    route_id                BIGINT       NOT NULL AUTO_INCREMENT,
    store_id                BIGINT       NOT NULL,
    route_name              VARCHAR(255) NOT NULL,
    coverage_description    TEXT,
    max_delivery_time_hours DECIMAL(4,2) NOT NULL,
    is_deleted              TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at              DATETIME,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_routes       PRIMARY KEY (route_id),
    CONSTRAINT chk_routes_time CHECK (max_delivery_time_hours > 0),
    CONSTRAINT fk_routes_store FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE route_coverage_areas (
    coverage_id BIGINT       NOT NULL AUTO_INCREMENT,
    route_id    BIGINT       NOT NULL,
    city_id     BIGINT       NOT NULL,
    area_name   VARCHAR(255) NOT NULL COLLATE utf8mb4_general_ci,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_route_coverage_areas   PRIMARY KEY (coverage_id),
    CONSTRAINT uq_coverage_area_per_city UNIQUE (city_id, area_name),
    CONSTRAINT fk_coverage_route FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE CASCADE,
    CONSTRAINT fk_coverage_city  FOREIGN KEY (city_id)  REFERENCES cities(city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
