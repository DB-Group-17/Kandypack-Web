/**
 * @file mockData.ts
 * @description Static mock audit records for the /admin/audit-log static frontend shell.
 * Matches the reference mock data and structure in UI/audit_log/code.html and Docs/05_api-and-pages.md.
 */

import { AuditLogItem } from './types';

/**
 * Static baseline mock audit records matching the UI/audit_log reference dataset.
 */
export const MOCK_AUDIT_LOGS: AuditLogItem[] = [
  {
    log_id: 1,
    table_name: 'orders',
    record_id: 'ORD-2023-9942',
    action: 'Updated',
    user_id: 1,
    user_name: 'John Doe',
    user_initials: 'JD',
    changed_at: '2023-10-24T14:32:05Z',
    old_data: {
      status: 'Pending',
      expected_delivery: '2023-11-01',
    },
    new_data: {
      status: 'In Transit',
      expected_delivery: '2023-11-01',
    },
  },
  {
    log_id: 2,
    table_name: 'inventory',
    record_id: 'INV-8831',
    action: 'Created',
    user_id: 0,
    user_name: 'System',
    user_initials: 'SYS',
    changed_at: '2023-10-24T11:15:22Z',
    old_data: null,
    new_data: {
      product_id: 'PRD-102',
      store_id: 'STR-KNDY-01',
      quantity: 500,
      batch_no: 'B-99201',
    },
  },
  {
    log_id: 3,
    table_name: 'users',
    record_id: 'USR-0042',
    action: 'Deleted',
    user_id: 1,
    user_name: 'John Doe',
    user_initials: 'JD',
    changed_at: '2023-10-23T16:45:01Z',
    old_data: {
      email: 'temp.staff@kandypack.lk',
      role: 'Order Entry Clerk',
      status: 'Active',
    },
    new_data: null,
  },
  {
    log_id: 4,
    table_name: 'truck_schedules',
    record_id: 'SCH-TRK-882',
    action: 'Updated',
    user_id: 3,
    user_name: 'Alice Smith',
    user_initials: 'AS',
    changed_at: '2023-10-23T09:20:11Z',
    old_data: {
      driver_id: 'EMP-D-012',
      status: 'Scheduled',
    },
    new_data: {
      driver_id: 'EMP-D-015',
      status: 'Scheduled',
    },
  },
];

/**
 * List of available tracked database table options for the filter selector.
 */
export const AVAILABLE_TABLES = [
  { value: '', label: 'All Tables' },
  { value: 'orders', label: 'Orders' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'users', label: 'Users' },
  { value: 'truck_schedules', label: 'Truck Schedule' },
  { value: 'train_trips', label: 'Train Schedule' },
];

/**
 * List of available user options for the filter selector.
 */
export const AVAILABLE_USERS = [
  { value: '', label: 'All Users' },
  { value: 'John Doe', label: 'John Doe' },
  { value: 'Jane Smith', label: 'Jane Smith' },
  { value: 'Alice Smith', label: 'Alice Smith' },
  { value: 'System', label: 'System' },
];
