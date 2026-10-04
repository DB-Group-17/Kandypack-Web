'use client';

/**
 * @file EditUserModal.tsx
 * @description Modal dialog for viewing and updating an existing user account's role and status.
 * Strictly adheres to the PATCH /api/users/:id contract documented in Docs/05_api-and-pages.md §A10.
 * 
 * Permitted update fields:
 * - app_role: AppRole (canonical role assignment, verified for store scoping)
 * - is_active: boolean (account active status toggle)
 * 
 * Architectural rule:
 * - Display Name is derived from employees.full_name for linked employee accounts (or display_name_override for unlinked)
 *   and is strictly NOT sent in PATCH requests to avoid 400 VALIDATION_ERROR. It is displayed read-only.
 */

import React, { useState } from 'react';
import { UserAccountItem, AppRole } from '../types';

interface EditUserModalProps {
  /** The target user account to inspect and edit */
  user: UserAccountItem | null;
  /** Current signed-in user ID for self-action protection */
  currentUserId?: string;
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback to close the modal dialog */
  onClose: () => void;
  /** Callback to persist permitted user updates via PATCH /api/users/:id */
  onSave: (
    userId: string,
    updates: { app_role?: AppRole; is_active?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
}

/**
 * EditUserModal Component
 *
 * Renders the modal dialog for editing role and active status of an existing user account.
 * Keyed by user_id to ensure clean initialization without cascading effect updates.
 *
 * @param props - Component properties containing user record, visibility flag, and handlers
 * @returns JSX.Element | null
 */
export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  currentUserId,
  isOpen,
  onClose,
  onSave,
}) => {
  const [appRole, setAppRole] = useState<AppRole>(user?.app_role ?? 'order_entry_clerk');
  const [isActive, setIsActive] = useState<boolean>(user?.is_active ?? true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const isSelf = Boolean(currentUserId && user.user_id === currentUserId);

  /**
   * Handles form submission by calculating delta of permitted PATCH fields.
   * If no fields changed, closes modal without issuing a network request.
   *
   * @param e - Form submit event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const updates: { app_role?: AppRole; is_active?: boolean } = {};
    if (appRole !== user.app_role) {
      updates.app_role = appRole;
    }
    if (isActive !== user.is_active) {
      updates.is_active = isActive;
    }

    // If no values changed, cleanly exit
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSave(user.user_id, updates);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to update user account.');
        setIsSubmitting(false);
      }
      // On success, parent closes modal and refreshes data
    } catch {
      setErrorMessage('Unexpected network failure while updating account.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#C8C4D7]/40 p-6 z-10 animate-fadeIn">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#C8C4D7]/30">
          <div>
            <h3 className="text-[18px] font-bold text-[#121C2C]">Edit User Account</h3>
            <p className="text-[12px] text-[#474554] mt-0.5">
              Update application role and account status
            </p>
          </div>
          <button
            onClick={() => !isSubmitting && onClose()}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#777586] hover:bg-[#F5F5FA] hover:text-[#121C2C] transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Backend Validation / API Error Banner */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl text-[12px] text-[#F93C65] flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Readonly Account Details */}
          <div className="p-3.5 bg-[#F5F5FA] rounded-xl border border-[#C8C4D7]/30 space-y-1.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#474554]">Display Name:</span>
              <span className="font-semibold text-[#121C2C]">{user.display_name}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#474554]">Email:</span>
              <span className="font-medium text-[#121C2C]">{user.email}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#474554]">Current Department:</span>
              <span className="text-[#121C2C]">{user.department_or_title}</span>
            </div>
            {user.home_store_name && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#474554]">Assigned Store:</span>
                <span className="text-[#121C2C]">{user.home_store_name}</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-[#777586] px-0.5">
            Display name and store affiliation are bound to verified staff master records and cannot be modified directly via this account endpoint.
          </p>

          {/* Application Role Select */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Application Role
            </label>
            <select
              value={appRole}
              onChange={(e) => setAppRole(e.target.value as AppRole)}
              disabled={isSubmitting || (isSelf && user.app_role === 'system_administrator')}
              className="w-full h-10 px-3.5 text-[14px] bg-[#F5F5FA] border border-[#C8C4D7]/60 rounded-xl font-medium text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="system_administrator">System Administrator</option>
              <option value="logistics_manager">Logistics Manager</option>
              <option value="store_manager">Store Manager</option>
              <option value="fleet_supervisor">Fleet Supervisor</option>
              <option value="order_entry_clerk">Order Entry Clerk</option>
            </select>
            {isSelf && user.app_role === 'system_administrator' && (
              <p className="text-[11px] text-[#777586] mt-1 px-0.5">
                Administrators cannot change their own application role.
              </p>
            )}
          </div>

          {/* Status Toggle */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Account Status
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                disabled={isSubmitting || (isSelf && user.is_active)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed ${
                  isActive ? 'bg-[#00B69B]' : 'bg-[#C8C4D7]'
                }`}
                role="switch"
                aria-checked={isActive}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-[13px] font-medium text-[#121C2C]">
                {isActive ? 'Active (Can sign in)' : 'Deactivated (Login blocked)'}
              </span>
            </div>
            {isSelf && user.is_active && (
              <p className="text-[11px] text-[#777586] mt-1 px-0.5">
                Administrators cannot deactivate their own account.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#C8C4D7]/30">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-[13px] font-semibold text-[#474554] hover:bg-[#F5F5FA] rounded-full transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-[13px] font-bold bg-[#4132C7] hover:bg-[#5A4FE0] text-white rounded-full transition-all shadow-sm active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
            >
              {isSubmitting && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
