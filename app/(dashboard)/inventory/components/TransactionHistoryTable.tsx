'use client';

/**
 * @file TransactionHistoryTable.tsx
 * @description Displays the historical ledger of inventory transactions (Receive, Dispatch, Adjustment)
 * for the selected store, including filters by transaction type, search, date range, and pagination.
 * Aligned with Docs/04_database-schema-v4.md and DESIGN.md.
 */

import React from 'react';
import { InventoryTransaction, TransactionFilters, PaginationState, TransactionType } from '../types';

interface TransactionHistoryTableProps {
  /** Array of inventory transactions to display */
  items: InventoryTransaction[];
  /** Total transaction count matching active filters */
  totalCount: number;
  /** Active filter state */
  filters: TransactionFilters;
  /** Callback fired when filters change */
  onFilterChange: (newFilters: TransactionFilters) => void;
  /** Pagination state */
  pagination: PaginationState;
  /** Callback fired when page index changes */
  onPageChange: (newPage: number) => void;
}

/**
 * TransactionHistoryTable Component
 *
 * Renders the full audit ledger of stock movements for the active store.
 */
export const TransactionHistoryTable: React.FC<TransactionHistoryTableProps> = ({
  items,
  totalCount,
  filters,
  onFilterChange,
  pagination,
  onPageChange,
}) => {
  const { currentPage, pageSize } = pagination;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  /**
   * Helper to format semantic transaction type badges according to DESIGN.md §2.
   *
   * @param type Transaction type ('receive' | 'dispatch' | 'adjustment')
   */
  const renderTypeBadge = (type: TransactionType) => {
    switch (type) {
      case 'receive':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E6F6F4] text-[#00B69B] text-[12px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00B69B]" />
            Receive
          </span>
        );
      case 'dispatch':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF9E6] text-[#B87C00] text-[12px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800]" />
            Dispatch
          </span>
        );
      case 'adjustment':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E0F2FF] text-[#0047CC] text-[12px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0047CC]" />
            Adjustment
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#C8C4D7]/40 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#777586]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search product, SKU, reference..."
            className="w-full pl-10 pr-4 py-2 bg-[#F9F9FF] rounded-lg border border-[#C8C4D7]/60 text-[14px] text-[#121C2C] placeholder-[#777586] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4132C7] focus:border-transparent transition-all"
          />
        </div>

        {/* Date Filter & Type Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Type Filter Buttons */}
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Types' },
                { id: 'receive', label: 'Receive' },
                { id: 'dispatch', label: 'Dispatch' },
                { id: 'adjustment', label: 'Adjustment' },
              ] as const
            ).map((tab) => {
              const isActive = filters.typeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onFilterChange({ ...filters, typeFilter: tab.id })}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all shrink-0 ${
                    isActive
                      ? 'bg-[#4132C7] text-white shadow-xs'
                      : 'bg-[#F0F3FF] text-[#474554] hover:bg-[#DEE8FF] hover:text-[#121C2C]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Date range pickers */}
          <div className="flex items-center gap-2 text-[13px] text-[#474554]">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onFilterChange({ ...filters, dateFrom: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg border border-[#C8C4D7]/60 bg-[#F9F9FF] text-[13px] text-[#121C2C] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4132C7]"
              title="From date"
            />
            <span>to</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onFilterChange({ ...filters, dateTo: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg border border-[#C8C4D7]/60 bg-[#F9F9FF] text-[13px] text-[#121C2C] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4132C7]"
              title="To date"
            />
          </div>
        </div>
      </div>

      {/* Transaction History Data Table */}
      <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E7EEFF] bg-[#F9F9FF]/80">
                <th className="py-4 px-6 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                  Product
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                  SKU
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                  Type
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-[#474554] uppercase tracking-wider text-right">
                  Quantity Change
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                  Reference
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-[#474554] uppercase tracking-wider">
                  Operator & Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7EEFF]">
              {items.length > 0 ? (
                items.map((txn) => {
                  const isPositive = txn.change_qty > 0;
                  return (
                    <tr
                      key={txn.transaction_id}
                      className="hover:bg-[#F0F3FF]/40 transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-4 px-6 text-[13px] text-[#474554] whitespace-nowrap">
                        {txn.created_at}
                      </td>

                      {/* Product Name */}
                      <td className="py-4 px-6 font-semibold text-[14px] text-[#121C2C]">
                        {txn.product_name}
                      </td>

                      {/* SKU */}
                      <td className="py-4 px-6">
                        <span className="font-mono text-[12px] text-[#474554] bg-[#F5F5FA] px-2 py-0.5 rounded border border-[#C8C4D7]/40">
                          {txn.sku}
                        </span>
                      </td>

                      {/* Type Badge */}
                      <td className="py-4 px-6">{renderTypeBadge(txn.transaction_type)}</td>

                      {/* Quantity Change */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <span
                          className={`font-bold text-[14px] ${
                            isPositive ? 'text-[#00B69B]' : 'text-[#F93C65]'
                          }`}
                        >
                          {isPositive ? `+${txn.change_qty.toLocaleString()}` : txn.change_qty.toLocaleString()}
                        </span>
                      </td>

                      {/* Reference Document */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className="font-mono text-[12px] font-semibold text-[#4132C7] bg-[#DEE8FF] px-2.5 py-1 rounded-md">
                          {txn.reference_code}
                        </span>
                      </td>

                      {/* Operator & Notes */}
                      <td className="py-4 px-6 text-[13px] text-[#474554]">
                        <div className="font-medium text-[#121C2C]">{txn.created_by_name}</div>
                        {txn.notes && (
                          <div className="text-[12px] text-[#777586] italic mt-0.5 line-clamp-1">
                            {txn.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                /* Empty Table State */
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-[#F0F3FF] flex items-center justify-center text-[#4132C7] mb-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-[16px] font-semibold text-[#121C2C] mb-1">
                        No transactions recorded yet
                      </h3>
                      <p className="text-[13px] text-[#474554] mb-4">
                        {filters.searchQuery || filters.typeFilter !== 'all' || filters.dateFrom || filters.dateTo
                          ? 'No transaction logs match your active filter criteria.'
                          : 'Transactions will appear here when goods are received or dispatched.'}
                      </p>
                      {(filters.searchQuery || filters.typeFilter !== 'all' || filters.dateFrom || filters.dateTo) && (
                        <button
                          onClick={() =>
                            onFilterChange({
                              searchQuery: '',
                              typeFilter: 'all',
                              dateFrom: '',
                              dateTo: '',
                            })
                          }
                          className="px-4 py-2 rounded-full bg-[#DEE8FF] text-[#4132C7] text-[13px] font-semibold hover:bg-[#4132C7] hover:text-white transition-colors"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 bg-[#F9F9FF]/80 border-t border-[#E7EEFF] flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[13px] text-[#474554]">
            Showing <strong className="font-semibold text-[#121C2C]">{startIndex}</strong> to{' '}
            <strong className="font-semibold text-[#121C2C]">{endIndex}</strong> of{' '}
            <strong className="font-semibold text-[#121C2C]">{totalCount}</strong> entries
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-[#C8C4D7]/50 text-[#474554] hover:bg-white hover:text-[#121C2C] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#474554] transition-colors"
              aria-label="Previous page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[13px] font-medium text-[#121C2C] px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-[#C8C4D7]/50 text-[#474554] hover:bg-white hover:text-[#121C2C] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#474554] transition-colors"
              aria-label="Next page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
