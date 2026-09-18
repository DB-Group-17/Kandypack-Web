/**
 * @file types/master-data.ts
 * @description Canonical TypeScript types and shared definitions for Master Data entities (Member 4).
 * Conforms to Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §2.3, and Docs/05_api-and-pages.md §A3.
 */

/**
 * Valid employee roles matching the database check constraint `chk_employee_type` in db/migrations/03_people.sql.
 * Used across both API route handlers and dashboard administrative interfaces.
 */
export type EmployeeRole =
  | 'system_administrator'
  | 'logistics_manager'
  | 'order_entry_clerk'
  | 'store_manager'
  | 'fleet_supervisor'
  | 'driver'
  | 'assistant';
