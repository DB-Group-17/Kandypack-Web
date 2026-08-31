'use client';

/**
 * @file AddEmployeeModal.tsx
 * @description Accessible modal dialog for creating a new employee record.
 * Collects Full name, NIC number, Phone, Email, Employee type, and Home store.
 * Conditionally collects driver license details when type is 'driver'.
 * Conforms to Docs/07_content-copy.md §388.
 */

import React, { useState } from 'react';
import { NewEmployeePayload, EmployeeRole } from '../types';
import { MOCK_STORES } from '../mockData';

interface AddEmployeeModalProps {
  /** Whether the modal dialog is currently visible */
  isOpen: boolean;
  /** Callback when the modal is dismissed */
  onClose: () => void;
  /** Callback when valid employee payload is submitted */
  onSubmit: (payload: NewEmployeePayload) => void;
}

interface RoleOption {
  value: EmployeeRole;
  label: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: 'driver', label: 'Driver' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'store_manager', label: 'Store Manager' },
  { value: 'fleet_supervisor', label: 'Fleet Supervisor' },
  { value: 'logistics_manager', label: 'Logistics Manager' },
  { value: 'order_entry_clerk', label: 'Order Entry Clerk' },
  { value: 'system_administrator', label: 'System Administrator' },
];

/**
 * AddEmployeeModal Component
 */
export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [fullName, setFullName] = useState('');
  const [nicNumber, setNicNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EmployeeRole>('driver');
  const [storeId, setStoreId] = useState<string>('1');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  /**
   * Validates employee information and driver license if required.
   *
   * @param e Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = fullName.trim();
    const trimmedNic = nicNumber.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedNic || !trimmedPhone) {
      setErrorMessage('Please fill in all mandatory fields (Name, NIC, and Phone).');
      return;
    }

    if (role === 'driver' && !licenseNumber.trim()) {
      setErrorMessage('Driver license number is required for drivers.');
      return;
    }

    onSubmit({
      full_name: trimmedName,
      nic_number: trimmedNic,
      phone: trimmedPhone,
      email: email.trim() || undefined,
      employee_type: role,
      home_store_id: storeId ? Number(storeId) : null,
      license_number: role === 'driver' ? licenseNumber.trim() : undefined,
      license_expiry: role === 'driver' ? licenseExpiry.trim() : undefined,
    });

    // Reset and close
    setFullName('');
    setNicNumber('');
    setPhone('');
    setEmail('');
    setLicenseNumber('');
    setLicenseExpiry('');
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-[#121C2C]">Add Employee</h3>
              <p className="text-[12px] text-[#474554]">
                Register staff member and assign operational role
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
          {/* Full Name */}
          <div>
            <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
              Full Name <span className="text-[#F93C65]">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Kasun Bandara"
              required
              className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* NIC */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                NIC Number <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="text"
                value={nicNumber}
                onChange={(e) => setNicNumber(e.target.value)}
                placeholder="e.g. 199416003322"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Phone <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 077-1234567"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>
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
              placeholder="e.g. k.bandara@kandypack.lk"
              className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Employee Type */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Employee Type <span className="text-[#F93C65]">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as EmployeeRole)}
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Home Store */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Home Store
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              >
                <option value="">Central HQ / Unassigned</option>
                {MOCK_STORES.map((s) => (
                  <option key={s.store_id} value={String(s.store_id)}>
                    {s.store_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Conditional Driver License Fields */}
          {role === 'driver' && (
            <div className="p-4 bg-[#F0F3FF]/70 border border-[#4132C7]/20 rounded-xl space-y-3 animate-in fade-in duration-150">
              <p className="text-[12px] font-bold text-[#4132C7] uppercase tracking-wider">
                Driver License Specification
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#121C2C] mb-1">
                    License Number <span className="text-[#F93C65]">*</span>
                  </label>
                  <input
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="e.g. B-8839201"
                    required
                    className="w-full h-10 px-3 bg-white border border-[#C8C4D7]/50 rounded-lg text-[12px] text-[#121C2C] focus:outline-none focus:border-[#4132C7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#121C2C] mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={licenseExpiry}
                    onChange={(e) => setLicenseExpiry(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#C8C4D7]/50 rounded-lg text-[12px] text-[#121C2C] focus:outline-none focus:border-[#4132C7]"
                  />
                </div>
              </div>
            </div>
          )}

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
              + Add Employee
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
