'use client';

/**
 * @file AuditLogFilterBar.tsx
 * @description Filter bar component for the Audit Log module.
 * Provides controls for filtering audit records by database table, user, and date range.
 * Adheres to Docs/07_content-copy.md §/admin/audit-log and Docs/11_ui-rules.md §4.
 */

import React from 'react';
import { AuditLogFilters } from '../types';
import { AVAILABLE_TABLES, AVAILABLE_USERS } from '../mockData';

interface AuditLogFilterBarProps {
  /** Current active filter values */
  filters: AuditLogFilters;
  /** Callback triggered when any filter property changes */
  onFilterChange: (newFilters: AuditLogFilters) => void;
  /** Callback triggered to reset all filters to default values */
  onResetFilters: () => void;
}

/**
 * AuditLogFilterBar Component
 *
 * Renders the filter card container with persistent field labels and accessible inputs.
 */
export const AuditLogFilterBar: React.FC<AuditLogFilterBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
}) => {
  /**
   * Handles table dropdown selection changes.
   * @param e Change event from HTML select element
   */
  const handleTableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, tableName: e.target.value });
  };

  /**
   * Handles user dropdown selection changes.
   * @param e Change event from HTML select element
   */
  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, user: e.target.value });
  };

  /**
   * Handles "from date" input changes.
   * @param e Change event from HTML date input
   */
  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, dateFrom: e.target.value });
  };

  /**
   * Handles "to date" input changes.
   * @param e Change event from HTML date input
   */
  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, dateTo: e.target.value });
  };

  const hasActiveFilters = Boolean(
    filters.tableName || filters.user || filters.dateFrom || filters.dateTo
  );

  return (
    <div className="bg-white rounded-2xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] p-6 mb-6">
      <div className="flex flex-wrap items-end gap-4">
        {/* Table Selector */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label
            htmlFor="audit-filter-table"
            className="text-[12px] font-semibold text-[#474554] tracking-wide"
          >
            Table
          </label>
          <div className="relative">
            <select
              id="audit-filter-table"
              value={filters.tableName}
              onChange={handleTableChange}
              className="w-full appearance-none bg-[#F9F9FF] border border-[#C8C4D7] rounded-lg px-4 py-2.5 text-[14px] text-[#121C2C] focus:outline-none focus:border-[#5A4FE0] focus:ring-1 focus:ring-[#5A4FE0] transition-colors"
            >
              {AVAILABLE_TABLES.map((table) => (
                <option key={table.value} value={table.value}>
                  {table.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#777586]">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>

        {/* User Selector */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label
            htmlFor="audit-filter-user"
            className="text-[12px] font-semibold text-[#474554] tracking-wide"
          >
            User
          </label>
          <div className="relative">
            <select
              id="audit-filter-user"
              value={filters.user}
              onChange={handleUserChange}
              className="w-full appearance-none bg-[#F9F9FF] border border-[#C8C4D7] rounded-lg px-4 py-2.5 text-[14px] text-[#121C2C] focus:outline-none focus:border-[#5A4FE0] focus:ring-1 focus:ring-[#5A4FE0] transition-colors"
            >
              {AVAILABLE_USERS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#777586]">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Date Range Inputs */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[280px]">
          <label className="text-[12px] font-semibold text-[#474554] tracking-wide">
            Date range
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              value={filters.dateFrom}
              onChange={handleDateFromChange}
              className="flex-1 bg-[#F9F9FF] border border-[#C8C4D7] rounded-lg px-3 py-2.5 text-[14px] text-[#121C2C] focus:outline-none focus:border-[#5A4FE0] focus:ring-1 focus:ring-[#5A4FE0] transition-colors"
            />
            <span className="text-[#777586] font-medium">–</span>
            <input
              type="date"
              aria-label="To date"
              value={filters.dateTo}
              onChange={handleDateToChange}
              className="flex-1 bg-[#F9F9FF] border border-[#C8C4D7] rounded-lg px-3 py-2.5 text-[14px] text-[#121C2C] focus:outline-none focus:border-[#5A4FE0] focus:ring-1 focus:ring-[#5A4FE0] transition-colors"
            />
          </div>
        </div>

        {/* Filter / Reset Actions */}
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="h-[44px] px-4 rounded-full text-[14px] font-medium text-[#777586] hover:text-[#121C2C] hover:bg-[#F0F3FF] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear
            </button>
          )}

          <button
            type="button"
            className="h-[44px] px-6 rounded-full text-[14px] font-semibold bg-[#F0F3FF] text-[#4132C7] hover:bg-[#DEE8FF] transition-all duration-150 flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filter
          </button>
        </div>
      </div>
    </div>
  );
};
