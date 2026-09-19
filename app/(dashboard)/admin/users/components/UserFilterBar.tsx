'use client';

/**
 * @file UserFilterBar.tsx
 * @description Search and filter toolbar for user accounts management.
 * Provides live search by name/email, role filtering dropdown, status dropdown,
 * and clear filter controls adhering to DESIGN.md form styles.
 */

import React from 'react';
import { UserFilterState, AppRole } from '../types';

interface UserFilterBarProps {
  /** Current filter criteria state */
  filters: UserFilterState;
  /** Callback fired when any filter value changes */
  onFilterChange: (newFilters: UserFilterState) => void;
  /** Total matching results count */
  totalResults: number;
}

/**
 * UserFilterBar Component
 *
 * Renders the filter controls for searching and scoping user accounts.
 *
 * @param props Component properties containing current filter state and update callback
 * @returns Filter bar element
 */
export const UserFilterBar: React.FC<UserFilterBarProps> = ({
  filters,
  onFilterChange,
  totalResults,
}) => {
  // Check if non-default filters are active
  const isFilterActive =
    filters.searchQuery.trim() !== '' ||
    filters.roleFilter !== 'ALL' ||
    filters.statusFilter !== 'ALL';

  /**
   * Resets all search and select filters to default state.
   */
  const handleClearFilters = () => {
    onFilterChange({
      searchQuery: '',
      roleFilter: 'ALL',
      statusFilter: 'ALL',
    });
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#C8C4D7]/40 shadow-xs space-y-3 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[240px]">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-[#777586]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) =>
            onFilterChange({
              ...filters,
              searchQuery: e.target.value,
            })
          }
          placeholder="Search by name, email, department..."
          className="w-full h-10 pl-10 pr-4 text-[13px] bg-[#F5F5FA] border border-[#C8C4D7]/40 rounded-xl focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] transition-all text-[#121C2C] placeholder-[#777586]"
        />
        {filters.searchQuery && (
          <button
            onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#777586] hover:text-[#121C2C]"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown Filters & Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Role Filter */}
        <div className="relative min-w-[160px]">
          <select
            value={filters.roleFilter}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                roleFilter: e.target.value as 'ALL' | AppRole,
              })
            }
            className="w-full h-10 pl-3 pr-8 text-[13px] bg-[#F5F5FA] border border-[#C8C4D7]/40 rounded-xl font-medium text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] appearance-none cursor-pointer"
          >
            <option value="ALL">All Roles</option>
            <option value="system_administrator">System Administrator</option>
            <option value="logistics_manager">Logistics Manager</option>
            <option value="store_manager">Store Manager</option>
            <option value="fleet_supervisor">Fleet Supervisor</option>
            <option value="order_entry_clerk">Order Entry Clerk</option>
          </select>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-[#777586]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>

        {/* Status Filter */}
        <div className="relative min-w-[130px]">
          <select
            value={filters.statusFilter}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                statusFilter: e.target.value as 'ALL' | 'ACTIVE' | 'DEACTIVATED',
              })
            }
            className="w-full h-10 pl-3 pr-8 text-[13px] bg-[#F5F5FA] border border-[#C8C4D7]/40 rounded-xl font-medium text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] appearance-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-[#777586]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>

        {/* Clear Filters Button */}
        {isFilterActive && (
          <button
            onClick={handleClearFilters}
            className="h-10 px-3.5 text-[13px] font-semibold text-[#4132C7] bg-[#EDE9FE] hover:bg-[#DDD6FE] rounded-xl transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Clear</span>
          </button>
        )}

        {/* Result Counter Pill */}
        <div className="hidden lg:flex items-center text-[12px] font-semibold text-[#474554] bg-[#F5F5FA] px-3 py-2 rounded-xl border border-[#C8C4D7]/30">
          {totalResults} {totalResults === 1 ? 'user' : 'users'}
        </div>
      </div>
    </div>
  );
};
