'use client';

/**
 * @file ReceiveGoodsModal.tsx
 * @description Accessible dialog for receiving train booking cargo at a physical destination store.
 * Submits the Train Booking ID to POST /api/stores/:id/receive-goods, where the backend stored
 * procedure derives manifest items, verifies 'Arrived' status, checks store matching,
 * updates inventory stock on hand via database triggers, and advances order statuses.
 * 
 * Adheres to:
 * - Docs/05_api-and-pages.md §A6 & §B
 * - Docs/07_content-copy.md §/inventory
 * - DESIGN.md modal, surface, and semantic color rules
 */

import React, { useState } from 'react';
import { Store, ArrivedTrainBooking, ReceiveGoodsItemInput } from '../types';

/**
 * Props accepted by the ReceiveGoodsModal component.
 */
interface ReceiveGoodsModalProps {
  /** Whether the modal dialog is currently visible in the DOM */
  isOpen: boolean;
  /** Active physical store receiving the goods */
  activeStore: Store;
  /** Optional legacy mock bookings passed during transition */
  availableBookings?: ArrivedTrainBooking[];
  /** Callback fired when the dialog is dismissed or cancelled */
  onClose: () => void;
  /**
   * Action handler called when the user submits a Train Booking ID.
   * Communicates with POST /api/stores/:id/receive-goods and returns outcome.
   *
   * @param bookingId - Positive integer train booking identifier
   * @param items - Optional line items for backward compatibility
   * @returns Promise resolving to an object with success status and optional error message
   */
  onConfirmReceipt: (
    bookingId: number,
    items?: ReceiveGoodsItemInput[]
  ) => Promise<{ success: boolean; error?: string; updated_products?: number }> | void;
}

/**
 * ReceiveGoodsModal Component
 *
 * Renders an accessible modal dialog to receive arrived train cargo at the active store.
 * 
 * @param props - Component properties conforming to ReceiveGoodsModalProps
 * @returns JSX element or null when hidden
 */
export const ReceiveGoodsModal: React.FC<ReceiveGoodsModalProps> = ({
  isOpen,
  activeStore,
  onClose,
  onConfirmReceipt,
}) => {
  // Local state for the entered Train Booking ID input
  const [bookingIdInput, setBookingIdInput] = useState<string>('');

  // Loading state while the POST mutation is in flight to prevent duplicate submissions
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Error message received from backend business rule violations or validation failures
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  /**
   * Handles form submission, validating input and executing the receipt mutation.
   *
   * @param e - React form submission event
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = bookingIdInput.trim();

    // Client-side pre-flight validation
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      setErrorMessage('Please enter a valid positive numeric Train Booking ID.');
      return;
    }

    const bookingId = parseInt(trimmed, 10);
    if (isNaN(bookingId) || bookingId <= 0) {
      setErrorMessage('Train Booking ID must be a positive integer greater than zero.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await onConfirmReceipt(bookingId);

      // If handler returns an object with success/error flags
      if (result && typeof result === 'object') {
        if (result.success) {
          onClose();
        } else {
          setErrorMessage(
            result.error || 'Failed to receive goods. Please verify the booking ID and try again.'
          );
        }
      } else {
        // Fallback for void handlers
        onClose();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'An unexpected error occurred while processing receipt.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receive-goods-title"
    >
      {/* Dimmed backdrop with smooth blur */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Surface Card */}
      <div className="relative bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#C8C4D7]/40 w-full max-w-lg overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[#E7EEFF] flex items-center justify-between bg-[#F9F9FF]/80">
          <div>
            <h2 id="receive-goods-title" className="text-[20px] font-bold text-[#121C2C]">
              Receive Goods
            </h2>
            <p className="text-[13px] text-[#474554] mt-0.5">
              Receiving cargo at{' '}
              <strong className="text-[#4132C7] font-semibold">{activeStore.store_name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-full text-[#777586] hover:text-[#121C2C] hover:bg-white disabled:opacity-50 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            {/* Inline Error Message Banner */}
            {errorMessage && (
              <div
                className="bg-[#FFF0F0] border border-[#F93C65]/30 text-[#93000A] p-3.5 rounded-xl flex items-start gap-3 animate-in fade-in duration-200"
                role="alert"
              >
                <svg
                  className="w-5 h-5 text-[#F93C65] shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="text-[13px] font-medium leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Train Booking ID Input Field */}
            <div>
              <label
                htmlFor="train-booking-id"
                className="block text-[12px] font-bold uppercase tracking-wider text-[#474554] mb-1.5"
              >
                Train Booking ID <span className="text-[#F93C65]">*</span>
              </label>
              <div className="relative">
                <input
                  id="train-booking-id"
                  type="number"
                  min="1"
                  step="1"
                  autoFocus
                  disabled={isSubmitting}
                  placeholder="Enter arrived booking ID (e.g. 101)"
                  value={bookingIdInput}
                  onChange={(e) => {
                    setBookingIdInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-[#F9F9FF] border border-[#C8C4D7]/80 rounded-lg px-4 py-2.5 text-[14px] text-[#121C2C] font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4132C7] focus:border-[#4132C7] transition-all disabled:opacity-60 shadow-2xs"
                />
              </div>
              <p className="text-[12px] text-[#777586] mt-1.5">
                Enter the Booking ID from the arrived train cargo manifest.
              </p>
            </div>

            {/* Explanatory Info Card */}
            <div className="bg-[#F0F3FF] border border-[#DEE8FF] rounded-xl p-4 flex items-start gap-3 text-[#121C2C]">
              <div className="w-8 h-8 rounded-lg bg-[#4132C7]/10 flex items-center justify-center text-[#4132C7] shrink-0 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                  />
                </svg>
              </div>
              <div className="text-[12px] leading-relaxed text-[#474554]">
                <strong className="text-[#121C2C] font-semibold block mb-0.5">
                  Automated Manifest Verification
                </strong>
                The backend procedure confirms the train trip has arrived, validates destination store
                matching, credits store inventory, and automatically advances the associated order status to{' '}
                <span className="font-semibold text-[#4132C7]">At Store</span>.
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="px-6 py-4 bg-[#F9F9FF]/80 border-t border-[#E7EEFF] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full border border-[#C8C4D7] text-[13px] font-semibold text-[#474554] hover:bg-white hover:text-[#121C2C] disabled:opacity-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!bookingIdInput.trim() || isSubmitting}
              className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#5A4FE0] active:scale-98 shadow-sm disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span>Receiving…</span>
                </>
              ) : (
                <span>Confirm Receipt</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

