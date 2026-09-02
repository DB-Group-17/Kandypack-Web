'use client';

/**
 * @file CustomersTab.tsx
 * @description Tabular view of Retail & Wholesale Customer Accounts for the Master Data module.
 * Columns: Customer Name, Customer Type (Retail/Wholesale), Phone / Email, Registered City, Delivery Address, Status, and Actions.
 * Conforms to Docs/07_content-copy.md §391 and UI/master_data/code.html.
 */

import React from 'react';
import { CustomerItem } from '../types';

interface CustomersTabProps {
  /** Array of customers to display */
  items: CustomerItem[];
  /** Callback to trigger opening the Add Customer modal */
  onAddClick: () => void;
  /** Optional callback to edit a customer */
  onEditClick?: (item: CustomerItem) => void;
}

/**
 * CustomersTab Component
 */
export const CustomersTab: React.FC<CustomersTabProps> = ({
  items,
  onAddClick,
  onEditClick,
}) => {
  if (items.length === 0) {
    return (
      <div className="py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#EBE9FE] text-[#4132C7] mx-auto flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
        </div>
        <h3 className="text-[16px] font-semibold text-[#121C2C] mb-1">
          No records yet.
        </h3>
        <p className="text-[13px] text-[#474554] max-w-sm mx-auto mb-5">
          No customer accounts match your search filters or have been created in this store network.
        </p>
        <button
          onClick={onAddClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#3527a8] transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Customer</span>
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#F8F9FC] border-b border-[#C8C4D7]/30 text-[11px] font-bold text-[#474554] tracking-wider uppercase">
            <th className="py-3.5 px-5">Customer Name</th>
            <th className="py-3.5 px-5">Type</th>
            <th className="py-3.5 px-5">Contact</th>
            <th className="py-3.5 px-5">Registered City</th>
            <th className="py-3.5 px-5">Delivery Address</th>
            <th className="py-3.5 px-5 text-center">Status</th>
            <th className="py-3.5 px-5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#C8C4D7]/20 text-[13px] text-[#121C2C]">
          {items.map((cust) => (
            <tr
              key={cust.customer_id}
              className="hover:bg-[#F9F9FF] transition-colors group"
            >
              {/* Customer Name with Icon */}
              <td className="py-4 px-5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg ${
                      cust.customer_type === 'wholesale'
                        ? 'bg-[#EBE9FE] text-[#4132C7]'
                        : 'bg-[#E0F2FF] text-[#0047CC]'
                    } flex items-center justify-center shrink-0`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-[#121C2C]">{cust.customer_name}</p>
                    <p className="text-[11px] font-mono text-[#777586]">
                      CUS-{String(cust.customer_id).padStart(3, '0')}
                    </p>
                  </div>
                </div>
              </td>

              {/* Customer Type Badge */}
              <td className="py-4 px-5">
                {cust.customer_type === 'wholesale' ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBE9FE] text-[#4132C7]">
                    Wholesale
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E0F2FF] text-[#0047CC]">
                    Retail
                  </span>
                )}
              </td>

              {/* Contact */}
              <td className="py-4 px-5">
                <p className="text-[#121C2C] font-medium">{cust.phone}</p>
                {cust.email && (
                  <p className="text-[11px] text-[#474554]">{cust.email}</p>
                )}
              </td>

              {/* Registered City */}
              <td className="py-4 px-5">
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#F1F1F5] text-[12px] font-medium text-[#121C2C]">
                  {cust.registered_city_name}
                </span>
              </td>

              {/* Address */}
              <td className="py-4 px-5 text-[#474554] max-w-xs">
                <p className="line-clamp-2 text-[12px]">{cust.address_line}</p>
              </td>

              {/* Status */}
              <td className="py-4 px-5 text-center">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    cust.status === 'Active'
                      ? 'bg-[#E6F6F4] text-[#00B69B]'
                      : 'bg-[#F1F1F5] text-[#474554]'
                  }`}
                >
                  {cust.status}
                </span>
              </td>

              {/* Actions */}
              <td className="py-4 px-5 text-right">
                <button
                  onClick={() => onEditClick?.(cust)}
                  className="p-1.5 rounded-lg text-[#777586] hover:text-[#4132C7] hover:bg-[#EBE9FE]/50 transition-colors"
                  title="Edit customer"
                  aria-label={`Edit ${cust.customer_name}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
