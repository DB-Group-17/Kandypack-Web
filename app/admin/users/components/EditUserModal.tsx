'use client';

/**
 * @file EditUserModal.tsx
 * @description Modal dialog for viewing and updating an existing user account's role and details.
 * Supports role changes and active status modification conforming to PATCH /api/users/:id.
 */

import React, { useState } from 'react';
import { UserAccountItem, AppRole } from '../types';

interface EditUserModalProps {
  /** The target user to edit */
  user: UserAccountItem | null;
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback to close modal */
  onClose: () => void;
  /** Callback with updated user data */
  onSave: (updatedUser: UserAccountItem) => void;
}

/**
 * EditUserModal Component
 *
 * Renders the modal dialog for editing role and properties of an existing user account.
 *
 * @param props Component properties
 * @returns Modal element
 */
export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  isOpen,
  onClose,
  onSave,
}) => {
  const [appRole, setAppRole] = useState<AppRole>(user?.app_role ?? 'order_entry_clerk');
  const [isActive, setIsActive] = useState<boolean>(user?.is_active ?? true);
  const [displayName, setDisplayName] = useState<string>(user?.display_name ?? '');

  if (!isOpen || !user) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...user,
      app_role: appRole,
      is_active: isActive,
      display_name: displayName.trim() || user.display_name,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#C8C4D7]/40 p-6 z-10 animate-fadeIn">
        <div className="flex items-center justify-between pb-4 border-b border-[#C8C4D7]/30">
          <div>
            <h3 className="text-[18px] font-bold text-[#121C2C]">Edit User Account</h3>
            <p className="text-[12px] text-[#474554] mt-0.5">
              Update application role and account status
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#777586] hover:bg-[#F5F5FA] hover:text-[#121C2C] transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Readonly Account Details */}
          <div className="p-3 bg-[#F5F5FA] rounded-xl border border-[#C8C4D7]/30 space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#474554]">Email:</span>
              <span className="font-semibold text-[#121C2C]">{user.email}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#474554]">Department / Title:</span>
              <span className="text-[#121C2C]">{user.department_or_title}</span>
            </div>
            {user.home_store_name && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#474554]">Store:</span>
                <span className="text-[#121C2C]">{user.home_store_name}</span>
              </div>
            )}
          </div>

          {/* Display Name Input */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-10 px-3.5 text-[14px] bg-[#F5F5FA] border border-[#C8C4D7]/60 rounded-xl focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] text-[#121C2C]"
            />
          </div>

          {/* Application Role Select */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Application Role
            </label>
            <select
              value={appRole}
              onChange={(e) => setAppRole(e.target.value as AppRole)}
              className="w-full h-10 px-3.5 text-[14px] bg-[#F5F5FA] border border-[#C8C4D7]/60 rounded-xl font-medium text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] cursor-pointer"
            >
              <option value="system_administrator">System Administrator</option>
              <option value="logistics_manager">Logistics Manager</option>
              <option value="store_manager">Store Manager</option>
              <option value="fleet_supervisor">Fleet Supervisor</option>
              <option value="order_entry_clerk">Order Entry Clerk</option>
            </select>
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
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#C8C4D7]/30">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-semibold text-[#474554] hover:bg-[#F5F5FA] rounded-full transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-[13px] font-bold bg-[#4132C7] hover:bg-[#5A4FE0] text-white rounded-full transition-all shadow-sm active:scale-[0.98]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
