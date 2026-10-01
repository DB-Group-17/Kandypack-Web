'use client';

/**
 * @file AddUserModal.tsx
 * @description Modal dialog for creating a new user account (/admin/users).
 * Conforms to Docs/05_api-and-pages.md §A10, Docs/07_content-copy.md §/admin/users, and DESIGN.md:
 * - Email, Role selection, Link to employee (optional), Display name override, Temporary password
 * - Random secure password generator and visibility toggle
 * - Form validation with clear backend-propagated error messaging
 * - Strictly maps payload to POST /api/users schema
 */

import React, { useState } from 'react';
import { AppRole, EmployeeOption, NewUserPayload } from '../types';

interface AddUserModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback fired when user cancels or closes modal */
  onClose: () => void;
  /** Async callback fired with valid payload upon creation */
  onSubmit: (
    payload: NewUserPayload
  ) => Promise<{ success: boolean; error?: string; field?: string }>;
  /** List of eligible active employees to link */
  employees: EmployeeOption[];
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
 * @param props - Component properties containing modal state and submission callback
 * @returns JSX.Element | null
 */
export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  employees,
}) => {
  // Form fields state
  const [email, setEmail] = useState('');
  const [appRole, setAppRole] = useState<AppRole>('order_entry_clerk');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [displayNameOverride, setDisplayNameOverride] = useState('');
  const [tempPassword, setTempPassword] = useState(() => generateRandomPassword());
  const [showPassword, setShowPassword] = useState(true);

  // Submission & Validation feedback state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
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
    setApiError(null);
    setIsSubmitting(false);
  };

  /**
   * Closes modal and resets form inputs if not actively submitting.
   */
  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  /**
   * Handles employee selection change, preselecting compatible role when available.
   *
   * @param empIdStr - Selected employee ID string or empty for standalone
   */
  const handleEmployeeChange = (empIdStr: string) => {
    setSelectedEmployeeId(empIdStr);
    setApiError(null);
    setErrors((prev) => ({ ...prev, employee_id: '', displayNameOverride: '' }));

    if (empIdStr) {
      const emp = employees.find((e) => e.employee_id === Number(empIdStr));
      if (emp) {
        // Clear manual name override since employee full name will be used
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
   * Validates form inputs client-side, then dispatches POST /api/users payload.
   * Preserves entered values and displays backend error if API returns failure.
   *
   * @param e - Form submit event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const newErrors: Record<string, string> = {};

    // 1. Client-side email validation
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      newErrors.email = 'Email address is required.';
    } else if (!emailRegex.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    // 2. Client-side password validation
    if (!tempPassword.trim()) {
      newErrors.tempPassword = 'Temporary password is required.';
    } else if (tempPassword.trim().length < 8) {
      newErrors.tempPassword = 'Password must be at least 8 characters long.';
    }

    // 3. Client-side display name validation (enforces chk_user_profiles_name)
    if (!selectedEmployeeId && !displayNameOverride.trim()) {
      newErrors.displayNameOverride =
        'Display name is required when not linking to an existing employee.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // 4. Dispatch mutation to parent handler
    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        email: trimmedEmail,
        app_role: appRole,
        employee_id: selectedEmployeeId ? Number(selectedEmployeeId) : null,
        display_name_override: selectedEmployeeId ? undefined : displayNameOverride.trim(),
        temp_password: tempPassword.trim(),
      });

      if (result.success) {
        resetForm();
        onClose();
      } else {
        setIsSubmitting(false);
        if (result.field) {
          const mappedField =
            result.field === 'temp_password'
              ? 'tempPassword'
              : result.field === 'display_name_override'
              ? 'displayNameOverride'
              : result.field;
          setErrors({ [mappedField]: result.error || 'Validation error' });
        } else {
          setApiError(result.error || 'Failed to create user account. Please check inputs.');
        }
      }
    } catch {
      setIsSubmitting(false);
      setApiError('Unexpected network failure while transmitting registration.');
    }
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
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#777586] hover:bg-[#F5F5FA] hover:text-[#121C2C] transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Top API Error Alert */}
        {apiError && (
          <div className="mt-4 p-3 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl text-[12px] text-[#F93C65] flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="leading-snug">{apiError}</span>
          </div>
        )}

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
              disabled={isSubmitting}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                if (apiError) setApiError(null);
              }}
              placeholder="staff@kandypack.lk"
              className={`w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border rounded-xl focus:outline-none focus:ring-1 transition-all disabled:opacity-60 ${
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
              disabled={isSubmitting}
              onChange={(e) => {
                setAppRole(e.target.value as AppRole);
                if (errors.app_role) setErrors((prev) => ({ ...prev, app_role: '' }));
              }}
              className="w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border border-[#C8C4D7]/60 rounded-xl font-medium text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] cursor-pointer disabled:opacity-60"
            >
              <option value="system_administrator">System Administrator</option>
              <option value="logistics_manager">Logistics Manager</option>
              <option value="store_manager">Store Manager</option>
              <option value="fleet_supervisor">Fleet Supervisor</option>
              <option value="order_entry_clerk">Order Entry Clerk</option>
            </select>
            {errors.app_role && (
              <p className="text-[12px] text-[#F93C65] mt-1">{errors.app_role}</p>
            )}
          </div>

          {/* Link to Employee (Optional) */}
          <div>
            <label className="block text-[13px] font-semibold text-[#121C2C] mb-1">
              Link to Employee
            </label>
            <select
              value={selectedEmployeeId}
              disabled={isSubmitting}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className={`w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border rounded-xl text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] cursor-pointer disabled:opacity-60 ${
                errors.employee_id ? 'border-[#F93C65]' : 'border-[#C8C4D7]/60'
              }`}
            >
              <option value="">-- Standalone account (No linked employee) --</option>
              {employees.map((emp) => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.full_name} ({emp.employee_type.replace('_', ' ')}) — {emp.home_store_name || 'Central HQ'}
                </option>
              ))}
            </select>
            {errors.employee_id ? (
              <p className="text-[12px] text-[#F93C65] mt-1">{errors.employee_id}</p>
            ) : (
              <p className="text-[11px] text-[#474554] mt-1">
                Linking attaches the employee&apos;s verified name and store affiliation.
              </p>
            )}
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
                disabled={isSubmitting}
                onChange={(e) => {
                  setDisplayNameOverride(e.target.value);
                  if (errors.displayNameOverride) {
                    setErrors((prev) => ({ ...prev, displayNameOverride: '' }));
                  }
                }}
                placeholder="e.g. Operations Service Lead"
                className={`w-full h-11 px-3.5 text-[14px] bg-[#F5F5FA] border rounded-xl focus:outline-none focus:ring-1 transition-all disabled:opacity-60 ${
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
                disabled={isSubmitting}
                onClick={() => setTempPassword(generateRandomPassword())}
                className="text-[12px] font-semibold text-[#4132C7] hover:text-[#5A4FE0] hover:underline disabled:opacity-50"
              >
                Generate Random
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={tempPassword}
                disabled={isSubmitting}
                onChange={(e) => {
                  setTempPassword(e.target.value);
                  if (errors.tempPassword) {
                    setErrors((prev) => ({ ...prev, tempPassword: '' }));
                  }
                }}
                placeholder="Enter temporary password"
                className={`w-full h-11 pl-3.5 pr-10 text-[14px] bg-[#F5F5FA] font-mono border rounded-xl focus:outline-none focus:ring-1 transition-all disabled:opacity-60 ${
                  errors.tempPassword
                    ? 'border-[#F93C65] focus:border-[#F93C65] focus:ring-[#F93C65]'
                    : 'border-[#C8C4D7]/60 focus:border-[#4132C7] focus:ring-[#4132C7]'
                }`}
              />
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#777586] hover:text-[#121C2C] disabled:opacity-50"
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
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-[#474554] hover:bg-[#F5F5FA] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full text-[13px] font-bold bg-[#4132C7] hover:bg-[#5A4FE0] text-white transition-all shadow-sm active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
            >
              {isSubmitting && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              <span>{isSubmitting ? 'Creating...' : 'Create Account'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
