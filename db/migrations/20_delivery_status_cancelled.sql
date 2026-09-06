-- =========================================================
-- 20_delivery_status_cancelled.sql
-- Correct deliveries.status CHECK constraint to include 'Cancelled'
-- Authority: Docs/00_documentation-index.md §84, Docs/03_architecture.md §2.1, Docs/13_system-operation-guide.md §146
-- =========================================================

ALTER TABLE deliveries
    DROP CHECK chk_del_status,
    ADD CONSTRAINT chk_del_status
        CHECK (status IN ('Scheduled', 'In Progress', 'Completed', 'Failed', 'Cancelled'));
