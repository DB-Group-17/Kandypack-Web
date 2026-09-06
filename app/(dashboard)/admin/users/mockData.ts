/**
 * @file mockData.ts
 * @description Mock dataset and utility helpers for the User Accounts management interface (/admin/users).
 * Conforms to Kandypack schema v4, seed-data specification, and DESIGN.md styling guidelines.
 */

import { UserAccountItem, EmployeeOption, UserStats, UserFilterState, AppRole } from './types';

/**
 * Baseline mock employee roster available for linking when creating user accounts.
 * Derived from the seed data specification for store managers, supervisors, and administrative staff.
 */
export const initialMockEmployees: EmployeeOption[] = [
  {
    employee_id: 1,
    full_name: 'John Doe',
    nic_number: '198512345678',
    employee_type: 'system_administrator',
    home_store_id: null,
    home_store_name: 'Central HQ (Kandy)',
  },
  {
    employee_id: 2,
    full_name: 'Saman Jayawardena',
    nic_number: '198823456789',
    employee_type: 'logistics_manager',
    home_store_id: null,
    home_store_name: 'Central HQ (Kandy)',
  },
  {
    employee_id: 3,
    full_name: 'Priyantha Kumara',
    nic_number: '198634567890',
    employee_type: 'logistics_manager',
    home_store_id: null,
    home_store_name: 'Central HQ (Kandy)',
  },
  {
    employee_id: 4,
    full_name: 'Anura Bandara',
    nic_number: '199045678901',
    employee_type: 'store_manager',
    home_store_id: 1,
    home_store_name: 'Colombo Station Store',
  },
  {
    employee_id: 5,
    full_name: 'Chaminda Silva',
    nic_number: '198956789012',
    employee_type: 'store_manager',
    home_store_id: 2,
    home_store_name: 'Negombo Station Store',
  },
  {
    employee_id: 6,
    full_name: 'Kasun Rajapaksha',
    nic_number: '199167890123',
    employee_type: 'store_manager',
    home_store_id: 3,
    home_store_name: 'Galle Station Store',
  },
  {
    employee_id: 7,
    full_name: 'Dinesh Wickramasinghe',
    nic_number: '198778901234',
    employee_type: 'store_manager',
    home_store_id: 4,
    home_store_name: 'Matara Station Store',
  },
  {
    employee_id: 8,
    full_name: 'Kandeepan Thambirajah',
    nic_number: '199289012345',
    employee_type: 'store_manager',
    home_store_id: 5,
    home_store_name: 'Jaffna Station Store',
  },
  {
    employee_id: 9,
    full_name: 'Mohamed Rizwan',
    nic_number: '199090123456',
    employee_type: 'store_manager',
    home_store_id: 6,
    home_store_name: 'Trincomalee Station Store',
  },
  {
    employee_id: 10,
    full_name: 'Rohan Senanayake',
    nic_number: '198401234567',
    employee_type: 'fleet_supervisor',
    home_store_id: null,
    home_store_name: 'Western Fleet Hub',
  },
  {
    employee_id: 11,
    full_name: 'Lasantha Fernando',
    nic_number: '198912345670',
    employee_type: 'fleet_supervisor',
    home_store_id: null,
    home_store_name: 'Southern Fleet Hub',
  },
  {
    employee_id: 12,
    full_name: 'Tharushi De Silva',
    nic_number: '199523456781',
    employee_type: 'order_entry_clerk',
    home_store_id: null,
    home_store_name: 'Central Order Desk',
  },
  {
    employee_id: 13,
    full_name: 'Nuwan Pradeep',
    nic_number: '199434567892',
    employee_type: 'order_entry_clerk',
    home_store_id: null,
    home_store_name: 'Central Order Desk',
  },
  {
    employee_id: 14,
    full_name: 'Sanduni Wijesinghe',
    nic_number: '199645678903',
    employee_type: 'order_entry_clerk',
    home_store_id: null,
    home_store_name: 'Central Order Desk',
  },
];

/**
 * Initial dataset of user accounts populated with realistic records.
 * Covers all 5 application roles, various store assignments, and active/deactivated states.
 */
export const initialMockUsers: UserAccountItem[] = [
  {
    user_id: 'usr-0001-sysadmin-kandy',
    email: 'admin@kandypack.lk',
    app_role: 'system_administrator',
    is_active: true,
    created_at: '2026-01-15T08:00:00.000Z',
    employee_id: 1,
    display_name: 'John Doe',
    department_or_title: 'System & Infrastructure Lead',
    home_store_name: 'Central HQ (Kandy)',
  },
  {
    user_id: 'usr-0002-logistics-lead',
    email: 'saman.j@kandypack.lk',
    app_role: 'logistics_manager',
    is_active: true,
    created_at: '2026-01-18T09:30:00.000Z',
    employee_id: 2,
    display_name: 'Saman Jayawardena',
    department_or_title: 'Chief Logistics Coordinator',
    home_store_name: 'Central HQ (Kandy)',
  },
  {
    user_id: 'usr-0003-logistics-ops',
    email: 'priyantha.k@kandypack.lk',
    app_role: 'logistics_manager',
    is_active: true,
    created_at: '2026-01-20T11:15:00.000Z',
    employee_id: 3,
    display_name: 'Priyantha Kumara',
    department_or_title: 'Rail Freight Operations',
    home_store_name: 'Central HQ (Kandy)',
  },
  {
    user_id: 'usr-0004-store-colombo',
    email: 'anura.b@kandypack.lk',
    app_role: 'store_manager',
    is_active: true,
    created_at: '2026-02-01T08:45:00.000Z',
    employee_id: 4,
    display_name: 'Anura Bandara',
    department_or_title: 'Store Manager',
    home_store_name: 'Colombo Station Store',
  },
  {
    user_id: 'usr-0005-store-negombo',
    email: 'chaminda.s@kandypack.lk',
    app_role: 'store_manager',
    is_active: true,
    created_at: '2026-02-01T09:00:00.000Z',
    employee_id: 5,
    display_name: 'Chaminda Silva',
    department_or_title: 'Store Manager',
    home_store_name: 'Negombo Station Store',
  },
  {
    user_id: 'usr-0006-store-galle',
    email: 'kasun.r@kandypack.lk',
    app_role: 'store_manager',
    is_active: true,
    created_at: '2026-02-01T09:15:00.000Z',
    employee_id: 6,
    display_name: 'Kasun Rajapaksha',
    department_or_title: 'Store Manager',
    home_store_name: 'Galle Station Store',
  },
  {
    user_id: 'usr-0007-store-matara',
    email: 'dinesh.w@kandypack.lk',
    app_role: 'store_manager',
    is_active: true,
    created_at: '2026-02-01T09:30:00.000Z',
    employee_id: 7,
    display_name: 'Dinesh Wickramasinghe',
    department_or_title: 'Store Manager',
    home_store_name: 'Matara Station Store',
  },
  {
    user_id: 'usr-0008-store-jaffna',
    email: 'kandeepan.t@kandypack.lk',
    app_role: 'store_manager',
    is_active: true,
    created_at: '2026-02-01T09:45:00.000Z',
    employee_id: 8,
    display_name: 'Kandeepan Thambirajah',
    department_or_title: 'Store Manager',
    home_store_name: 'Jaffna Station Store',
  },
  {
    user_id: 'usr-0009-store-trinco',
    email: 'mohamed.r@kandypack.lk',
    app_role: 'store_manager',
    is_active: true,
    created_at: '2026-02-01T10:00:00.000Z',
    employee_id: 9,
    display_name: 'Mohamed Rizwan',
    department_or_title: 'Store Manager',
    home_store_name: 'Trincomalee Station Store',
  },
  {
    user_id: 'usr-0010-fleet-west',
    email: 'rohan.s@kandypack.lk',
    app_role: 'fleet_supervisor',
    is_active: true,
    created_at: '2026-02-05T10:30:00.000Z',
    employee_id: 10,
    display_name: 'Rohan Senanayake',
    department_or_title: 'Fleet & Driver Dispatcher',
    home_store_name: 'Western Fleet Hub',
  },
  {
    user_id: 'usr-0011-fleet-south',
    email: 'lasantha.f@kandypack.lk',
    app_role: 'fleet_supervisor',
    is_active: true,
    created_at: '2026-02-05T11:00:00.000Z',
    employee_id: 11,
    display_name: 'Lasantha Fernando',
    department_or_title: 'Fleet & Driver Dispatcher',
    home_store_name: 'Southern Fleet Hub',
  },
  {
    user_id: 'usr-0012-order-entry-1',
    email: 'tharushi.d@kandypack.lk',
    app_role: 'order_entry_clerk',
    is_active: true,
    created_at: '2026-02-10T08:15:00.000Z',
    employee_id: 12,
    display_name: 'Tharushi De Silva',
    department_or_title: 'Senior Order Entry Clerk',
    home_store_name: 'Central Order Desk',
  },
  {
    user_id: 'usr-0013-order-entry-2',
    email: 'nuwan.p@kandypack.lk',
    app_role: 'order_entry_clerk',
    is_active: true,
    created_at: '2026-02-10T08:30:00.000Z',
    employee_id: 13,
    display_name: 'Nuwan Pradeep',
    department_or_title: 'Order Entry Clerk',
    home_store_name: 'Central Order Desk',
  },
  {
    user_id: 'usr-0014-order-entry-3',
    email: 'sanduni.w@kandypack.lk',
    app_role: 'order_entry_clerk',
    is_active: true,
    created_at: '2026-02-10T08:45:00.000Z',
    employee_id: 14,
    display_name: 'Sanduni Wijesinghe',
    department_or_title: 'Order Entry Clerk',
    home_store_name: 'Central Order Desk',
  },
  {
    user_id: 'usr-0015-sysadmin-backup',
    email: 'devops.admin@kandypack.lk',
    app_role: 'system_administrator',
    is_active: true,
    created_at: '2026-02-15T14:00:00.000Z',
    employee_id: null,
    display_name: 'DevOps Service Admin',
    department_or_title: 'Cloud Operations (Direct Admin)',
    home_store_name: 'Central HQ (Kandy)',
  },
  {
    user_id: 'usr-0016-inactive-contractor',
    email: 'david.chen@contractor.lk',
    app_role: 'order_entry_clerk',
    is_active: false,
    created_at: '2025-11-20T10:00:00.000Z',
    employee_id: null,
    display_name: 'David Chen',
    department_or_title: 'Former Seasonal Data Entry',
    home_store_name: 'Contractor Pool',
  },
  {
    user_id: 'usr-0017-inactive-supervisor',
    email: 'malik.p@kandypack.lk',
    app_role: 'fleet_supervisor',
    is_active: false,
    created_at: '2025-10-05T09:00:00.000Z',
    employee_id: null,
    display_name: 'Malik Perera',
    department_or_title: 'Former Relief Supervisor',
    home_store_name: 'Northern Fleet Hub',
  },
  {
    user_id: 'usr-0018-inactive-clerk',
    email: 'hiruni.m@kandypack.lk',
    app_role: 'order_entry_clerk',
    is_active: false,
    created_at: '2025-12-01T12:00:00.000Z',
    employee_id: null,
    display_name: 'Hiruni Mendis',
    department_or_title: 'Former Intern Clerk',
    home_store_name: 'Central Order Desk',
  },
];

/**
 * Returns human-readable label for a given application role.
 *
 * @param role The AppRole enum value
 * @returns Formatted role title string
 */
export function getRoleDisplayLabel(role: AppRole): string {
  switch (role) {
    case 'system_administrator':
      return 'System Administrator';
    case 'logistics_manager':
      return 'Logistics Manager';
    case 'order_entry_clerk':
      return 'Order Entry Clerk';
    case 'store_manager':
      return 'Store Manager';
    case 'fleet_supervisor':
      return 'Fleet Supervisor';
    default:
      return role;
  }
}

/**
 * Returns semantic badge color styling for an application role matching DESIGN.md tokens.
 *
 * @param role The AppRole enum value
 * @returns Object with Tailwind CSS classes for background, text, and border
 */
export function getRoleBadgeStyles(role: AppRole): { bg: string; text: string; border: string } {
  switch (role) {
    case 'system_administrator':
      return {
        bg: 'bg-[#EDE9FE]',
        text: 'text-[#4132C7]',
        border: 'border-[#C4B5FD]/50',
      };
    case 'logistics_manager':
      return {
        bg: 'bg-[#E0F2FE]',
        text: 'text-[#0369A1]',
        border: 'border-[#BAE6FD]/50',
      };
    case 'store_manager':
      return {
        bg: 'bg-[#FEF3C7]',
        text: 'text-[#B45309]',
        border: 'border-[#FDE68A]/50',
      };
    case 'fleet_supervisor':
      return {
        bg: 'bg-[#F3E8FF]',
        text: 'text-[#7E22CE]',
        border: 'border-[#E9D5FF]/50',
      };
    case 'order_entry_clerk':
      return {
        bg: 'bg-[#E6F4EA]',
        text: 'text-[#137333]',
        border: 'border-[#A8DAB5]/50',
      };
    default:
      return {
        bg: 'bg-[#F1F1F5]',
        text: 'text-[#474554]',
        border: 'border-[#C8C4D7]/50',
      };
  }
}

/**
 * Calculates aggregated KPI metrics across a list of user accounts.
 *
 * @param users Array of UserAccountItem records
 * @returns UserStats KPI counts
 */
export function calculateUserStats(users: UserAccountItem[]): UserStats {
  const totalUsers = users.length;
  let activeUsers = 0;
  let deactivatedUsers = 0;
  let adminUsers = 0;

  for (const user of users) {
    if (user.is_active) {
      activeUsers += 1;
    } else {
      deactivatedUsers += 1;
    }

    if (user.app_role === 'system_administrator') {
      adminUsers += 1;
    }
  }

  return {
    totalUsers,
    activeUsers,
    deactivatedUsers,
    adminUsers,
  };
}

/**
 * Filters a list of user accounts based on search query, role filter, and status filter.
 *
 * @param users The complete array of user items
 * @param filters The active filter state
 * @returns Filtered array of UserAccountItem records
 */
export function filterUsers(users: UserAccountItem[], filters: UserFilterState): UserAccountItem[] {
  const query = filters.searchQuery.trim().toLowerCase();

  return users.filter((user) => {
    // Search query matching against name, email, department, or store
    if (query) {
      const nameMatch = user.display_name.toLowerCase().includes(query);
      const emailMatch = user.email.toLowerCase().includes(query);
      const deptMatch = user.department_or_title.toLowerCase().includes(query);
      const storeMatch = user.home_store_name?.toLowerCase().includes(query) ?? false;
      const roleMatch = getRoleDisplayLabel(user.app_role).toLowerCase().includes(query);

      if (!nameMatch && !emailMatch && !deptMatch && !storeMatch && !roleMatch) {
        return false;
      }
    }

    // Role filter matching
    if (filters.roleFilter !== 'ALL' && user.app_role !== filters.roleFilter) {
      return false;
    }

    // Status filter matching
    if (filters.statusFilter === 'ACTIVE' && !user.is_active) {
      return false;
    }
    if (filters.statusFilter === 'DEACTIVATED' && user.is_active) {
      return false;
    }

    return true;
  });
}
