'use client';

/**
 * @file AuditLogPagination.tsx
 * @description Pagination control bar for navigating through paginated audit log results.
 * Follows layout and copy rules in Docs/07_content-copy.md §/admin/audit-log and UI/audit_log reference.
 */

import React from 'react';
import { PaginationState } from '../types';

interface AuditLogPaginationProps {
  /** Current pagination state metrics */
  pagination: PaginationState;
  /** Callback triggered when page is changed */
  onPageChange: (newPage: number) => void;
}

/**
 * AuditLogPagination Component
 *
 * Renders page summary string ("Showing X–Y of Z records") and previous/next navigation buttons.
 */
export const AuditLogPagination: React.FC<AuditLogPaginationProps> = ({
  pagination,
  onPageChange,
}) => {
  const { currentPage, pageSize, totalCount } = pagination;

  if (totalCount === 0) return null;

  const totalPages = Math.ceil(totalCount / pageSize);
  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className="bg-[#F0F3FF] px-6 py-4 rounded-b-2xl border-t border-[#DEE8FF] flex flex-col sm:flex-row items-center justify-between gap-4 mt-[-1px]">
      <p className="text-[14px] text-[#474554]">
        Showing <span className="font-medium text-[#121C2C]">{startRecord}</span>–
        <span className="font-medium text-[#121C2C]">{endRecord}</span> of{' '}
        <span className="font-medium text-[#121C2C]">{totalCount.toLocaleString()}</span> records
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canGoPrevious}
          onClick={() => onPageChange(currentPage - 1)}
          className="px-4 py-2 rounded-full text-[13px] font-semibold text-[#474554] hover:text-[#121C2C] hover:bg-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border border-transparent hover:border-[#C8C4D7]"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(currentPage + 1)}
          className="px-4 py-2 rounded-full text-[13px] font-semibold text-[#474554] hover:text-[#121C2C] hover:bg-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border border-transparent hover:border-[#C8C4D7]"
        >
          Next
        </button>
      </div>
    </div>
  );
};
