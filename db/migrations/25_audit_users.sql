-- =========================================================
-- 25_audit_users.sql
-- Audit triggers for login accounts: `users` and `user_profiles`.
--
-- WHY: Docs/13_system-operation-guide.md §11 and SRS REQ-NF-012 require account creation,
-- deactivation, reactivation and role changes to be audited. Migration 15 audits 13 business
-- tables but neither of these two, and the routes (POST /api/users, PATCH /api/users/:id)
-- deliberately do not write audit rows themselves, so every table is audited the same way.
--
-- DESIGN (Docs/03_architecture.md §19):
--   * audit_log.record_id is BIGINT but user ids are CHAR(36) UUIDs, so record_id is left
--     NULL and the account's UUID is stored inside old_data / new_data as 'user_id'.
--     The audit-log page filters by table name and date, so a NULL record_id is acceptable.
--   * password_hash is NEVER written to the log (it is not referenced anywhere below).
--   * No DELETE triggers: accounts are soft-deactivated (is_active = 0), never deleted.
--   * Avoid duplicate rows: PATCH /api/users/:id sets is_active on BOTH tables, so
--       - user_profiles triggers audit is_active / app_role / employee link / display name;
--       - the users UPDATE trigger audits only an email change.
--     One deactivation, reactivation or role change therefore writes exactly ONE row.
--   * audit_log.user_id has a FK to user_profiles(user_id). The acting admin always has a
--     profile, but the bootstrap seed creates the first account with @current_user_id unset,
--     and an account's own insert trigger can run before its profile row is visible to a
--     caller that already set @current_user_id to it. The actor is therefore resolved with
--     a lookup that yields NULL when no matching profile exists, so these triggers can never
--     fail an account insert on the audit FK.
--
-- ROLLBACK (additive migration, no data changed): drop the four triggers below.
--   DROP TRIGGER IF EXISTS trg_audit_users_ins;
--   DROP TRIGGER IF EXISTS trg_audit_users_upd;
--   DROP TRIGGER IF EXISTS trg_audit_user_profiles_ins;
--   DROP TRIGGER IF EXISTS trg_audit_user_profiles_upd;
-- Existing audit_log rows written by these triggers are history and are left in place.
-- =========================================================

-- 1. users: account creation
DROP TRIGGER IF EXISTS trg_audit_users_ins;
CREATE TRIGGER trg_audit_users_ins AFTER INSERT ON users FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('users',NULL,'INSERT',
        (SELECT up.user_id FROM user_profiles up WHERE up.user_id=@current_user_id),
        JSON_OBJECT('user_id',NEW.user_id,'email',NEW.email,'is_active',NEW.is_active));
END;

-- 2. users: only an email change is audited here (is_active is audited on user_profiles)
DROP TRIGGER IF EXISTS trg_audit_users_upd;
CREATE TRIGGER trg_audit_users_upd AFTER UPDATE ON users FOR EACH ROW
BEGIN
    IF NOT (OLD.email <=> NEW.email) THEN
        INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
        VALUES('users',NULL,'UPDATE',
            (SELECT up.user_id FROM user_profiles up WHERE up.user_id=@current_user_id),
            JSON_OBJECT('user_id',OLD.user_id,'email',OLD.email,'is_active',OLD.is_active),
            JSON_OBJECT('user_id',NEW.user_id,'email',NEW.email,'is_active',NEW.is_active));
    END IF;
END;

-- 3. user_profiles: profile creation (role and employee link assigned)
DROP TRIGGER IF EXISTS trg_audit_user_profiles_ins;
CREATE TRIGGER trg_audit_user_profiles_ins AFTER INSERT ON user_profiles FOR EACH ROW
BEGIN
    INSERT INTO audit_log(table_name,record_id,action,user_id,new_data)
    VALUES('user_profiles',NULL,'INSERT',
        (SELECT up.user_id FROM user_profiles up WHERE up.user_id=@current_user_id),
        JSON_OBJECT('user_id',NEW.user_id,'employee_id',NEW.employee_id,'app_role',NEW.app_role,
            'is_active',NEW.is_active,'display_name_override',NEW.display_name_override));
END;

-- 4. user_profiles: role change, deactivation / reactivation, employee link or display name
DROP TRIGGER IF EXISTS trg_audit_user_profiles_upd;
CREATE TRIGGER trg_audit_user_profiles_upd AFTER UPDATE ON user_profiles FOR EACH ROW
BEGIN
    IF NOT (OLD.employee_id <=> NEW.employee_id)
       OR NOT (OLD.app_role <=> NEW.app_role)
       OR NOT (OLD.is_active <=> NEW.is_active)
       OR NOT (OLD.display_name_override <=> NEW.display_name_override) THEN
        INSERT INTO audit_log(table_name,record_id,action,user_id,old_data,new_data)
        VALUES('user_profiles',NULL,'UPDATE',
            (SELECT up.user_id FROM user_profiles up WHERE up.user_id=@current_user_id),
            JSON_OBJECT('user_id',OLD.user_id,'employee_id',OLD.employee_id,'app_role',OLD.app_role,
                'is_active',OLD.is_active,'display_name_override',OLD.display_name_override),
            JSON_OBJECT('user_id',NEW.user_id,'employee_id',NEW.employee_id,'app_role',NEW.app_role,
                'is_active',NEW.is_active,'display_name_override',NEW.display_name_override));
    END IF;
END;
