'use client';

/**
 * @file EmployeesTab.tsx
 * @description Tabular view of Personnel & Staff for the Master Data module.
 * Columns: Name, NIC Number, Contact (Phone/Email), Role/Type, Home Store, Status, and Actions.
 * Conforms to Docs/07_content-copy.md §387 and UI/master_data/code.html.
 */

import React from 'react';
import { EmployeeItem } from '../types';

interface EmployeesTabProps {
  /** Array of employees to display */
  items: EmployeeItem[];
  /** Callback to trigger opening the Add Employee modal */
  onAddClick: () => void;
  /** Optional callback to edit an employee */
  onEditClick?: (item: EmployeeItem) => void;
}

/**
 * Derives initials from a full name for avatar badges.
 *
 * @param name Employee full name
 * @returns 2-letter uppercase initials string
 */
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Resolves color styling for role badges.
 *
 * @param role The employee type identifier
 * @returns CSS class strings for badge container
 */
const getRoleBadgeClasses = (role: EmployeeItem['employee_type']): string => {
  switch (role) {
    case 'system_administrator':
      return 'bg-[#FFF0F0] text-[#F93C65]';
    case 'logistics_manager':
      return 'bg-[#EBE9FE] text-[#4132C7]';
    case 'store_manager':
      return 'bg-[#E0F2FF] text-[#0047CC]';
    case 'driver':
      return 'bg-[#E6F6F4] text-[#00B69B]';
    case 'assistant':
      return 'bg-[#FFF9E6] text-[#B8860B]';
    default:
      return 'bg-[#F1F1F5] text-[#474554]';
  }
};

/**
 * EmployeesTab Component
 */
export const EmployeesTab: React.FC<EmployeesTabProps> = ({
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <h3 className="text-[16px] font-semibold text-[#121C2C] mb-1">
          No records yet.
        </h3>
        <p className="text-[13px] text-[#474554] max-w-sm mx-auto mb-5">
          No employee records match your search query or have been registered in the system.
        </p>
        <button
          onClick={onAddClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#3527a8] transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Employee</span>
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#F8F9FC] border-b border-[#C8C4D7]/30 text-[11px] font-bold text-[#474554] tracking-wider uppercase">
            <th className="py-3.5 px-5">Employee Name</th>
            <th className="py-3.5 px-5">NIC</th>
            <th className="py-3.5 px-5">Contact</th>
            <th className="py-3.5 px-5">Role / Type</th>
            <th className="py-3.5 px-5">Home Store</th>
            <th className="py-3.5 px-5 text-center">Status</th>
            <th className="py-3.5 px-5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#C8C4D7]/20 text-[13px] text-[#121C2C]">
          {items.map((emp) => (
            <tr
              key={emp.employee_id}
              className="hover:bg-[#F9F9FF] transition-colors group"
            >
              {/* Name with Initials Avatar */}
              <td className="py-4 px-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#DEE8FF] text-[#4132C7] font-bold text-[12px] flex items-center justify-center shrink-0 shadow-xs">
                    {getInitials(emp.full_name)}
                  </div>
                  <div>
                    <p className="font-semibold text-[#121C2C]">{emp.full_name}</p>
                    <p className="text-[11px] font-mono text-[#777586]">
                      EMP-{String(emp.employee_id).padStart(3, '0')}
                    </p>
                  </div>
                </div>
              </td>

              {/* NIC */}
              <td className="py-4 px-5 font-mono text-[12px] text-[#474554]">
                {emp.nic_number}
              </td>

              {/* Contact */}
              <td className="py-4 px-5">
                <p className="text-[#121C2C] font-medium">{emp.phone}</p>
                {emp.email && (
                  <p className="text-[11px] text-[#474554]">{emp.email}</p>
                )}
              </td>

              {/* Role */}
              <td className="py-4 px-5">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getRoleBadgeClasses(
                    emp.employee_type
                  )}`}
                >
                  {emp.employee_type_label}
                </span>
                {emp.license_number && (
                  <p className="text-[11px] font-mono text-[#777586] mt-0.5">
                    Lic: {emp.license_number}
                  </p>
                )}
              </td>

              {/* Home Store */}
              <td className="py-4 px-5 text-[#474554]">
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#F1F1F5] text-[12px] font-medium text-[#121C2C]">
                  {emp.home_store_name || 'Central HQ'}
                </span>
              </td>

              {/* Status */}
              <td className="py-4 px-5 text-center">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    emp.status === 'Active'
                      ? 'bg-[#E6F6F4] text-[#00B69B]'
                      : emp.status === 'On Leave'
                      ? 'bg-[#FFF9E6] text-[#FFB800]'
                      : 'bg-[#F1F1F5] text-[#474554]'
                  }`}
                >
                  {emp.status}
                </span>
              </td>

              {/* Actions */}
              <td className="py-4 px-5 text-right">
                <button
                  onClick={() => onEditClick?.(emp)}
                  className="p-1.5 rounded-lg text-[#777586] hover:text-[#4132C7] hover:bg-[#EBE9FE]/50 transition-colors"
                  title="Edit employee"
                  aria-label={`Edit ${emp.full_name}`}
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
