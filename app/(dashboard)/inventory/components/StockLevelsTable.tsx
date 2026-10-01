'use client';

/**
 * @file StockLevelsTable.tsx
 * @description Renders the Stock Levels data table card matching UI/store_inventory/screen.png and DESIGN.md.
 * Features a 4-column layout (Product, SKU, Qty on Hand with low stock / critical badges, Last Updated),
 * tinted header, responsive scroll, loading skeletons, API error display, and pagination controls.
 * 
 * Adheres to:
 * - Docs/05_api-and-pages.md §B (/inventory)
 * - Docs/07_content-copy.md §/inventory
 * - Docs/11_ui-rules.md §6
 * - DESIGN.md table styling and status token colors
 */

import React from 'react';
import { StockItem, PaginationState } from '../types';

/**
 * Props accepted by the StockLevelsTable component.
 */
interface StockLevelsTableProps {
  /** Array of stock items to display on the current page */
  items: StockItem[];
  /** Full count of stock items matching current filters */
  totalCount: number;
  /** Active pagination descriptor */
  pagination: PaginationState;
  /** Callback fired when page index changes */
  onPageChange: (newPage: number) => void;
  /** Callback to open Receive Goods modal */
  onOpenReceiveModal: () => void;
  /** Whether inventory data is currently being fetched */
  isLoading?: boolean;
  /** Error message string if inventory API request failed */
  error?: string | null;
  /** Retry callback if fetching failed */
  onRetry?: () => void;
  /** Whether the active user role is authorized to receive goods */
  canReceiveGoods?: boolean;
  /** Active search query string */
  searchQuery?: string;
  /** Callback to clear search filter */
  onClearSearch?: () => void;
}

/**
 * Formats an ISO timestamp or date string into a clean, human-readable format.
 *
 * @param dateStr - Raw timestamp string from database/API
 * @returns Formatted date string (e.g., '2026-08-30 14:15')
 */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

/**
 * StockLevelsTable Component
 *
 * Renders the active store stock inventory ledger with health status badges and pagination.
 *
 * @param props - Component properties conforming to StockLevelsTableProps
 * @returns JSX element
 */
export const StockLevelsTable: React.FC<StockLevelsTableProps> = ({
  items,
  totalCount,
  pagination,
  onPageChange,
  onOpenReceiveModal,
  isLoading = false,
  error = null,
  onRetry,
  canReceiveGoods = true,
  searchQuery = '',
  onClearSearch,
}) => {
  const { currentPage, pageSize } = pagination;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  /**
   * Renders Qty on Hand value or semantic pill badge matching DESIGN.md §2.
   *
   * @param item - StockItem record
   * @returns JSX element with formatted number or status badge
   */
  const renderQuantity = (item: StockItem) => {
    const formatted = item.quantity_on_hand.toLocaleString();

    if (item.status === 'critical') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF0F0] text-[#93000A] text-[12px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#BA1A1A]" />
          {formatted} Critical
        </span>
      );
    }

    if (item.status === 'low_stock') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF9E6] text-[#B87C00] text-[12px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800]" />
          {formatted} Low Stock
        </span>
      );
    }

    return <span className="text-[#121C2C] font-normal">{formatted}</span>;
  };

  return (
    <div className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] overflow-hidden border border-[#C8C4D7]/30">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#D9E3F9] bg-[#E7EEFF]/30">
              <th className="py-4 px-6 text-[12px] font-semibold text-[#474554] uppercase tracking-wider">
                Product
              </th>
              <th className="py-4 px-6 text-[12px] font-semibold text-[#474554] uppercase tracking-wider">
                SKU
              </th>
              <th className="py-4 px-6 text-[12px] font-semibold text-[#474554] uppercase tracking-wider text-right">
                Qty on Hand
              </th>
              <th className="py-4 px-6 text-[12px] font-semibold text-[#474554] uppercase tracking-wider text-right">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody className="text-[14px] text-[#121C2C]">
            {isLoading ? (
              /* Loading Skeleton Rows */
              Array.from({ length: pageSize }).map((_, index) => (
                <tr key={`loading-skeleton-${index}`} className="border-b border-[#D9E3F9]/40 animate-pulse">
                  <td className="py-4 px-6">
                    <div className="h-4 bg-[#E7EEFF] rounded w-44" />
                  </td>
                  <td className="py-4 px-6">
                    <div className="h-4 bg-[#E7EEFF] rounded w-24" />
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="h-4 bg-[#E7EEFF] rounded w-16 ml-auto" />
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="h-4 bg-[#E7EEFF] rounded w-28 ml-auto" />
                  </td>
                </tr>
              ))
            ) : error ? (
              /* Error State Row */
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center max-w-md mx-auto px-4">
                    <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#F93C65] flex items-center justify-center mb-3">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-[15px] font-semibold text-[#121C2C] mb-1">
                      Unable to load inventory data
                    </p>
                    <p className="text-[13px] text-[#474554] mb-4">
                      {error}
                    </p>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="px-5 py-2 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#3928C0] transition-colors cursor-pointer"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : items.length > 0 ? (
              /* Normal Data Rows */
              items.map((item) => (
                <tr
                  key={item.product_id}
                  className="border-b border-[#D9E3F9]/60 hover:bg-[#F0F3FF]/50 transition-colors"
                >
                  <td className="py-4 px-6 font-medium text-[#121C2C]">
                    {item.product_name}
                  </td>
                  <td className="py-4 px-6">
                    <span className="font-mono text-[12px] text-[#474554] bg-[#F5F5FA] px-2 py-0.5 rounded border border-[#C8C4D7]/40">
                      {item.sku}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    {renderQuantity(item)}
                  </td>
                  <td className="py-4 px-6 text-right text-[#474554] whitespace-nowrap">
                    {formatDisplayDate(item.updated_at)}
                  </td>
                </tr>
              ))
            ) : (
              /* Empty State Row */
              <tr>
                <td colSpan={4} className="py-12 text-center text-[#474554]">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div className="w-12 h-12 rounded-full bg-[#F0F3FF] text-[#4132C7] flex items-center justify-center mb-3">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-[15px] font-medium text-[#121C2C] mb-1">
                      {searchQuery ? 'No products match your search' : 'No inventory records for this store yet.'}
                    </p>
                    <p className="text-[13px] text-[#474554] mb-4">
                      {searchQuery
                        ? `No items match "${searchQuery}". Clear your search term to see all store stock.`
                        : 'No stock items are currently registered for this store.'}
                    </p>
                    {searchQuery && onClearSearch ? (
                      <button
                        onClick={onClearSearch}
                        className="px-5 py-2 rounded-full bg-[#DEE8FF] text-[#4132C7] text-[13px] font-semibold hover:bg-[#4132C7] hover:text-white transition-colors cursor-pointer"
                      >
                        Clear Search
                      </button>
                    ) : canReceiveGoods ? (
                      <button
                        onClick={onOpenReceiveModal}
                        className="px-5 py-2 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#3928C0] transition-colors cursor-pointer"
                      >
                        Receive Goods
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer matching screen.png */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-[#D9E3F9] bg-[#E7EEFF]/10">
        <span className="text-[14px] text-[#474554]">
          Showing {startIndex} to {endIndex} of {totalCount} entries
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            className="p-1 rounded-md text-[#474554] hover:bg-[#F0F3FF] disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[13px] font-medium text-[#121C2C] px-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="p-1 rounded-md text-[#121C2C] hover:bg-[#F0F3FF] disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

