'use client';

/**
 * @file TempPasswordBanner.tsx
 * @description Dismissible notification banner shown immediately following user account creation.
 * Conforms to Docs/05_api-and-pages.md §380 and Docs/07_content-copy.md §353:
 * "Account created. Temporary password: {password} — make sure to share this now, it won't be displayed again."
 * Includes one-click clipboard copy and dismiss controls.
 */

import React, { useState } from 'react';

interface TempPasswordBannerProps {
  /** The created user email */
  email: string;
  /** The temporary password string to display */
  tempPassword: string;
  /** Callback to dismiss the banner */
  onDismiss: () => void;
  /** Optional callback when password is copied */
  onCopySuccess?: () => void;
}

/**
 * TempPasswordBanner Component
 *
 * Displays the one-time temporary password notice banner with copy action.
 *
 * @param props Component properties containing email, tempPassword, and dismiss handlers
 * @returns Banner element
 */
export const TempPasswordBanner: React.FC<TempPasswordBannerProps> = ({
  email,
  tempPassword,
  onDismiss,
  onCopySuccess,
}) => {
  const [copied, setCopied] = useState(false);

  /**
   * Copies the temporary password to the user's system clipboard.
   */
  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(tempPassword);
        setCopied(true);
        onCopySuccess?.();
        setTimeout(() => setCopied(false), 3000);
      }
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="bg-[#FFF9E6] border-2 border-[#FFB800] rounded-2xl p-4 md:p-5 shadow-sm transition-all animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Side: Icon and Message */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#121C2C]">
              Account created for <span className="text-[#4132C7]">{email}</span>
            </p>
            <p className="text-[13px] text-[#474554] mt-0.5">
              Temporary password:{' '}
              <span className="font-mono font-bold text-[14px] text-[#121C2C] bg-white px-2 py-0.5 rounded-md border border-[#FFB800]/50 select-all">
                {tempPassword}
              </span>{' '}
              — make sure to share this now, it won&apos;t be displayed again.
            </p>
          </div>
        </div>

        {/* Right Side: Copy and Dismiss Buttons */}
        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all flex items-center gap-1.5 shadow-xs ${
              copied
                ? 'bg-[#00B69B] text-white'
                : 'bg-[#121C2C] hover:bg-[#251297] text-white'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                  />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={onDismiss}
            className="px-4 py-2 bg-white hover:bg-[#F5F5FA] text-[#474554] border border-[#C8C4D7]/60 rounded-full text-[13px] font-semibold transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
