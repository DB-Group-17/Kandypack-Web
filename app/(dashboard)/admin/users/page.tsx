'use client';

/**
 * @file page.tsx
 * @description Master client page component for User Accounts administration (/admin/users).
 * Connects directly to backend API routes to manage staff logins, roles, and profiles.
 *
 * Architecture and Data Flow:
 * 1. Authentication & RBAC:
 *    - Ingests active session identity and role from AuthContext (`useAuth`).
 *    - Strictly enforces RBAC boundaries: only `system_administrator` has authorization
 *      to read, provision, or modify user accounts (Docs/05_api-and-pages.md §A10).
 *    - Unauthorized roles receive a clear Access Denied notice conforming to DESIGN.md.
 * 2. Real API Integrations:
 *    - User Listing & Filtering: `GET /api/users?search=...&role=...&status=...&page=...&limit=...`
 *    - Overall System KPI Metrics: `GET /api/users?limit=100` (populates 4-card Bento overview)
 *    - Account Provisioning: `POST /api/users`
 *    - Account Mutation: `PATCH /api/users/:id` (role updates and soft deactivation)
 *    - Active Staff Master Data: `GET /api/employees` (supplies eligible personnel for account linking)
 * 3. Reactive State & Synchronization:
 *    - Server-side filtering and pagination prevent double-filtering or client-server discrepancy.
 *    - Search input is debounced by 300ms to eliminate unnecessary API roundtrips while typing.
 *    - Mutating actions (Add, Edit, Status Toggle) trigger automatic re-fetching of both the
 *      active users table slice and the global KPI stats counter.
 *    - Temporary password from `POST /api/users` is shown once in a dismissible warning banner.
 *
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §1 & §2, Docs/05_api-and-pages.md §A10 & §B
 * Copy Source: Docs/07_content-copy.md §/admin/users
 * Owner: Member 4 (Vidura)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserStatsBento } from './components/UserStatsBento';
import { UserFilterBar } from './components/UserFilterBar';
import { UsersTable } from './components/UsersTable';
import { UserPagination } from './components/UserPagination';
import { AddUserModal } from './components/AddUserModal';
import { TempPasswordBanner } from './components/TempPasswordBanner';
import { StatusToggleModal } from './components/StatusToggleModal';
import { EditUserModal } from './components/EditUserModal';
import {
  UserAccountItem,
  UserFilterState,
  NewUserPayload,
  UserStats,
  EmployeeOption,
  AppRole,
} from './types';
import { calculateUserStats } from './mockData';

/**
 * Standard pagination limit for the user accounts directory table.
 */
const PAGE_SIZE = 10;

/**
 * Default empty KPI stats metrics baseline.
 */
const INITIAL_STATS: UserStats = {
  totalUsers: 0,
  activeUsers: 0,
  deactivatedUsers: 0,
  adminUsers: 0,
};

/**
 * UserAccountsPage Component
 *
 * Orchestrates live staff directory management, filtering, creation, and status updates.
 *
 * @returns Complete User Accounts management interface
 */
export default function UserAccountsPage(): React.JSX.Element {
  // Authentication & Session context
  const { user: authUser, role: authRole, isLoading: authLoading } = useAuth();

  // Primary live dataset state (no mock runtime fallback)
  const [users, setUsers] = useState<UserAccountItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Overall system KPI statistics for Bento cards
  const [systemStats, setSystemStats] = useState<UserStats>(INITIAL_STATS);

  // Available staff roster fetched from GET /api/employees for account linking
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Filter criteria state
  const [filters, setFilters] = useState<UserFilterState>({
    searchQuery: '',
    roleFilter: 'ALL',
    statusFilter: 'ALL',
  });

  // Debounced search query to prevent excessive backend queries during rapid typing
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Pagination state (1-indexed current page)
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Trigger counter to refresh data following a mutation
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Modal dialog states
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [statusModalUser, setStatusModalUser] = useState<UserAccountItem | null>(null);
  const [editModalUser, setEditModalUser] = useState<UserAccountItem | null>(null);

  // One-time temporary password banner notification state
  const [tempPasswordNotice, setTempPasswordNotice] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  // Ephemeral toast feedback state
  const [toast, setToast] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Automatically dismiss toast notification after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Debounce search query input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(filters.searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [filters.searchQuery]);

  /**
   * Dispatches an ephemeral toast notification alert.
   *
   * @param message - User-facing text to display
   * @param type - Semantic tone of the alert ('success' | 'info' | 'error')
   */
  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'success') => {
      setToast({ message, type });
    },
    []
  );

  /**
   * Fetches active personnel from GET /api/employees to populate Add User dropdown.
   * Filters out operational roles (driver, assistant) that cannot receive user logins.
   */
  useEffect(() => {
    let ignore = false;

    async function loadEmployees() {
      try {
        const res = await fetch('/api/employees', { cache: 'no-store' });
        if (ignore) return;

        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          // Operational personnel are forbidden from receiving web login accounts
          const eligible = items
            .filter(
              (emp: { employee_type?: string }) =>
                emp.employee_type !== 'driver' && emp.employee_type !== 'assistant'
            )
            .map(
              (emp: {
                employee_id: number;
                full_name: string;
                nic_number: string;
                employee_type: string;
                home_store_id?: number | null;
                home_store_name?: string;
              }) => ({
                employee_id: Number(emp.employee_id),
                full_name: emp.full_name,
                nic_number: emp.nic_number,
                employee_type: emp.employee_type,
                home_store_id: emp.home_store_id ?? null,
                home_store_name: emp.home_store_name,
              })
            );

          setEmployees(eligible);
        } else {
          // If employee fetch is unsupported or unauthorized, standalone account creation remains usable
          console.warn('Employees endpoint responded with status:', res.status);
        }
      } catch (err) {
        console.warn('Failed to fetch eligible employees for account linking:', err);
      }
    }

    if (authRole === 'system_administrator') {
      void loadEmployees();
    }

    return () => {
      ignore = true;
    };
  }, [authRole]);

  /**
   * Synchronizes the paginated users list and global KPI statistics from GET /api/users.
   */
  useEffect(() => {
    let ignore = false;

    async function loadData() {
      if (authRole !== 'system_administrator') return;

      setIsLoadingUsers(true);
      setFetchError(null);

      try {
        const params = new URLSearchParams();

        if (debouncedSearch.trim()) {
          params.set('search', debouncedSearch.trim());
        }

        if (filters.roleFilter && filters.roleFilter !== 'ALL') {
          params.set('role', filters.roleFilter);
        }

        if (filters.statusFilter && filters.statusFilter !== 'ALL') {
          params.set('status', filters.statusFilter.toLowerCase());
        }

        params.set('page', String(currentPage));
        params.set('limit', String(PAGE_SIZE));

        // Fetch filtered page slice and unfiltered global KPI pool in parallel
        const [usersRes, statsRes] = await Promise.all([
          fetch(`/api/users?${params.toString()}`, { cache: 'no-store' }),
          fetch('/api/users?limit=100', { cache: 'no-store' }),
        ]);

        if (ignore) return;

        if (usersRes.status === 401) {
          setFetchError('Authentication required. Please log in.');
          setUsers([]);
          return;
        }

        if (usersRes.status === 403) {
          setFetchError('Access denied: Role is not authorized to view user accounts.');
          setUsers([]);
          return;
        }

        if (usersRes.ok) {
          const data = await usersRes.json();
          const items = Array.isArray(data.items) ? data.items : [];
          setUsers(items);
          setTotalCount(typeof data.total === 'number' ? data.total : items.length);
          setFetchError(null);
        } else {
          const errBody = await usersRes.json().catch(() => null);
          const msg =
            errBody?.error?.message || `Failed to retrieve user accounts (HTTP ${usersRes.status}).`;
          setFetchError(msg);
          setUsers([]);
        }

        // Calculate global KPI stats from the master dataset
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const allItems = Array.isArray(statsData.items) ? statsData.items : [];
          setSystemStats(calculateUserStats(allItems));
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Network error loading users:', err);
          setFetchError('Network error while retrieving user accounts. Please check connection.');
          setUsers([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingUsers(false);
        }
      }
    }

    void loadData();

    return () => {
      ignore = true;
    };
  }, [debouncedSearch, filters.roleFilter, filters.statusFilter, currentPage, refreshTrigger, authRole]);

  /**
   * Handles filter changes from the search & filter toolbar.
   * Resets active page to 1 whenever search query or select filters change.
   *
   * @param newFilters - Updated user filter state
   */
  const handleFilterChange = (newFilters: UserFilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  /**
   * Handles direct filter selection triggered from Bento KPI cards.
   *
   * @param cardType - Bento card category clicked
   */
  const handleBentoFilterSelect = (cardType: 'ALL' | 'ACTIVE' | 'DEACTIVATED' | 'ADMIN') => {
    setCurrentPage(1);
    if (cardType === 'ALL') {
      setFilters({ searchQuery: '', roleFilter: 'ALL', statusFilter: 'ALL' });
    } else if (cardType === 'ACTIVE') {
      setFilters((prev) => ({ ...prev, statusFilter: 'ACTIVE', roleFilter: 'ALL' }));
    } else if (cardType === 'DEACTIVATED') {
      setFilters((prev) => ({ ...prev, statusFilter: 'DEACTIVATED', roleFilter: 'ALL' }));
    } else if (cardType === 'ADMIN') {
      setFilters((prev) => ({
        ...prev,
        roleFilter: 'system_administrator',
        statusFilter: 'ALL',
      }));
    }
  };

  /**
   * Submits a new user creation payload to POST /api/users.
   * On success, reveals the temporary password banner, refetches live data, and triggers toast.
   *
   * @param payload - Validated user registration payload
   * @returns Mutation result with backend error message if rejected
   */
  const handleCreateUser = async (
    payload: NewUserPayload
  ): Promise<{ success: boolean; error?: string; field?: string }> => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        return {
          success: false,
          error: data?.error?.message || `Failed to create user account (HTTP ${res.status}).`,
          field: data?.error?.field,
        };
      }

      // Display one-time temporary password warning banner
      setTempPasswordNotice({
        email: payload.email,
        tempPassword: payload.temp_password,
      });

      showToast(`User account created successfully for ${payload.email}.`);
      setRefreshTrigger((prev) => prev + 1);
      return { success: true };
    } catch (err) {
      console.error('Network failure invoking POST /api/users:', err);
      return {
        success: false,
        error: 'Network connection failed while creating user account.',
      };
    }
  };

  /**
   * Applies Activate or Deactivate status toggle via PATCH /api/users/:id.
   * Sends boolean `is_active` parameter conforming to the documented API contract.
   *
   * @param targetUser - User record whose status is being toggled
   * @returns Mutation result with error message if rejected
   */
  const handleConfirmStatusToggle = async (
    targetUser: UserAccountItem
  ): Promise<{ success: boolean; error?: string }> => {
    const updatedStatus = !targetUser.is_active;

    try {
      const res = await fetch(`/api/users/${targetUser.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: updatedStatus }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const errMsg =
          data?.error?.message || `Failed to update account status (HTTP ${res.status}).`;
        showToast(errMsg, 'error');
        return { success: false, error: errMsg };
      }

      setStatusModalUser(null);
      showToast(
        updatedStatus
          ? `Account for ${targetUser.email} has been activated.`
          : `Account for ${targetUser.email} has been deactivated.`,
        updatedStatus ? 'success' : 'info'
      );
      setRefreshTrigger((prev) => prev + 1);
      return { success: true };
    } catch (err) {
      console.error('Network failure invoking PATCH /api/users/:id for status:', err);
      const errMsg = 'Network error while updating user account status.';
      showToast(errMsg, 'error');
      return { success: false, error: errMsg };
    }
  };

  /**
   * Persists permitted role or status updates via PATCH /api/users/:id.
   * Strictly excludes unsupported fields like display name from the PATCH payload.
   *
   * @param userId - Target user UUID
   * @param updates - Permitted PATCH payload fields ({ app_role?, is_active? })
   * @returns Mutation result with error message if rejected
   */
  const handleSaveEditUser = async (
    userId: string,
    updates: { app_role?: AppRole; is_active?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        return {
          success: false,
          error: data?.error?.message || `Failed to update user account (HTTP ${res.status}).`,
        };
      }

      setEditModalUser(null);
      showToast(`Updated account details for ${data?.email || 'user'}.`);
      setRefreshTrigger((prev) => prev + 1);
      return { success: true };
    } catch (err) {
      console.error('Network failure invoking PATCH /api/users/:id for edit:', err);
      return {
        success: false,
        error: 'Network error while transmitting user account updates.',
      };
    }
  };

  // 1. Loading state during session identity verification
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-[#474554]">
          <div className="w-8 h-8 border-3 border-[#4132C7] border-t-transparent rounded-full animate-spin" />
          <p className="text-[14px] font-medium">Verifying administrator authorization...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated state
  if (!authUser) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-[#C8C4D7]/40 text-center shadow-xs">
        <h3 className="text-[18px] font-bold text-[#121C2C] mb-2">Authentication Required</h3>
        <p className="text-[14px] text-[#474554] max-w-md mx-auto mb-6">
          Please log in with a System Administrator account to access the user management console.
        </p>
      </div>
    );
  }

  // 3. RBAC Access Denied guard: system_administrator only
  if (authRole !== 'system_administrator') {
    return (
      <div className="bg-white rounded-2xl p-12 border border-[#C8C4D7]/40 text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-[#FFF0F0] text-[#F93C65] mx-auto flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-[20px] font-bold text-[#121C2C] mb-1">Access Denied</h3>
        <p className="text-[14px] text-[#474554] max-w-md mx-auto mb-2">
          Your current role (<strong className="text-[#121C2C]">{authRole}</strong>) is not
          authorized to manage user accounts.
        </p>
        <p className="text-[13px] text-[#777586]">
          User accounts administration is strictly restricted to System Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Feedback Notification Alert */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slideUp">
          <div
            className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border text-[13px] font-semibold text-white ${
              toast.type === 'error'
                ? 'bg-[#F93C65] border-[#F93C65]'
                : toast.type === 'info'
                ? 'bg-[#121C2C] border-[#273141]'
                : 'bg-[#00B69B] border-[#00B69B]'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 p-1 hover:opacity-75"
              aria-label="Dismiss toast"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] md:text-[32px] font-bold text-[#121C2C] tracking-tight leading-tight">
              User Accounts
            </h1>
            <p className="text-[14px] text-[#474554] mt-0.5 font-normal">
              Manage staff logins and roles
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* New User Primary Action */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-6 py-2.5 bg-[#5A4FE0] hover:bg-[#4132C7] text-white font-bold text-[13px] rounded-full flex items-center gap-2 shadow-sm transition-all duration-150 active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>New User</span>
            </button>
          </div>
        </div>

        {/* Temporary Password Notice Banner (Rendered upon new user creation) */}
        {tempPasswordNotice && (
          <TempPasswordBanner
            email={tempPasswordNotice.email}
            tempPassword={tempPasswordNotice.tempPassword}
            onDismiss={() => setTempPasswordNotice(null)}
            onCopySuccess={() => showToast('Temporary password copied to clipboard!')}
          />
        )}

        {/* API Fetch Error Banner with Retry Action */}
        {fetchError && (
          <div className="p-4 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#F93C65]/10 text-[#F93C65] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-[#F93C65]">{fetchError}</p>
            </div>
            <button
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="px-4 py-1.5 text-[12px] font-bold text-[#F93C65] hover:bg-[#F93C65]/10 border border-[#F93C65]/40 rounded-full transition-colors self-start sm:self-auto"
            >
              Retry
            </button>
          </div>
        )}

        {/* 4-Card Bento Overview Grid */}
        <UserStatsBento
          stats={systemStats}
          onSelectFilter={handleBentoFilterSelect}
          activeStatusFilter={filters.statusFilter}
          activeRoleFilter={filters.roleFilter}
        />

        {/* Search & Filter Toolbar */}
        <UserFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          totalResults={totalCount}
        />

        {/* User Accounts Directory Table */}
        <UsersTable
          users={users}
          isLoading={isLoadingUsers}
          onToggleStatus={(target) => setStatusModalUser(target)}
          onEditUser={(target) => setEditModalUser(target)}
          onResetFilters={() =>
            handleFilterChange({ searchQuery: '', roleFilter: 'ALL', statusFilter: 'ALL' })
          }
          onOpenAddModal={() => setIsAddModalOpen(true)}
        />

        {/* Pagination Footer */}
        {totalCount > 0 && !isLoadingUsers && (
          <UserPagination
            pagination={{
              currentPage,
              pageSize: PAGE_SIZE,
              totalItems: totalCount,
            }}
            onPageChange={(page) => setCurrentPage(page)}
          />
        )}
      </div>

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleCreateUser}
        employees={employees}
      />

      {/* Status Toggle Confirmation Modal */}
      <StatusToggleModal
        key={statusModalUser?.user_id}
        isOpen={!!statusModalUser}
        user={statusModalUser}
        onClose={() => setStatusModalUser(null)}
        onConfirm={handleConfirmStatusToggle}
      />

      {/* Edit User Modal */}
      <EditUserModal
        key={editModalUser?.user_id}
        isOpen={!!editModalUser}
        user={editModalUser}
        onClose={() => setEditModalUser(null)}
        onSave={handleSaveEditUser}
      />
    </div>
  );
}
