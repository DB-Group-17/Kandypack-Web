'use client';

/**
 * @file page.tsx
 * @description Master client page component for User Accounts management (/admin/users).
 *
 * Structure and Data Flow:
 * 1. State:
 *    - `users`: Array of `UserAccountItem` records initialized from `initialMockUsers`.
 *    - `employees`: Array of `EmployeeOption` records initialized from `initialMockEmployees`.
 *    - `filters`: `UserFilterState` tracking search query, role filter, and status filter.
 *    - `pagination`: `PaginationState` managing current page and page size (10 items per page).
 *    - `isAddModalOpen`: Controls visibility of the Add User dialog.
 *    - `statusModalUser`: Target user for the Activate/Deactivate confirmation dialog.
 *    - `editModalUser`: Target user for viewing and editing account details.
 *    - `tempPasswordNotice`: Holds temporary password payload to render the dismissible banner upon account creation.
 *    - `toast`: Ephemeral feedback notification for actions (copy, activate, deactivate, creation).
 *
 * 2. User Interactions:
 *    - Live search and multi-criteria filtering across 5 application roles and active/deactivated statuses.
 *    - 4-card Bento grid displaying real-time metrics with interactive one-click filtering.
 *    - Creating a new user account with temporary password generation, employee linking, and one-time password banner.
 *    - One-click clipboard copy of temporary password.
 *    - Toggling user activation status with confirmation dialog.
 *    - Editing user role and display details.
 *    - Pagination navigation with 10 records per page.
 */

import React, { useState, useMemo, useEffect } from 'react';
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
} from './types';
import {
  initialMockUsers,
  initialMockEmployees,
  calculateUserStats,
  filterUsers,
  getRoleDisplayLabel,
} from './mockData';

const PAGE_SIZE = 10;

/**
 * UserAccountsPage Component
 *
 * Main page component for the /admin/users route.
 *
 * @returns Complete User Accounts management interface
 */
export default function UserAccountsPage() {
  // Primary datasets
  const [users, setUsers] = useState<UserAccountItem[]>(initialMockUsers);
  const [employees] = useState(initialMockEmployees);

  // Filter state
  const [filters, setFilters] = useState<UserFilterState>({
    searchQuery: '',
    roleFilter: 'ALL',
    statusFilter: 'ALL',
  });

  // Pagination state (1-indexed current page)
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal dialog states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [statusModalUser, setStatusModalUser] = useState<UserAccountItem | null>(null);
  const [editModalUser, setEditModalUser] = useState<UserAccountItem | null>(null);

  // One-time temporary password banner notification state
  const [tempPasswordNotice, setTempPasswordNotice] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  // Toast feedback state
  const [toast, setToast] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Auto-dismiss toast notification after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Compute aggregated stats over full dataset
  const stats = useMemo(() => calculateUserStats(users), [users]);

  // Filter users based on active search and filter dropdowns
  const filteredUsers = useMemo(() => {
    return filterUsers(users, filters);
  }, [users, filters]);

  // Compute paginated slice for current view
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, currentPage]);

  /**
   * Helper to trigger a toast message.
   *
   * @param message Text to display
   * @param type Semantic tone of the alert
   */
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
  };

  /**
   * Handles filter selection changes from the filter bar or Bento cards.
   * Resets page to 1 whenever filters change.
   *
   * @param newFilters Updated filter state
   */
  const handleFilterChange = (newFilters: UserFilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  /**
   * Handles direct filtering triggered from Bento KPI cards.
   *
   * @param cardType Bento card category clicked
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
   * Handles submission of the Add User modal.
   * Inserts the new account into state, displays the temporary password banner, and triggers toast.
   *
   * @param payload New user registration payload
   */
  const handleCreateUser = (payload: NewUserPayload) => {
    let displayName = payload.display_name_override || 'Staff Member';
    let deptOrTitle = getRoleDisplayLabel(payload.app_role);
    let homeStoreName: string | undefined = undefined;

    if (payload.employee_id) {
      const matchedEmp = employees.find((e) => e.employee_id === payload.employee_id);
      if (matchedEmp) {
        displayName = matchedEmp.full_name;
        deptOrTitle = `${getRoleDisplayLabel(payload.app_role)} (${matchedEmp.employee_type.replace('_', ' ')})`;
        homeStoreName = matchedEmp.home_store_name;
      }
    }

    const newUser: UserAccountItem = {
      user_id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      email: payload.email,
      app_role: payload.app_role,
      is_active: true,
      created_at: new Date().toISOString(),
      employee_id: payload.employee_id || null,
      display_name: displayName,
      department_or_title: deptOrTitle,
      home_store_name: homeStoreName,
    };

    // Prepend new user to the accounts list
    setUsers((prev) => [newUser, ...prev]);

    // Close modal and set temporary password banner
    setIsAddModalOpen(false);
    setTempPasswordNotice({
      email: payload.email,
      tempPassword: payload.temp_password,
    });

    showToast(`User account created successfully for ${payload.email}.`);
  };

  /**
   * Confirms and applies Activate or Deactivate status toggle.
   *
   * @param targetUser The user record to modify
   */
  const handleConfirmStatusToggle = (targetUser: UserAccountItem) => {
    const updatedStatus = !targetUser.is_active;

    setUsers((prev) =>
      prev.map((u) =>
        u.user_id === targetUser.user_id ? { ...u, is_active: updatedStatus } : u
      )
    );

    setStatusModalUser(null);
    showToast(
      updatedStatus
        ? `Account for ${targetUser.email} has been activated.`
        : `Account for ${targetUser.email} has been deactivated.`,
      updatedStatus ? 'success' : 'info'
    );
  };

  /**
   * Saves updates to an existing user's role, name, or status from the Edit modal.
   *
   * @param updatedUser Modified user record
   */
  const handleSaveEditUser = (updatedUser: UserAccountItem) => {
    setUsers((prev) =>
      prev.map((u) => (u.user_id === updatedUser.user_id ? updatedUser : u))
    );

    setEditModalUser(null);
    showToast(`Updated account details for ${updatedUser.email}.`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Alert */}
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

      {/* Main Content Space */}
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

        {/* 4-Card Bento Overview Grid */}
        <UserStatsBento
          stats={stats}
          onSelectFilter={handleBentoFilterSelect}
          activeStatusFilter={filters.statusFilter}
          activeRoleFilter={filters.roleFilter}
        />

        {/* Search & Filter Toolbar */}
        <UserFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          totalResults={filteredUsers.length}
        />

        {/* User Accounts Table */}
        <UsersTable
          users={paginatedUsers}
          onToggleStatus={(user) => setStatusModalUser(user)}
          onEditUser={(user) => setEditModalUser(user)}
          onResetFilters={() =>
            handleFilterChange({ searchQuery: '', roleFilter: 'ALL', statusFilter: 'ALL' })
          }
          onOpenAddModal={() => setIsAddModalOpen(true)}
        />

        {/* Pagination Footer */}
        {filteredUsers.length > 0 && (
          <UserPagination
            pagination={{
              currentPage,
              pageSize: PAGE_SIZE,
              totalItems: filteredUsers.length,
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
        existingUsers={users}
      />

      {/* Status Toggle Confirmation Modal */}
      <StatusToggleModal
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
