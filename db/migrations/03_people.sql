-- =========================================================
-- 03_people.sql
-- Employees, Drivers, Assistants, Trucks, User Profiles
-- =========================================================

CREATE TABLE employees (
    employee_id   BIGINT       NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(255) NOT NULL,
    nic_number    VARCHAR(50)  NOT NULL,
    phone         VARCHAR(50)  NOT NULL,
    email         VARCHAR(255) COLLATE utf8mb4_general_ci,
    hire_date     DATE         NOT NULL DEFAULT (CURRENT_DATE),
    employee_type VARCHAR(50)  NOT NULL,
    home_store_id BIGINT,
    is_deleted    TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at    DATETIME,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_employees       PRIMARY KEY (employee_id),
    CONSTRAINT uq_employees_nic   UNIQUE (nic_number),
    CONSTRAINT chk_employee_type  CHECK (employee_type IN
        ('driver','assistant','store_manager','logistics_manager',
         'fleet_supervisor','order_entry_clerk','system_administrator')),
    CONSTRAINT fk_employees_store FOREIGN KEY (home_store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE drivers (
    driver_id      BIGINT       NOT NULL AUTO_INCREMENT,
    employee_id    BIGINT       NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    license_expiry DATE,
    is_deleted     TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at     DATETIME,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_drivers          PRIMARY KEY (driver_id),
    CONSTRAINT uq_drivers_employee UNIQUE (employee_id),
    CONSTRAINT uq_drivers_license  UNIQUE (license_number),
    CONSTRAINT fk_drivers_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assistants (
    assistant_id BIGINT     NOT NULL AUTO_INCREMENT,
    employee_id  BIGINT     NOT NULL,
    is_deleted   TINYINT(1) NOT NULL DEFAULT 0,
    deleted_at   DATETIME,
    created_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_assistants          PRIMARY KEY (assistant_id),
    CONSTRAINT uq_assistants_employee UNIQUE (employee_id),
    CONSTRAINT fk_assistants_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trucks (
    truck_id      BIGINT        NOT NULL AUTO_INCREMENT,
    plate_number  VARCHAR(50)   NOT NULL,
    capacity_kg   DECIMAL(10,2),
    home_store_id BIGINT,
    is_deleted    TINYINT(1)    NOT NULL DEFAULT 0,
    deleted_at    DATETIME,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_trucks       PRIMARY KEY (truck_id),
    CONSTRAINT uq_trucks_plate UNIQUE (plate_number),
    CONSTRAINT fk_trucks_store FOREIGN KEY (home_store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_profiles: maps users -> employee + business role
CREATE TABLE user_profiles (
    user_id               CHAR(36)    NOT NULL,
    employee_id           BIGINT,
    app_role              VARCHAR(50) NOT NULL,
    is_active             TINYINT(1)  NOT NULL DEFAULT 1,
    created_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    display_name_override VARCHAR(255),
    CONSTRAINT pk_user_profiles       PRIMARY KEY (user_id),
    CONSTRAINT uq_user_profiles_emp   UNIQUE (employee_id),
    CONSTRAINT chk_user_profiles_role CHECK (app_role IN
        ('logistics_manager','order_entry_clerk','store_manager',
         'fleet_supervisor','system_administrator')),
    -- display_name_override is only set when employee_id IS NULL
    CONSTRAINT chk_user_profiles_name CHECK (
        (employee_id IS NOT NULL AND display_name_override IS NULL)
        OR (employee_id IS NULL AND display_name_override IS NOT NULL)
    ),
    CONSTRAINT fk_up_user     FOREIGN KEY (user_id)     REFERENCES users(user_id),
    CONSTRAINT fk_up_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
