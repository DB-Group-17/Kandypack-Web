'use client';

/**
 * @file ReceiveGoodsModal.tsx
 * @description Accessible dialog for receiving train booking cargo at a physical destination store.
 * Allows the store manager or administrator to select from arrived, unreceived train bookings,
 * inspect manifest items (Product, Expected Quantity, Received Quantity), and submit receipt.
 *
 * Adheres to:
 * - Docs/05_api-and-pages.md §A6 & §B
 * - Docs/07_content-copy.md §/inventory
 * - DESIGN.md modal, surface, and semantic color rules
 * - Review Reference: Member 4 Review Fix #4
 */

import React, { useState, useEffect } from 'react';
import { Store, ArrivedTrainBooking, ReceiveGoodsItemInput, ApiArrivedBookingsResponse } from '../types';

/**
 * Props accepted by the ReceiveGoodsModal component.
 */
interface ReceiveGoodsModalProps {
  /** Whether the modal dialog is currently visible in the DOM */
  isOpen: boolean;
  /** Active physical store receiving the goods */
  activeStore: Store;
  /** Optional preloaded arrived bookings passed during transition or testing */
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
 * Formats an ISO datetime string into human-readable date and time.
 *
 * @param isoStr - ISO date string
 * @returns Clean localized datetime string (e.g. "Aug 31, 2026, 08:30")
 */
function formatArrivalDateTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

/**
 * ReceiveGoodsModal Component
 *
 * Renders an accessible modal dialog to receive arrived train cargo at the active store.
 * Replaces manual booking ID entry with an arrived-booking dropdown selector and
 * an itemized manifest table showing Product, Expected Quantity, and Received Quantity.
 *
 * @param props - Component properties conforming to ReceiveGoodsModalProps
 * @returns JSX element or null when hidden
 */
export const ReceiveGoodsModal: React.FC<ReceiveGoodsModalProps> = ({
  isOpen,
  activeStore,
  availableBookings: initialBookings,
  onClose,
  onConfirmReceipt,
}) => {
  // Arrived bookings fetched from the API for the active store
  const [fetchedBookings, setFetchedBookings] = useState<ArrivedTrainBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(false);
  const [bookingsFetchError, setBookingsFetchError] = useState<string | null>(null);

  // Use preloaded bookings if provided, otherwise use fetched bookings
  const arrivedBookings = initialBookings && initialBookings.length > 0 ? initialBookings : fetchedBookings;

  // Selected booking ID from the dropdown
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');

  // Loading state while the POST mutation is in flight to prevent duplicate submissions
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Error message received from backend business rule violations or validation failures
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Closes dialog and resets form state.
   */
  const handleClose = () => {
    if (isSubmitting) return;
    setSelectedBookingId('');
    setErrorMessage(null);
    onClose();
  };

  // Fetch arrived bookings when modal is open and no initial bookings provided
  useEffect(() => {
    if (!isOpen || (initialBookings && initialBookings.length > 0)) return;

    let isMounted = true;
    const fetchArrivedBookings = async () => {
      setIsLoadingBookings(true);
      setBookingsFetchError(null);

      try {
        const response = await fetch(`/api/stores/${activeStore.store_id}/arrived-bookings`);
        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          const msg =
            errData?.error?.message ||
            `Failed to load arrived bookings (HTTP ${response.status}).`;
          if (isMounted) setBookingsFetchError(msg);
          return;
        }

        const data: ApiArrivedBookingsResponse = await response.json();
        if (isMounted) {
          setFetchedBookings(data.items || []);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error('Error fetching arrived bookings:', err);
          setBookingsFetchError('Network error loading arrived bookings.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingBookings(false);
        }
      }
    };

    void fetchArrivedBookings();

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeStore.store_id, initialBookings]);

  if (!isOpen) return null;

  // Selected booking object
  const selectedBooking = arrivedBookings.find(
    (b) => String(b.booking_id) === String(selectedBookingId)
  );

  /**
   * Handles form submission, validating selection and executing the receipt mutation.
   *
   * @param e - React form submission event
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = selectedBookingId.trim();

    if (!trimmed) {
      setErrorMessage('Please select an arrived booking from the list.');
      return;
    }

    const bookingId = parseInt(trimmed, 10);
    if (isNaN(bookingId) || bookingId <= 0) {
      setErrorMessage('Please select a valid arrived booking.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await onConfirmReceipt(bookingId);

      if (result && typeof result === 'object') {
        if (result.success) {
          onClose();
        } else {
          setErrorMessage(
            result.error || 'Failed to receive goods. Please verify the booking and try again.'
          );
        }
      } else {
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
          if (!isSubmitting) handleClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Surface Card */}
      <div className="relative bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#C8C4D7]/40 w-full max-w-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
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
            onClick={handleClose}
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

            {/* Arrived Bookings Fetch Error Banner */}
            {bookingsFetchError && (
              <div
                className="bg-[#FFF0F0] border border-[#F93C65]/30 text-[#93000A] p-3.5 rounded-xl flex items-start gap-3"
                role="alert"
              >
                <svg className="w-5 h-5 text-[#F93C65] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-[13px] font-medium leading-relaxed">{bookingsFetchError}</div>
              </div>
            )}

            {/* Train Booking Selector */}
            <div>
              <label
                htmlFor="train-booking-select"
                className="block text-[12px] font-bold uppercase tracking-wider text-[#474554] mb-1.5"
              >
                Train Booking <span className="text-[#F93C65]">*</span>
              </label>
              <div className="relative">
                <select
                  id="train-booking-select"
                  value={selectedBookingId}
                  disabled={isSubmitting || isLoadingBookings}
                  onChange={(e) => {
                    setSelectedBookingId(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-[#F9F9FF] border border-[#C8C4D7]/80 rounded-lg px-4 py-2.5 text-[14px] text-[#121C2C] font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4132C7] focus:border-[#4132C7] transition-all disabled:opacity-60 shadow-2xs cursor-pointer"
                >
                  <option value="">Select an arrived booking</option>
                  {isLoadingBookings ? (
                    <option disabled value="__loading__">
                      Loading arrived bookings...
                    </option>
                  ) : arrivedBookings.length === 0 ? (
                    <option disabled value="__empty__">
                      No unreceived arrived bookings for this store
                    </option>
                  ) : (
                    arrivedBookings.map((b) => (
                      <option key={b.booking_id} value={b.booking_id}>
                        Booking #{b.booking_id} — Order #{b.order_id} (Trip #{b.trip_id}
                        {b.arrival_datetime ? `, Arrived: ${formatArrivalDateTime(b.arrival_datetime)}` : ''})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <p className="text-[12px] text-[#777586] mt-1.5">
                Choose an arrived booking to inspect cargo items and confirm receipt into store stock.
              </p>
            </div>

            {/* Selected Booking Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-[#474554]">
                  Cargo Manifest Items
                </span>
                {selectedBooking && (
                  <span className="text-[12px] text-[#777586]">
                    {selectedBooking.items.length} {selectedBooking.items.length === 1 ? 'product' : 'products'} listed
                  </span>
                )}
              </div>

              {selectedBooking ? (
                <div className="border border-[#C8C4D7]/40 rounded-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#F9F9FF] border-b border-[#E7EEFF]">
                        <tr>
                          <th className="py-2.5 px-4 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                            Product
                          </th>
                          <th className="py-2.5 px-4 text-[11px] font-bold text-[#474554] uppercase tracking-wider text-right">
                            Expected Quantity
                          </th>
                          <th className="py-2.5 px-4 text-[11px] font-bold text-[#474554] uppercase tracking-wider text-right">
                            Received Quantity
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E7EEFF]">
                        {selectedBooking.items.map((item) => (
                          <tr key={item.booking_item_id ?? item.product_id} className="hover:bg-[#F0F3FF]/40 transition-colors">
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-[13px] text-[#121C2C]">
                                {item.product_name}
                              </div>
                              <span className="font-mono text-[11px] text-[#777586] bg-[#F5F5FA] px-1.5 py-0.5 rounded border border-[#C8C4D7]/40">
                                {item.sku}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right text-[13px] font-medium text-[#474554] whitespace-nowrap">
                              {item.expected_quantity.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <span className="font-bold text-[13px] text-[#00B69B] bg-[#E6F6F4] px-2.5 py-1 rounded-md">
                                {item.expected_quantity.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 bg-[#F9F9FF]/60 border-t border-[#E7EEFF] text-[11px] text-[#777586] italic text-right">
                    Received quantities are determined by the verified booking manifest.
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-[#C8C4D7] rounded-xl p-6 text-center bg-[#F9F9FF]">
                  <p className="text-[13px] text-[#777586]">
                    Select an arrived booking above to review expected and received product quantities.
                  </p>
                </div>
              )}
            </div>

            {/* Informational Guidance Box */}
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
                Confirming receipt credits physical store inventory on hand and automatically advances
                the associated order status to <span className="font-semibold text-[#4132C7]">At Store</span> once all bookings have arrived.
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="px-6 py-4 bg-[#F9F9FF]/80 border-t border-[#E7EEFF] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full border border-[#C8C4D7] text-[13px] font-semibold text-[#474554] hover:bg-white hover:text-[#121C2C] disabled:opacity-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedBookingId || isSubmitting || isLoadingBookings}
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
