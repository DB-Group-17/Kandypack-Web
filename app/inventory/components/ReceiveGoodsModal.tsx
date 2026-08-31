'use client';

/**
 * @file ReceiveGoodsModal.tsx
 * @description Accessible dialog for receiving train booking cargo at a destination store.
 * Allows the store manager or administrator to select an arrived booking, review product
 * manifests, adjust received quantities against expected amounts, and confirm receipt.
 * Strictly adheres to Docs/07_content-copy.md §288 and DESIGN.md modal specifications.
 */

import React, { useState } from 'react';
import { Store, ArrivedTrainBooking, ReceiveGoodsItemInput } from '../types';

interface ReceiveGoodsModalProps {
  /** Whether the modal dialog is currently visible */
  isOpen: boolean;
  /** Active physical store receiving the goods */
  activeStore: Store;
  /** List of arrived train bookings available for receipt at this store */
  availableBookings: ArrivedTrainBooking[];
  /** Callback fired when modal is cancelled or closed */
  onClose: () => void;
  /** Callback fired when goods receipt is confirmed */
  onConfirmReceipt: (bookingId: number, items: ReceiveGoodsItemInput[]) => void;
}

/**
 * ReceiveGoodsModal Component
 */
export const ReceiveGoodsModal: React.FC<ReceiveGoodsModalProps> = ({
  isOpen,
  activeStore,
  availableBookings,
  onClose,
  onConfirmReceipt,
}) => {
  if (!isOpen) return null;

  return (
    <ReceiveGoodsModalContent
      activeStore={activeStore}
      availableBookings={availableBookings}
      onClose={onClose}
      onConfirmReceipt={onConfirmReceipt}
    />
  );
};

interface ReceiveGoodsModalContentProps {
  activeStore: Store;
  availableBookings: ArrivedTrainBooking[];
  onClose: () => void;
  onConfirmReceipt: (bookingId: number, items: ReceiveGoodsItemInput[]) => void;
}

/**
 * Inner modal content component with local form state initialized upon mount.
 */
const ReceiveGoodsModalContent: React.FC<ReceiveGoodsModalContentProps> = ({
  activeStore,
  availableBookings,
  onClose,
  onConfirmReceipt,
}) => {
  // Initialize selected booking to first available booking
  const initialBooking = availableBookings[0];
  const [selectedBookingId, setSelectedBookingId] = useState<number>(
    initialBooking?.train_booking_id || 0
  );

  // Initialize editable item inputs from the initial booking
  const [items, setItems] = useState<ReceiveGoodsItemInput[]>(() => {
    if (!initialBooking) return [];
    return initialBooking.items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      expected_quantity: item.expected_quantity,
      received_quantity: item.expected_quantity,
    }));
  });

  // Submitting state for confirmation feedback
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Handles user switching train bookings, refreshing item manifest.
   */
  const handleBookingChange = (newBookingId: number) => {
    setSelectedBookingId(newBookingId);
    const booking = availableBookings.find((b) => b.train_booking_id === newBookingId);
    if (booking) {
      setItems(
        booking.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          expected_quantity: item.expected_quantity,
          received_quantity: item.expected_quantity,
        }))
      );
    } else {
      setItems([]);
    }
  };

  /**
   * Handles user edit of received quantity for a specific product.
   *
   * @param productId The product being adjusted
   * @param newQty The updated quantity
   */
  const handleQuantityChange = (productId: number, newQty: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, received_quantity: Math.max(0, newQty) }
          : item
      )
    );
  };

  /**
   * Quick action to reset all received quantities to equal expected quantities.
   */
  const handleMatchAll = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        received_quantity: item.expected_quantity,
      }))
    );
  };

  /**
   * Handles receipt confirmation submission.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingId || items.length === 0) return;

    setIsSubmitting(true);
    setTimeout(() => {
      onConfirmReceipt(selectedBookingId, items);
      setIsSubmitting(false);
      onClose();
    }, 300);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receive-goods-title"
    >
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card Surface */}
      <div className="relative bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#C8C4D7]/40 w-full max-w-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[#E7EEFF] flex items-center justify-between bg-[#F9F9FF]/80">
          <div>
            <h2 id="receive-goods-title" className="text-[20px] font-bold text-[#121C2C]">
              Receive Goods
            </h2>
            <p className="text-[13px] text-[#474554] mt-0.5">
              Receiving cargo at <strong className="text-[#4132C7] font-semibold">{activeStore.store_name}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#777586] hover:text-[#121C2C] hover:bg-white transition-colors"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5 max-h-[calc(80vh-140px)] overflow-y-auto custom-scrollbar">
            {availableBookings.length > 0 ? (
              <>
                {/* Train Booking Selector */}
                <div>
                  <label
                    htmlFor="train-booking-select"
                    className="block text-[12px] font-bold uppercase tracking-wider text-[#474554] mb-1.5"
                  >
                    Train Booking
                  </label>
                  <div className="relative">
                    <select
                      id="train-booking-select"
                      value={selectedBookingId}
                      onChange={(e) => handleBookingChange(Number(e.target.value))}
                      className="w-full appearance-none bg-[#F9F9FF] border border-[#C8C4D7]/80 rounded-lg px-4 py-2.5 text-[14px] text-[#121C2C] font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4132C7] transition-all pr-10 cursor-pointer"
                    >
                      {availableBookings.map((booking) => (
                        <option key={booking.train_booking_id} value={booking.train_booking_id}>
                          {booking.trip_code} — {booking.origin_city} to {booking.destination_city} (Arrived: {booking.arrival_datetime})
                        </option>
                      ))}
                    </select>
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#777586]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Items Manifest & Quantity Inputs */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-[#474554]">
                      Cargo Manifest Line Items
                    </span>
                    <button
                      type="button"
                      onClick={handleMatchAll}
                      className="text-[12px] font-semibold text-[#4132C7] hover:underline"
                    >
                      Match All Expected
                    </button>
                  </div>

                  <div className="border border-[#E7EEFF] rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F0F3FF]/60 border-b border-[#E7EEFF]">
                          <th className="py-2.5 px-4 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                            Product
                          </th>
                          <th className="py-2.5 px-4 text-[11px] font-bold text-[#474554] uppercase tracking-wider text-right">
                            Expected
                          </th>
                          <th className="py-2.5 px-4 text-[11px] font-bold text-[#474554] uppercase tracking-wider text-right w-36">
                            Received Qty
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E7EEFF]">
                        {items.map((item) => {
                          const hasDiscrepancy = item.received_quantity !== item.expected_quantity;
                          return (
                            <tr key={item.product_id} className="hover:bg-[#F9F9FF]">
                              <td className="py-3 px-4">
                                <div className="font-medium text-[13px] text-[#121C2C]">
                                  {item.product_name}
                                </div>
                                <div className="font-mono text-[11px] text-[#777586]">
                                  {item.sku}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right font-medium text-[13px] text-[#474554]">
                                {item.expected_quantity.toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex flex-col items-end">
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.received_quantity}
                                    onChange={(e) =>
                                      handleQuantityChange(
                                        item.product_id,
                                        parseInt(e.target.value, 10) || 0
                                      )
                                    }
                                    className={`w-28 text-right px-3 py-1.5 rounded-lg border text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#4132C7] transition-all ${
                                      hasDiscrepancy
                                        ? 'border-[#FFB800] bg-[#FFF9E6] text-[#B87C00]'
                                        : 'border-[#C8C4D7]/80 bg-white text-[#121C2C]'
                                    }`}
                                  />
                                  {hasDiscrepancy && (
                                    <span className="text-[10px] font-medium text-[#B87C00] mt-0.5">
                                      {item.received_quantity > item.expected_quantity
                                        ? `+${item.received_quantity - item.expected_quantity} surplus`
                                        : `${item.received_quantity - item.expected_quantity} short`}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              /* No arrived bookings state */
              <div className="py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-[#FFF9E6] text-[#FFB800] flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-[#121C2C]">
                  No arrived train bookings pending receipt
                </p>
                <p className="text-[12px] text-[#474554] mt-1">
                  All cargo dispatched to {activeStore.store_name} has already been received.
                </p>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="px-6 py-4 bg-[#F9F9FF]/80 border-t border-[#E7EEFF] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-[#C8C4D7] text-[13px] font-semibold text-[#474554] hover:bg-white hover:text-[#121C2C] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={availableBookings.length === 0 || isSubmitting}
              className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#5A4FE0] shadow-sm disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
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
