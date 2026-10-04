'use client';

/**
 * @file StatusToggleModal.tsx
 * @description Confirmation modal for toggling a user account between Active and Deactivated states.
 * Conforms to Docs/07_content-copy.md §/admin/users and DESIGN.md:
 * "Deactivate {email}? They won't be able to sign in until reactivated."
 * Enforces soft deactivation toggling via PATCH /api/users/:id.
 */

import React, { useState } from 'react';
import { UserAccountItem } from '../types';

interface StatusToggleModalProps {
  /** The target user to activate or deactivate */
  user: UserAccountItem | null;
  /** Current signed-in user ID for self-action protection */
  currentUserId?: string;
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Async callback to confirm status change */
  onConfirm: (user: UserAccountItem) => Promise<{ success: boolean; error?: string }>;
}

/**
 * StatusToggleModal Component
 *
 * Renders the confirmation dialog for activating or deactivating a user account.
 * Keyed by user_id to ensure clean lifecycle without cascading effect resets.
 *
 * @param props - Component properties containing user record and action handlers
 * @returns JSX.Element | null
 */
export const StatusToggleModal: React.FC<StatusToggleModalProps> = ({
  user,
  currentUserId,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const isDeactivating = user.is_active;
  const isSelf = Boolean(currentUserId && user.user_id === currentUserId);
  const cannotDeactivate = isSelf && isDeactivating;

  /**
   * Handles confirming the status toggle mutation.
   */
  const handleConfirm = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await onConfirm(user);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to update account status.');
        setIsSubmitting(false);
      }
      // On success, parent closes modal and refreshes data
    } catch {
      setErrorMessage('Unexpected network failure while toggling account status.');
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

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#C8C4D7]/40 p-6 md:p-7 z-10 animate-fadeIn">
        <div className="flex items-start gap-4">
          {/* Status Icon */}
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              isDeactivating
                ? 'bg-[#FFF0F0] text-[#F93C65]'
                : 'bg-[#E6F6F4] text-[#00B69B]'
            }`}
          >
            {isDeactivating ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </div>

          {/* Dialog Text */}
          <div className="flex-1">
            <h3 className="text-[18px] font-bold text-[#121C2C]">
              {isDeactivating ? 'Deactivate User Account' : 'Activate User Account'}
            </h3>
            <p className="text-[14px] text-[#474554] mt-1.5 leading-relaxed">
              {isDeactivating ? (
                <>
                  Deactivate <strong className="text-[#121C2C]">{user.email}</strong>? They
                  won&apos;t be able to sign in until reactivated.
                </>
              ) : (
                <>
                  Reactivate <strong className="text-[#121C2C]">{user.email}</strong>? They
                  will regain permission to sign in and perform assigned duties.
                </>
              )}
            </p>
          </div>
        </div>

        {/* User Summary Pill */}
        <div className="mt-4 p-3 bg-[#F5F5FA] rounded-xl border border-[#C8C4D7]/30 text-[13px] flex items-center justify-between">
          <span className="font-semibold text-[#121C2C]">{user.display_name}</span>
          <span className="text-[#474554]">{user.department_or_title}</span>
        </div>

        {/* Backend Error Banner */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl text-[12px] text-[#F93C65] flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {/* Self Deactivation Warning */}
        {cannotDeactivate && (
          <div className="mt-4 p-3 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl text-[12px] text-[#F93C65] flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="leading-snug">Administrators cannot deactivate their own account.</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#C8C4D7]/30">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-[13px] font-semibold text-[#474554] hover:bg-[#F5F5FA] rounded-full transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || cannotDeactivate}
            className={`px-5 py-2 text-[13px] font-bold text-white rounded-full transition-all shadow-sm active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 ${
              isDeactivating
                ? 'bg-[#F93C65] hover:bg-[#E02852]'
                : 'bg-[#00B69B] hover:bg-[#009E86]'
            }`}
          >
            {isSubmitting && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            <span>
              {isSubmitting
                ? 'Updating...'
                : isDeactivating
                ? 'Confirm Deactivation'
                : 'Confirm Activation'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
