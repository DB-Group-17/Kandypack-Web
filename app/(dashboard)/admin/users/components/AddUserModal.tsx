'use client';

/**
 * @file AddUserModal.tsx
 * @description Modal dialog for creating a new user account (/admin/users).
 * Conforms to Docs/05_api-and-pages.md §380, Docs/07_content-copy.md §346, and DESIGN.md:
 * - Email, Role selection, Link to employee (optional), Display name override, Temporary password
 * - Random secure password generator and visibility toggle
 * - Form validation with clear error messaging
 */

import React, { useState } from 'react';
import { AppRole, EmployeeOption, NewUserPayload, UserAccountItem } from '../types';

interface AddUserModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback fired when user cancels or closes modal */
  onClose: () => void;
  /** Callback fired with valid payload upon creation */
  onSubmit: (payload: NewUserPayload) => void;
  /** List of available employees to link */
  employees: EmployeeOption[];
  /** Existing users for duplicate email validation */
  existingUsers: UserAccountItem[];
}

/**
 * Generates a random alphanumeric temporary password.
 *
 * @returns 12-character secure temporary password string
 */
function generateRandomPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';

  let pwd = '';
  pwd += upper.charAt(Math.floor(Math.random() * upper.length));
  pwd += lower.charAt(Math.floor(Math.random() * lower.length));
  pwd += digits.charAt(Math.floor(Math.random() * digits.length));
  pwd += special.charAt(Math.floor(Math.random() * special.length));

  const allChars = upper + lower + digits + special;
  for (let i = 4; i < 12; i++) {
    pwd += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle characters
  return pwd
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('');
}

/**
 * AddUserModal Component
 *
 * Renders the modal dialog for registering a new user account with employee linkage and temp password generation.
 *
 * @param props Component properties
 * @returns Modal element
 */
export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  employees,
  existingUsers,
}) => {
  // Form fields state
  const [email, setEmail] = useState('');
  const [appRole, setAppRole] = useState<AppRole>('order_entry_clerk');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [displayNameOverride, setDisplayNameOverride] = useState('');
  const [tempPassword, setTempPassword] = useState(() => generateRandomPassword());
  const [showPassword, setShowPassword] = useState(true);

  // Field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Resets all internal form fields to blank/default state.
   */
  const resetForm = () => {
    setEmail('');
    setAppRole('order_entry_clerk');
    setSelectedEmployeeId('');
    setDisplayNameOverride('');
    setTempPassword(generateRandomPassword());
    setShowPassword(true);
    setErrors({});
  };

  /**
   * Closes modal and resets form inputs.
   */
  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Handle employee selection change
  const handleEmployeeChange = (empIdStr: string) => {
    setSelectedEmployeeId(empIdStr);
    if (empIdStr) {
      const emp = employees.find((e) => e.employee_id === Number(empIdStr));
      if (emp) {
        // Clear manual name override since employee is selected
        setDisplayNameOverride('');

        // Map employee type to matching app role if direct match exists
        if (
          emp.employee_type === 'system_administrator' ||
          emp.employee_type === 'logistics_manager' ||
          emp.employee_type === 'store_manager' ||
          emp.employee_type === 'fleet_supervisor' ||
          emp.employee_type === 'order_entry_clerk'
        ) {
          setAppRole(emp.employee_type as AppRole);
        }
      }
    }
  };

  /**
   * Validates form inputs and submits new user payload if valid.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    // Validate email
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      newErrors.email = 'Email address is required.';
    } else if (!emailRegex.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address.';
    } else if (existingUsers.some((u) => u.email.toLowerCase() === trimmedEmail)) {
      newErrors.email = 'An account with this email address already exists.';
    }

    // Validate password
    if (!tempPassword.trim()) {
      newErrors.tempPassword = 'Temporary password is required.';
    } else if (tempPassword.length < 8) {
      newErrors.tempPassword = 'Password must be at least 8 characters long.';
    }

    // Validate display name if no employee is linked
    if (!selectedEmployeeId && !displayNameOverride.trim()) {
      newErrors.displayNameOverride =
        'Display name is required when not linking to an existing employee.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Submit payload
    onSubmit({
      email: trimmedEmail,
      app_role: appRole,
      employee_id: selectedEmployeeId ? Number(selectedEmployeeId) : null,
      display_name_override: selectedEmployeeId ? undefined : displayNameOverride.trim(),
      temp_password: tempPassword,
    });
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#C8C4D7]/40 p-6 md:p-8 z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#C8C4D7]/30">
          <div>
            <h2 className="text-[20px] font-bold text-[#121C2C]">Create User Account</h2>
            <p className="text-[13px] text-[#474554] mt-0.5">
              Provision a new staff login and assign operational role
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#777586] hover:bg-[#F5F5FA] hover:text-[#121C2C] transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Email field */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Email <span className="text-[#F93C65]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
              placeholder="staff@kandypack.lk"
              className={`w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border rounded-xl focus:outline-none focus:ring-1 transition-all ${
                errors.email
                  ? 'border-[#F93C65] focus:border-[#F93C65] focus:ring-[#F93C65]'
                  : 'border-[#C8C4D7]/60 focus:border-[#4132C7] focus:ring-[#4132C7]'
              }`}
            />
            {errors.email && (
              <p className="text-[12px] text-[#F93C65] mt-1">{errors.email}</p>
            )}
          </div>

          {/* Role select */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Role <span className="text-[#F93C65]">*</span>
            </label>
            <select
              value={appRole}
              onChange={(e) => setAppRole(e.target.value as AppRole)}
              className="w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border border-[#C8C4D7]/60 rounded-xl font-medium text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] cursor-pointer"
            >
              <option value="system_administrator">System Administrator</option>
              <option value="logistics_manager">Logistics Manager</option>
              <option value="store_manager">Store Manager</option>
              <option value="fleet_supervisor">Fleet Supervisor</option>
              <option value="order_entry_clerk">Order Entry Clerk</option>
            </select>
          </div>

          {/* Link to Employee (Optional) */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Link to Employee
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className="w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border border-[#C8C4D7]/60 rounded-xl text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] cursor-pointer"
            >
              <option value="">-- Standalone account (No linked employee) --</option>
              {employees.map((emp) => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.full_name} ({emp.employee_type.replace('_', ' ')}) — {emp.home_store_name || 'Central HQ'}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[#474554] mt-1">
              Linking attaches the employee&apos;s verified name and store affiliation.
            </p>
          </div>

          {/* Display Name Override (Visible when no employee linked) */}
          {!selectedEmployeeId && (
            <div>
              <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
                Display Name <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="text"
                value={displayNameOverride}
                onChange={(e) => {
                  setDisplayNameOverride(e.target.value);
                  if (errors.displayNameOverride) {
                    setErrors((prev) => ({ ...prev, displayNameOverride: '' }));
                  }
                }}
                placeholder="e.g. Operations Service Lead"
                className={`w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border rounded-xl focus:outline-none focus:ring-1 transition-all ${
                  errors.displayNameOverride
                    ? 'border-[#F93C65] focus:border-[#F93C65] focus:ring-[#F93C65]'
                    : 'border-[#C8C4D7]/60 focus:border-[#4132C7] focus:ring-[#4132C7]'
                }`}
              />
              {errors.displayNameOverride && (
                <p className="text-[12px] text-[#F93C65] mt-1">
                  {errors.displayNameOverride}
                </p>
              )}
            </div>
          )}

          {/* Temporary Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[13px] font-semibold text-[#121C2C]">
                Temporary Password <span className="text-[#F93C65]">*</span>
              </label>
              <button
                type="button"
                onClick={() => setTempPassword(generateRandomPassword())}
                className="text-[12px] font-semibold text-[#4132C7] hover:text-[#5A4FE0] hover:underline"
              >
                Generate Random
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={tempPassword}
                onChange={(e) => {
                  setTempPassword(e.target.value);
                  if (errors.tempPassword) {
                    setErrors((prev) => ({ ...prev, tempPassword: '' }));
                  }
                }}
                placeholder="Enter temporary password"
                className={`w-full h-11 pl-3.5 pr-10 text-[14px] bg-[#F5F5FA] font-mono border rounded-xl focus:outline-none focus:ring-1 transition-all ${
                  errors.tempPassword
                    ? 'border-[#F93C65] focus:border-[#F93C65] focus:ring-[#F93C65]'
                    : 'border-[#C8C4D7]/60 focus:border-[#4132C7] focus:ring-[#4132C7]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#777586] hover:text-[#121C2C]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            {errors.tempPassword ? (
              <p className="text-[12px] text-[#F93C65] mt-1">{errors.tempPassword}</p>
            ) : (
              <p className="text-[11px] text-[#474554] mt-1">
                Share this with the user securely — it won&apos;t be shown again.
              </p>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#C8C4D7]/30">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-[#474554] hover:bg-[#F5F5FA] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full text-[13px] font-bold bg-[#4132C7] hover:bg-[#5A4FE0] text-white transition-all shadow-sm active:scale-[0.98]"
            >
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
