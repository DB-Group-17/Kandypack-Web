/**
 * @file types.ts
 * @description TypeScript interface and type declarations for the User Accounts management interface (/admin/users).
 * Defines data structures for user profiles, employee references, KPI statistics, filter criteria, and creation payloads.
 */

/**
 * Valid system application roles defined in the schema and RBAC policy.
 * Only these 5 roles authenticate into the system.
 */
export type AppRole =
  | 'system_administrator'
  | 'logistics_manager'
  | 'order_entry_clerk'
  | 'store_manager'
  | 'fleet_supervisor';

/**
 * User account record representing a user in the database.
 * Formed by joining the `users` and `user_profiles` tables with optional `employees` and `stores` links.
 */
export interface UserAccountItem {
  /** Unique UUID identifier */
  user_id: string;
  /** Primary login email address */
  email: string;
  /** Business role determining permissions */
  app_role: AppRole;
  /** Active status (1 = active, 0 = deactivated) */
  is_active: boolean;
  /** ISO date string of account creation */
  created_at: string;
  /** Optional linked employee record ID */
  employee_id?: number | null;
  /** Full display name derived from linked employee or display_name_override */
  display_name: string;
  /** Department, store name, or job title subtitle */
  department_or_title: string;
  /** Associated store name if applicable (e.g. for store managers) */
  home_store_name?: string;
  /** Optional avatar image URL or fallback placeholder */
  avatar_url?: string;
}

/**
 * Employee option structure for the "Link to employee" selection dropdown.
 */
export interface EmployeeOption {
  /** Employee record ID */
  employee_id: number;
  /** Employee's legal full name */
  full_name: string;
  /** National Identity Card number */
  nic_number: string;
  /** Employee type category */
  employee_type: string;
  /** Home store ID if assigned */
  home_store_id?: number | null;
  /** Home store name if assigned */
  home_store_name?: string;
}

/**
 * Aggregated KPI metric statistics for the User Accounts Bento overview.
 */
export interface UserStats {
  /** Total count of user accounts */
  totalUsers: number;
  /** Count of active user accounts */
  activeUsers: number;
  /** Count of deactivated user accounts */
  deactivatedUsers: number;
  /** Count of system administrator accounts */
  adminUsers: number;
}

/**
 * Payload data for creating a new user account via the Add User modal.
 */
export interface NewUserPayload {
  /** Login email address */
  email: string;
  /** Selected application role */
  app_role: AppRole;
  /** Optional linked employee ID */
  employee_id?: number | null;
  /** Display name override if employee is not linked */
  display_name_override?: string;
  /** Generated or entered temporary password */
  temp_password: string;
}

/**
 * Filter criteria state for searching and scoping user accounts.
 */
export interface UserFilterState {
  /** Search query string matching name or email */
  searchQuery: string;
  /** Role filter ('ALL' or specific AppRole) */
  roleFilter: 'ALL' | AppRole;
  /** Status filter ('ALL' | 'ACTIVE' | 'DEACTIVATED') */
  statusFilter: 'ALL' | 'ACTIVE' | 'DEACTIVATED';
}

/**
 * Pagination state interface.
 */
export interface PaginationState {
  /** Current active page (1-indexed) */
  currentPage: number;
  /** Items per page */
  pageSize: number;
  /** Total matching records */
  totalItems: number;
}
