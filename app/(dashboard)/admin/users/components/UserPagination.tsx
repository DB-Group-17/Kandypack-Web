'use client';

/**
 * @file UserPagination.tsx
 * @description Clean pagination footer for User Accounts management.
 * Shows record range and numbered page selection buttons.
 */

import React from 'react';
import { PaginationState } from '../types';

interface UserPaginationProps {
  /** Pagination state containing currentPage, pageSize, and totalItems */
  pagination: PaginationState;
  /** Callback triggered when the page number changes */
  onPageChange: (page: number) => void;
}

/**
 * UserPagination Component
 *
 * Renders the pagination footer with previous/next controls and numbered page buttons.
 *
 * @param props Component properties containing pagination state and change handler
 * @returns Pagination footer element
 */
export const UserPagination: React.FC<UserPaginationProps> = ({
  pagination,
  onPageChange,
}) => {
  const { currentPage, pageSize, totalItems } = pagination;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Compute 1-indexed item start and end bounds
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // If there's only 1 page and no items or few items, keep it compact
  if (totalItems <= pageSize && currentPage === 1) {
    return (
      <div className="flex items-center justify-between px-2 py-3 text-[13px] text-[#474554]">
        <p>
          Showing <span className="font-semibold text-[#121C2C]">{startItem}</span> to{' '}
          <span className="font-semibold text-[#121C2C]">{endItem}</span> of{' '}
          <span className="font-semibold text-[#121C2C]">{totalItems}</span> users
        </p>
      </div>
    );
  }

  // Generate visible page numbers
  const pageNumbers: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-2 py-3 text-[13px] text-[#474554]">
      {/* Range text */}
      <p>
        Showing <span className="font-semibold text-[#121C2C]">{startItem}</span> to{' '}
        <span className="font-semibold text-[#121C2C]">{endItem}</span> of{' '}
        <span className="font-semibold text-[#121C2C]">{totalItems}</span> users
      </p>

      {/* Pagination controls */}
      <div className="flex items-center gap-1.5 self-end sm:self-auto">
        {/* Previous page button */}
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#C8C4D7]/50 text-[#474554] hover:bg-[#EDE9FE] hover:text-[#4132C7] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#474554] transition-colors"
          aria-label="Previous page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Page numbers */}
        {pageNumbers.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-[13px] font-semibold transition-all ${
              page === currentPage
                ? 'bg-[#5A4FE0] text-white shadow-xs'
                : 'border border-[#C8C4D7]/50 text-[#474554] hover:bg-[#EDE9FE] hover:text-[#4132C7]'
            }`}
          >
            {page}
          </button>
        ))}

        {/* Next page button */}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#C8C4D7]/50 text-[#474554] hover:bg-[#EDE9FE] hover:text-[#4132C7] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#474554] transition-colors"
          aria-label="Next page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
