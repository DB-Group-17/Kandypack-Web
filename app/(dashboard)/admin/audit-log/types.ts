/**
 * @file types.ts
 * @description Type definitions for the /admin/audit-log module.
 * Conforms to the audit_log schema and GET /api/audit-log endpoint specification in Docs/05_api-and-pages.md §313.
 */

/**
 * Valid audit log action types recorded by database triggers.
 */
export type AuditActionType = 'Created' | 'Updated' | 'Deleted';

/**
 * Represents a single audit log record from the audit_log table.
 */
export interface AuditLogItem {
  /** Unique primary key identifier for the audit log record */
  log_id: number;
  /** Name of the database table that was modified (e.g., 'orders', 'inventory', 'users') */
  table_name: string;
  /** Primary identifier of the affected record (e.g., 'ORD-2023-9942', 'INV-8831') */
  record_id: string;
  /** Nature of the database mutation */
  action: AuditActionType;
  /** User ID who triggered the action or 0/null for system triggers */
  user_id: number;
  /** Human-readable display name of the actor */
  user_name: string;
  /** Two-letter initials for avatar badge display */
  user_initials: string;
  /** ISO 8601 timestamp string when the mutation occurred */
  changed_at: string;
  /** Snapshot of the record before the mutation (null for insert/Created) */
  old_data: Record<string, unknown> | null;
  /** Snapshot of the record after the mutation (null for delete/Deleted) */
  new_data: Record<string, unknown> | null;
}

/**
 * State structure for filtering the audit log view.
 */
export interface AuditLogFilters {
  /** Filter by database table name or empty string for all tables */
  tableName: string;
  /** Filter by user identifier/name or empty string for all users */
  user: string;
  /** Start date threshold in YYYY-MM-DD format */
  dateFrom: string;
  /** End date threshold in YYYY-MM-DD format */
  dateTo: string;
}

/**
 * Pagination state interface.
 */
export interface PaginationState {
  /** Current active 1-indexed page number */
  currentPage: number;
  /** Total number of items per page */
  pageSize: number;
  /** Total count of matching records */
  totalCount: number;
}
