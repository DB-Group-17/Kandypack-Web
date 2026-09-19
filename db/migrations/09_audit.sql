-- =========================================================
-- 09_audit.sql
-- Audit Log Table
-- =========================================================

CREATE TABLE audit_log (
    log_id     BIGINT       NOT NULL AUTO_INCREMENT,
    table_name VARCHAR(100) NOT NULL,
    record_id  BIGINT,
    action     VARCHAR(10)  NOT NULL,
    user_id    CHAR(36),
    old_data   JSON,
    new_data   JSON,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_audit_log PRIMARY KEY (log_id),
    CONSTRAINT chk_al_action CHECK (action IN ('INSERT','UPDATE','DELETE')),
    CONSTRAINT fk_al_user   FOREIGN KEY (user_id) REFERENCES user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_created_at   ON audit_log (created_at);
