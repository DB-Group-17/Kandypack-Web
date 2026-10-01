'use client';

/**
 * @file UsersTable.tsx
 * @description Data table component for User Accounts management (/admin/users).
 * Conforms to DESIGN.md and Docs/11_ui-rules.md:
 * - 6 columns: User (avatar + name + dept), Email, Role (pill badge), Status (active dot badge), Joined, Actions
 * - Hover elevation, action triggers for status toggle and edit details
 * - Responsive stacked card view on mobile screens
 * - Empty state with clear/reset triggers
 * - Shimmering loading skeleton state while fetching from GET /api/users
 */

import React from 'react';
import { UserAccountItem } from '../types';
import { getRoleDisplayLabel, getRoleBadgeStyles } from '../mockData';

interface UsersTableProps {
  /** Array of user items to display on the current page */
  users: UserAccountItem[];
  /** Loading state indicator while fetching live data */
  isLoading?: boolean;
  /** Callback to trigger the Activate / Deactivate status toggle dialog */
  onToggleStatus: (user: UserAccountItem) => void;
  /** Callback to trigger the Edit/Details dialog */
  onEditUser: (user: UserAccountItem) => void;
  /** Callback to reset active filters when in an empty state */
  onResetFilters: () => void;
  /** Callback to open the Add User modal */
  onOpenAddModal: () => void;
}

/**
 * Helper to extract initials from a user's display name.
 *
 * @param name - Full display name
 * @returns 2-character uppercase initials
 */
function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Helper to format an ISO date string into a user-friendly format (e.g. "Feb 01, 2026").
 *
 * @param isoString - Date string in ISO format
 * @returns Formatted date string
 */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * UsersTable Component
 *
 * Renders the table of user accounts with actions, loading skeletons, and responsive mobile card transformations.
 *
 * @param props - Component properties containing user records and action handlers
 * @returns JSX.Element
 */
export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  isLoading = false,
  onToggleStatus,
  onEditUser,
  onResetFilters,
  onOpenAddModal,
}) => {
  // Render loading skeleton rows while query is in-flight
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 shadow-xs overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#C8C4D7]/40 bg-[#F5F5FA]/75 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                <th className="py-3.5 px-6">User</th>
                <th className="py-3.5 px-6">Email</th>
                <th className="py-3.5 px-6">Role</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6">Joined</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8C4D7]/30">
              {Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="animate-pulse">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#EDE9FE]/70" />
                      <div className="space-y-1.5">
                        <div className="w-28 h-4 bg-[#EDE9FE]/70 rounded-md" />
                        <div className="w-36 h-3 bg-[#F1F1F5] rounded-md" />
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="w-36 h-4 bg-[#F1F1F5] rounded-md" />
                  </td>
                  <td className="py-4 px-6">
                    <div className="w-24 h-6 bg-[#F1F1F5] rounded-full" />
                  </td>
                  <td className="py-4 px-6">
                    <div className="w-16 h-6 bg-[#F1F1F5] rounded-full" />
                  </td>
                  <td className="py-4 px-6">
                    <div className="w-20 h-4 bg-[#F1F1F5] rounded-md" />
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="inline-block w-16 h-8 bg-[#F1F1F5] rounded-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Skeleton */}
        <div className="md:hidden divide-y divide-[#C8C4D7]/30 p-4 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="p-4 bg-[#F9F9FF] rounded-xl space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#EDE9FE]" />
                <div className="space-y-1 flex-1">
                  <div className="w-28 h-4 bg-[#EDE9FE] rounded" />
                  <div className="w-40 h-3 bg-[#F1F1F5] rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Render empty state if no users match active criteria
  if (users.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-[#C8C4D7]/40 text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-[#EDE9FE] text-[#4132C7] mx-auto flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <h3 className="text-[18px] font-bold text-[#121C2C] mb-1">No user accounts found</h3>
        <p className="text-[14px] text-[#474554] max-w-md mx-auto mb-6">
          Try adjusting your search query or filters, or create a new user account to get started.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onResetFilters}
            className="px-4 py-2 bg-[#F5F5FA] hover:bg-[#EBE9FE] text-[#474554] hover:text-[#4132C7] rounded-full text-[13px] font-semibold transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={onOpenAddModal}
            className="px-5 py-2 bg-[#4132C7] hover:bg-[#5A4FE0] text-white rounded-full text-[13px] font-semibold transition-all shadow-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>New User</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 shadow-xs overflow-hidden">
      {/* Desktop & Tablet Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#C8C4D7]/40 bg-[#F5F5FA]/75 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
              <th className="py-3.5 px-6">User</th>
              <th className="py-3.5 px-6">Email</th>
              <th className="py-3.5 px-6">Role</th>
              <th className="py-3.5 px-6">Status</th>
              <th className="py-3.5 px-6">Joined</th>
              <th className="py-3.5 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#C8C4D7]/30 text-[14px]">
            {users.map((user) => {
              const roleBadge = getRoleBadgeStyles(user.app_role);
              const initials = getInitials(user.display_name);

              return (
                <tr
                  key={user.user_id}
                  className={`hover:bg-[#F9F9FF] transition-colors group ${
                    !user.is_active ? 'bg-[#FAFAFC]/60' : ''
                  }`}
                >
                  {/* User Avatar + Name + Title */}
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ring-2 ring-white shadow-xs ${
                          user.is_active
                            ? 'bg-[#EDE9FE] text-[#4132C7]'
                            : 'bg-[#F1F1F5] text-[#777586]'
                        }`}
                      >
                        {initials}
                      </div>
                      <div>
                        <p
                          className={`font-semibold text-[14px] leading-tight ${
                            user.is_active
                              ? 'text-[#121C2C] group-hover:text-[#4132C7]'
                              : 'text-[#777586] line-through decoration-[#777586]/60'
                          }`}
                        >
                          {user.display_name}
                        </p>
                        <p className="text-[12px] text-[#474554] mt-0.5">
                          {user.department_or_title}
                          {user.home_store_name && (
                            <span className="text-[#777586]"> • {user.home_store_name}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="py-4 px-6">
                    <span className="text-[13px] font-mono text-[#121C2C]">
                      {user.email}
                    </span>
                  </td>

                  {/* Role Pill Badge */}
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold border ${roleBadge.bg} ${roleBadge.text} ${roleBadge.border}`}
                    >
                      {getRoleDisplayLabel(user.app_role)}
                    </span>
                  </td>

                  {/* Status Indicator */}
                  <td className="py-4 px-6">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#E6F6F4] text-[#00B69B]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00B69B]" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#FFF0F0] text-[#F93C65]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F93C65]" />
                        Deactivated
                      </span>
                    )}
                  </td>

                  {/* Created At Date */}
                  <td className="py-4 px-6 text-[13px] text-[#474554]">
                    {formatDate(user.created_at)}
                  </td>

                  {/* Action Buttons */}
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Edit Details */}
                      <button
                        onClick={() => onEditUser(user)}
                        className="px-3 py-1.5 text-[12px] font-semibold text-[#474554] hover:text-[#4132C7] hover:bg-[#EDE9FE] rounded-lg transition-colors flex items-center gap-1"
                        aria-label={`Edit ${user.display_name}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                        <span>Edit</span>
                      </button>

                      {/* Activate / Deactivate Toggle Button */}
                      <button
                        onClick={() => onToggleStatus(user)}
                        className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
                          user.is_active
                            ? 'text-[#F93C65] hover:bg-[#FFF0F0]'
                            : 'text-[#00B69B] hover:bg-[#E6F6F4]'
                        }`}
                        aria-label={
                          user.is_active
                            ? `Deactivate ${user.display_name}`
                            : `Activate ${user.display_name}`
                        }
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View */}
      <div className="md:hidden divide-y divide-[#C8C4D7]/30">
        {users.map((user) => {
          const roleBadge = getRoleBadgeStyles(user.app_role);
          const initials = getInitials(user.display_name);

          return (
            <div
              key={user.user_id}
              className={`p-4 space-y-3 ${!user.is_active ? 'bg-[#FAFAFC]/60' : ''}`}
            >
              {/* Header row: User avatar + info + status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${
                      user.is_active
                        ? 'bg-[#EDE9FE] text-[#4132C7]'
                        : 'bg-[#F1F1F5] text-[#777586]'
                    }`}
                  >
                    {initials}
                  </div>
                  <div>
                    <p
                      className={`font-semibold text-[14px] ${
                        user.is_active ? 'text-[#121C2C]' : 'text-[#777586] line-through'
                      }`}
                    >
                      {user.display_name}
                    </p>
                    <p className="text-[12px] text-[#474554]">{user.department_or_title}</p>
                  </div>
                </div>

                {/* Status pill */}
                {user.is_active ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F6F4] text-[#00B69B]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00B69B]" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF0F0] text-[#F93C65]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F93C65]" />
                    Deactivated
                  </span>
                )}
              </div>

              {/* Email and Meta */}
              <div className="text-[12px] space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#474554]">Email:</span>
                  <span className="font-mono text-[#121C2C]">{user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#474554]">Role:</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleBadge.bg} ${roleBadge.text} ${roleBadge.border}`}
                  >
                    {getRoleDisplayLabel(user.app_role)}
                  </span>
                </div>
                {user.home_store_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#474554]">Store:</span>
                    <span className="text-[#121C2C]">{user.home_store_name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[#474554]">Joined:</span>
                  <span className="text-[#474554]">{formatDate(user.created_at)}</span>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#C8C4D7]/20">
                <button
                  onClick={() => onEditUser(user)}
                  className="px-3 py-1.5 text-[12px] font-semibold text-[#474554] bg-[#F5F5FA] rounded-lg"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => onToggleStatus(user)}
                  className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg ${
                    user.is_active
                      ? 'text-[#F93C65] bg-[#FFF0F0]'
                      : 'text-[#00B69B] bg-[#E6F6F4]'
                  }`}
                >
                  {user.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
