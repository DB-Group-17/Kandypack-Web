'use client';

/**
 * @file AddCustomerModal.tsx
 * @description Accessible modal dialog for registering a new customer account.
 * Collects Customer name, Customer type (Retail/Wholesale), Phone, Email, Registered city, and Address.
 * Conforms to Docs/07_content-copy.md §393.
 */

import React, { useState } from 'react';
import { NewCustomerPayload } from '../types';
import { MOCK_CITIES } from '../mockData';

interface AddCustomerModalProps {
  /** Whether the modal dialog is currently visible */
  isOpen: boolean;
  /** Callback when the modal is dismissed */
  onClose: () => void;
  /** Callback when valid customer payload is submitted */
  onSubmit: (payload: NewCustomerPayload) => void;
}

/**
 * AddCustomerModal Component
 */
export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerType, setCustomerType] = useState<'retail' | 'wholesale'>('retail');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cityId, setCityId] = useState<number>(MOCK_CITIES.find((c) => c.is_destination)?.city_id || 2);
  const [addressLine, setAddressLine] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  /**
   * Validates customer information before triggering callback.
   *
   * @param e Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = customerName.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = addressLine.trim();

    if (!trimmedName || !trimmedPhone || !trimmedAddress) {
      setErrorMessage('Please fill in Customer Name, Phone, and Delivery Address.');
      return;
    }

    onSubmit({
      customer_name: trimmedName,
      customer_type: customerType,
      phone: trimmedPhone,
      email: email.trim() || undefined,
      registered_city_id: cityId,
      address_line: trimmedAddress,
    });

    // Reset and close
    setCustomerName('');
    setCustomerType('retail');
    setPhone('');
    setEmail('');
    setAddressLine('');
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#C8C4D7]/30 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#C8C4D7]/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EBE9FE] text-[#4132C7] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-[#121C2C]">Add Customer</h3>
              <p className="text-[12px] text-[#474554]">
                Register a new retail store or wholesale distributor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#777586] hover:bg-[#F5F5FA] hover:text-[#121C2C]"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl flex items-center gap-2 text-[13px] text-[#F93C65]">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Customer Name */}
          <div>
            <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
              Customer Name <span className="text-[#F93C65]">*</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Galle Coastal Supermarket"
              required
              className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer Type Radio Selection */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Customer Type <span className="text-[#F93C65]">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 h-11">
                <button
                  type="button"
                  onClick={() => setCustomerType('retail')}
                  className={`flex items-center justify-center rounded-lg border text-[13px] font-semibold transition-all ${
                    customerType === 'retail'
                      ? 'bg-[#E0F2FF] border-[#0047CC] text-[#0047CC]'
                      : 'bg-[#F9F9FF] border-[#C8C4D7]/50 text-[#474554]'
                  }`}
                >
                  Retail
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType('wholesale')}
                  className={`flex items-center justify-center rounded-lg border text-[13px] font-semibold transition-all ${
                    customerType === 'wholesale'
                      ? 'bg-[#EBE9FE] border-[#4132C7] text-[#4132C7]'
                      : 'bg-[#F9F9FF] border-[#C8C4D7]/50 text-[#474554]'
                  }`}
                >
                  Wholesale
                </button>
              </div>
            </div>

            {/* Registered City */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Registered City <span className="text-[#F93C65]">*</span>
              </label>
              <select
                value={cityId}
                onChange={(e) => setCityId(Number(e.target.value))}
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              >
                {MOCK_CITIES.filter((c) => c.is_destination).map((c) => (
                  <option key={c.city_id} value={c.city_id}>
                    {c.city_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Phone */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Phone <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 077-8899000"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. orders@gallemart.lk"
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>
          </div>

          {/* Address Line */}
          <div>
            <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
              Delivery Address <span className="text-[#F93C65]">*</span>
            </label>
            <textarea
              rows={2}
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              placeholder="e.g. No. 44, Matara Road, Galle Fort"
              required
              className="w-full p-3 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#C8C4D7]/20 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-[#C8C4D7] text-[#474554] font-semibold text-[13px] hover:bg-[#F5F5FA] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white font-semibold text-[13px] hover:bg-[#3527a8] transition-colors shadow-sm"
            >
              + Add Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
