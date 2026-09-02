'use client';

/**
 * @file MasterDataPagination.tsx
 * @description Pagination control bar for Master Data tables.
 * Displays result range counts, previous/next chevron buttons, and active page numbers.
 * Conforms to DESIGN.md and UI/master_data/code.html §565.
 */

import React from 'react';
import { PaginationState } from '../types';

interface MasterDataPaginationProps {
  /** Current pagination state */
  pagination: PaginationState;
  /** Callback triggered when user changes active page */
  onPageChange: (page: number) => void;
}

/**
 * MasterDataPagination Component
 */
export const MasterDataPagination: React.FC<MasterDataPaginationProps> = ({
  pagination,
  onPageChange,
}) => {
  const { currentPage, pageSize, totalCount } = pagination;

  // Calculate page bounds
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalCount, currentPage * pageSize);

  // Generate page numbers array
  const pageNumbers: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="p-4 border-t border-[#C8C4D7]/20 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white text-[13px] text-[#474554] rounded-b-2xl">
      {/* Result Range Information */}
      <p>
        Showing <span className="font-semibold text-[#121C2C]">{startItem}</span> to{' '}
        <span className="font-semibold text-[#121C2C]">{endItem}</span> of{' '}
        <span className="font-semibold text-[#121C2C]">{totalCount.toLocaleString()}</span> results
      </p>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-1">
        {/* Previous Page Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#474554] hover:bg-[#F5F5FA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Page Numbers */}
        {pageNumbers.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 rounded-lg font-medium text-[13px] flex items-center justify-center transition-colors ${
              page === currentPage
                ? 'bg-[#EBE9FE] text-[#4132C7] font-bold shadow-xs'
                : 'text-[#474554] hover:bg-[#F5F5FA]'
            }`}
          >
            {page}
          </button>
        ))}

        {/* Next Page Button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#474554] hover:bg-[#F5F5FA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
