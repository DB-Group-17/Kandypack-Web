'use client';

/**
 * @file StockLevelsTable.tsx
 * @description Renders the Stock Levels data table card matching UI/store_inventory/screen.png and code.html.
 * Features the 4-column layout (Product, SKU, Qty on Hand with low stock / critical badges, Last Updated),
 * tinted header, soft shadows, and chevron pagination.
 */

import React from 'react';
import { StockItem, PaginationState } from '../types';

interface StockLevelsTableProps {
  /** Array of stock items to display on the current page */
  items: StockItem[];
  /** Full count of stock items */
  totalCount: number;
  /** Pagination state */
  pagination: PaginationState;
  /** Callback fired when page index changes */
  onPageChange: (newPage: number) => void;
  /** Callback to open Receive Goods modal */
  onOpenReceiveModal: () => void;
}

/**
 * StockLevelsTable Component
 *
 * Direct implementation of UI/store_inventory/screen.png stock levels table.
 */
export const StockLevelsTable: React.FC<StockLevelsTableProps> = ({
  items,
  totalCount,
  pagination,
  onPageChange,
  onOpenReceiveModal,
}) => {
  const { currentPage, pageSize } = pagination;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  /**
   * Renders Qty on Hand value or pill badge matching screen.png.
   *
   * @param item StockItem record
   */
  const renderQuantity = (item: StockItem) => {
    const formatted = item.quantity_on_hand.toLocaleString();

    if (item.status === 'critical') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ffdad6] text-[#93000a] text-[12px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]" />
          {formatted} Critical
        </span>
      );
    }

    if (item.status === 'low_stock') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ffdad6] text-[#93000a] text-[12px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]" />
          {formatted} Low Stock
        </span>
      );
    }

    return <span className="text-[#121c2c] font-normal">{formatted}</span>;
  };

  return (
    <div className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] overflow-hidden border border-[#c8c4d7]/30">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#d9e3f9] bg-[#e7eeff]/30">
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
          <tbody className="text-[14px] text-[#121c2c]">
            {items.length > 0 ? (
              items.map((item) => (
                <tr
                  key={item.product_id}
                  className="border-b border-[#d9e3f9]/60 hover:bg-[#f0f3ff]/50 transition-colors"
                >
                  <td className="py-4 px-6 font-medium text-[#121c2c]">
                    {item.product_name}
                  </td>
                  <td className="py-4 px-6 text-[#474554]">
                    {item.sku}
                  </td>
                  <td className="py-4 px-6 text-right">
                    {renderQuantity(item)}
                  </td>
                  <td className="py-4 px-6 text-right text-[#474554]">
                    {item.updated_at}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-12 text-center text-[#474554]">
                  <div className="flex flex-col items-center justify-center">
                    <p className="text-[15px] font-medium text-[#121c2c] mb-1">
                      No inventory records found
                    </p>
                    <p className="text-[13px] text-[#474554] mb-4">
                      No stock items are currently registered for this store.
                    </p>
                    <button
                      onClick={onOpenReceiveModal}
                      className="px-5 py-2 rounded-full bg-[#4132c7] text-white text-[13px] font-semibold hover:bg-[#3928c0] transition-colors"
                    >
                      Receive Goods
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer matching screen.png */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-[#d9e3f9] bg-[#e7eeff]/10">
        <span className="text-[14px] text-[#474554]">
          Showing {startIndex} to {endIndex} of {totalCount} entries
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded-md text-[#474554] hover:bg-[#f0f3ff] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            aria-label="Previous page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded-md text-[#121c2c] hover:bg-[#f0f3ff] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
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
