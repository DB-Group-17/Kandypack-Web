-- =========================================================
-- 01_auth.sql (NEW in v4)
-- Replaces Supabase auth.users entirely.
-- Password hashing is done in the application layer (bcrypt).
-- This table only stores the hash — NEVER plaintext.
-- =========================================================

CREATE TABLE users (
    user_id       CHAR(36)     NOT NULL DEFAULT (UUID()),
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_users       PRIMARY KEY (user_id),
    CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
