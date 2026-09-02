'use client';

/**
 * @file page.tsx
 * @description Static frontend shell for the /admin/audit-log route (Member 4, Phase 0).
 *
 * Structure and Data Flow:
 * 1. Manages client-side filter state (table_name, user, date range) and pagination state.
 * 2. Filters static mock audit logs dynamically to provide interactive testing without backend calls.
 * 3. Renders the AuditLogFilterBar, AuditLogTable (with expandable row diffs), and AuditLogPagination.
 * 4. Strictly adheres to DESIGN.md and Docs/07_content-copy.md copy/layout specifications.
 */

import React, { useState, useMemo } from 'react';
import { AuditLogShell } from './components/AuditLogShell';
import { AuditLogFilterBar } from './components/AuditLogFilterBar';
import { AuditLogTable } from './components/AuditLogTable';
import { AuditLogPagination } from './components/AuditLogPagination';
import { MOCK_AUDIT_LOGS } from './mockData';
import { AuditLogFilters, PaginationState } from './types';

const INITIAL_FILTERS: AuditLogFilters = {
  tableName: '',
  user: '',
  dateFrom: '',
  dateTo: '',
};

const PAGE_SIZE = 6;

/**
 * AuditLogPage Component
 *
 * Main page component for the /admin/audit-log route.
 */
export default function AuditLogPage(): React.JSX.Element {
  // Client-side filter state
  const [filters, setFilters] = useState<AuditLogFilters>(INITIAL_FILTERS);

  // Pagination state tracking current page
  const [currentPage, setCurrentPage] = useState<number>(1);

  /**
   * Filters the mock audit log records based on current user selections.
   * Runs client-side for zero backend network traffic during Phase 0.
   */
  const filteredItems = useMemo(() => {
    return MOCK_AUDIT_LOGS.filter((item) => {
      // 1. Filter by Table
      if (filters.tableName && item.table_name.toLowerCase() !== filters.tableName.toLowerCase()) {
        return false;
      }

      // 2. Filter by User
      if (filters.user && item.user_name.toLowerCase() !== filters.user.toLowerCase()) {
        return false;
      }

      // 3. Filter by Date From (ISO date prefix comparison YYYY-MM-DD)
      if (filters.dateFrom) {
        const itemDate = item.changed_at.slice(0, 10);
        if (itemDate < filters.dateFrom) {
          return false;
        }
      }

      // 4. Filter by Date To (ISO date prefix comparison YYYY-MM-DD)
      if (filters.dateTo) {
        const itemDate = item.changed_at.slice(0, 10);
        if (itemDate > filters.dateTo) {
          return false;
        }
      }

      return true;
    });
  }, [filters]);

  /**
   * Derives the slice of items to display on the current active page.
   */
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  /**
   * Updates filter state and resets pagination to page 1 for consistent view.
   *
   * @param newFilters The updated filter parameters
   */
  const handleFilterChange = (newFilters: AuditLogFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  /**
   * Resets all filter values back to initial empty state.
   */
  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setCurrentPage(1);
  };

  /**
   * Handles user-driven page navigation.
   *
   * @param newPage Target page index
   */
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const paginationState: PaginationState = {
    currentPage,
    pageSize: PAGE_SIZE,
    totalCount: filteredItems.length,
  };

  return (
    <AuditLogShell>
      {/* Page Header Area */}
      <div className="mb-6">
        <h1 className="text-[28px] lg:text-[32px] font-bold text-[#121C2C] tracking-tight mb-1">
          Audit Log
        </h1>
        <p className="text-[15px] text-[#474554]">
          Full history of data changes across the system
        </p>
      </div>

      {/* Interactive Filter Bar */}
      <AuditLogFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
      />

      {/* Main Audit Log Table Card */}
      <div className="space-y-0">
        <AuditLogTable items={paginatedItems} />

        {/* Pagination Bar (attached to table when records exist) */}
        <AuditLogPagination
          pagination={paginationState}
          onPageChange={handlePageChange}
        />
      </div>
    </AuditLogShell>
  );
}
