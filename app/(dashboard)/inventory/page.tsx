'use client';

/**
 * @file page.tsx
 * @description Static frontend shell for the Store Inventory route (/inventory).
 * Faithfully matches UI/store_inventory/screen.png and UI/store_inventory/code.html.
 *
 * Structure and Data Flow:
 * 1. Manages active store state (defaults to 'Kandy Central', selectable via dropdown).
 * 2. Manages tab state ('Stock Levels' active by default, 'Transaction History' secondary).
 * 3. Renders the store stock ledger table matching screen.png.
 * 4. Provides the interactive 'Receive Goods' modal and handles state transitions.
 * 5. Binds the top bar search seamlessly to filter rows.
 */

import React, { useState, useMemo } from 'react';
import { StockLevelsTable } from './components/StockLevelsTable';
import { TransactionHistoryTable } from './components/TransactionHistoryTable';
import { ReceiveGoodsModal } from './components/ReceiveGoodsModal';
import {
  MOCK_STORES,
  INITIAL_MOCK_STOCK,
  MOCK_ARRIVED_TRAIN_BOOKINGS,
  INITIAL_MOCK_TRANSACTIONS,
} from './mockData';
import {
  Store,
  StockItem,
  InventoryTransaction,
  PaginationState,
  ReceiveGoodsItemInput,
  TransactionFilters,
} from './types';

const INITIAL_TRANSACTION_FILTERS: TransactionFilters = {
  searchQuery: '',
  typeFilter: 'all',
  dateFrom: '',
  dateTo: '',
};

const PAGE_SIZE = 5;

/**
 * StoreInventoryPage Component
 */
export default function StoreInventoryPage(): React.JSX.Element {
  // Active store selection (default: 1 -> Kandy Central)
  const [selectedStoreId, setSelectedStoreId] = useState<number>(1);

  // Active tab selection
  const [activeTab, setActiveTab] = useState<'stock' | 'transactions'>('stock');

  // Search query from top header bar
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // In-memory stock items mapping
  const [stockMap, setStockMap] = useState<Record<number, StockItem[]>>(INITIAL_MOCK_STOCK);

  // In-memory transaction history list
  const [transactions, setTransactions] = useState<InventoryTransaction[]>(INITIAL_MOCK_TRANSACTIONS);

  // Transaction tab filters
  const [transactionFilters, setTransactionFilters] = useState<TransactionFilters>(
    INITIAL_TRANSACTION_FILTERS
  );

  // Pagination states
  const [stockPage, setStockPage] = useState<number>(1);
  const [transactionPage, setTransactionPage] = useState<number>(1);

  // Receive goods modal open state
  const [receiveModalOpen, setReceiveModalOpen] = useState<boolean>(false);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /**
   * Derives current active store object.
   */
  const currentStore: Store = useMemo(() => {
    return MOCK_STORES.find((s) => s.store_id === selectedStoreId) || MOCK_STORES[0];
  }, [selectedStoreId]);

  /**
   * Derives raw stock items for the active store.
   */
  const currentStoreStock: StockItem[] = useMemo(() => {
    return stockMap[selectedStoreId] || [];
  }, [stockMap, selectedStoreId]);

  /**
   * Filters stock items by global search query.
   */
  const filteredStockItems = useMemo(() => {
    if (!globalSearch.trim()) return currentStoreStock;
    const q = globalSearch.toLowerCase();
    return currentStoreStock.filter(
      (item) => item.product_name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
    );
  }, [currentStoreStock, globalSearch]);

  /**
   * Paginated slice of stock items.
   */
  const paginatedStockItems = useMemo(() => {
    const startIndex = (stockPage - 1) * PAGE_SIZE;
    return filteredStockItems.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredStockItems, stockPage]);

  /**
   * Filters transaction history records.
   */
  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      if (txn.store_id !== selectedStoreId) return false;

      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        const match =
          txn.product_name.toLowerCase().includes(q) ||
          txn.sku.toLowerCase().includes(q) ||
          txn.reference_code.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (transactionFilters.typeFilter !== 'all') {
        if (txn.transaction_type !== transactionFilters.typeFilter) return false;
      }

      if (transactionFilters.dateFrom && txn.created_at.slice(0, 10) < transactionFilters.dateFrom) {
        return false;
      }

      if (transactionFilters.dateTo && txn.created_at.slice(0, 10) > transactionFilters.dateTo) {
        return false;
      }

      return true;
    });
  }, [transactions, selectedStoreId, globalSearch, transactionFilters]);

  /**
   * Paginated slice of transactions.
   */
  const paginatedTransactions = useMemo(() => {
    const startIndex = (transactionPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredTransactions, transactionPage]);

  /**
   * Switches the active store.
   */
  const handleStoreChange = (storeId: number) => {
    setSelectedStoreId(storeId);
    setStockPage(1);
    setTransactionPage(1);
  };

  /**
   * Displays an auto-dismissing toast notification.
   */
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  /**
   * Confirms goods receipt, updating stock and transaction ledger.
   */
  const handleConfirmReceipt = (bookingId: number, receivedItems: ReceiveGoodsItemInput[]) => {
    setStockMap((prev) => {
      const currentList = prev[selectedStoreId] || [];
      const updatedList = [...currentList];

      receivedItems.forEach((received) => {
        const existingIndex = updatedList.findIndex((i) => i.product_id === received.product_id);
        if (existingIndex >= 0) {
          const oldItem = updatedList[existingIndex];
          const newQty = oldItem.quantity_on_hand + received.received_quantity;
          let newStatus: StockItem['status'] = 'healthy';
          if (newQty <= oldItem.threshold * 0.25) newStatus = 'critical';
          else if (newQty <= oldItem.threshold) newStatus = 'low_stock';

          updatedList[existingIndex] = {
            ...oldItem,
            quantity_on_hand: newQty,
            updated_at: 'Today, Just now',
            status: newStatus,
          };
        }
      });

      return { ...prev, [selectedStoreId]: updatedList };
    });

    const now = new Date();
    const formattedTimestamp = now.toISOString().replace('T', ' ').slice(0, 19);

    const newTxns: InventoryTransaction[] = receivedItems
      .filter((r) => r.received_quantity > 0)
      .map((item, idx) => ({
        transaction_id: Date.now() + idx,
        store_id: selectedStoreId,
        store_name: currentStore.store_name,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        change_qty: item.received_quantity,
        transaction_type: 'receive',
        reference_code: `TB-${bookingId}`,
        created_at: formattedTimestamp,
        created_by_name: 'Operator John Doe',
        notes: `Received cargo manifest from Train Booking #${bookingId}`,
      }));

    setTransactions((prev) => [...newTxns, ...prev]);
    showToast(`Stock updated — ${receivedItems.length} products received.`);
  };

  const stockPagination: PaginationState = {
    currentPage: stockPage,
    pageSize: PAGE_SIZE,
    totalCount: filteredStockItems.length,
  };

  const transactionPagination: PaginationState = {
    currentPage: transactionPage,
    pageSize: PAGE_SIZE,
    totalCount: filteredTransactions.length,
  };

  const availableBookings = MOCK_ARRIVED_TRAIN_BOOKINGS[selectedStoreId] || [];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-[#121c2c] text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 border border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00b69b] shrink-0" />
            <span className="text-[14px] font-medium">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-white/60 hover:text-white ml-2 text-sm cursor-pointer"
              aria-label="Dismiss toast"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Page Header & Actions matching UI/store_inventory/screen.png */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-[32px] font-bold text-[#121c2c] tracking-tight leading-tight">
            Store Inventory
          </h2>
          <p className="text-[14px] text-[#474554] mt-1">
            {currentStore.store_name} stock levels
          </p>
        </div>

        {/* Header Right Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search SKU or name..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-44 sm:w-56 h-10 pl-9 pr-3 rounded-lg border border-[#c8c4d7] text-[13px] outline-none focus:border-[#4132c7] focus:ring-1 focus:ring-[#4132c7] bg-white shadow-xs"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777586] pointer-events-none">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>

          {/* Store Selector Dropdown */}
          <div className="relative">
            <select
              value={selectedStoreId}
              onChange={(e) => handleStoreChange(Number(e.target.value))}
              className="appearance-none bg-white border border-[#c8c4d7] text-[#121c2c] font-medium text-[14px] rounded-lg pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-[#4132c7] focus:border-[#4132c7] shadow-xs outline-none cursor-pointer"
            >
              {MOCK_STORES.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.store_name}
                </option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#474554]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>

          {/* Receive Goods Button */}
          <button
            onClick={() => setReceiveModalOpen(true)}
            className="bg-[#4132c7] text-white font-semibold text-[14px] rounded-full px-6 py-2.5 shadow-md hover:bg-[#4132c7]/90 active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Receive Goods</span>
          </button>
        </div>
      </div>

      {/* Tabs matching UI/store_inventory/screen.png */}
      <div className="flex border-b border-[#c8c4d7] mb-6">
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-6 py-3 font-semibold text-[14px] cursor-pointer transition-colors ${
            activeTab === 'stock'
              ? 'text-[#4132c7] border-b-2 border-[#4132c7] -mb-[1px]'
              : 'text-[#474554] hover:text-[#4132c7] hover:bg-[#f0f3ff] rounded-t-lg'
          }`}
        >
          Stock Levels
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-6 py-3 font-semibold text-[14px] cursor-pointer transition-colors ${
            activeTab === 'transactions'
              ? 'text-[#4132c7] border-b-2 border-[#4132c7] -mb-[1px]'
              : 'text-[#474554] hover:text-[#4132c7] hover:bg-[#f0f3ff] rounded-t-lg'
          }`}
        >
          Transaction History
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'stock' ? (
        <StockLevelsTable
          items={paginatedStockItems}
          totalCount={filteredStockItems.length}
          pagination={stockPagination}
          onPageChange={setStockPage}
          onOpenReceiveModal={() => setReceiveModalOpen(true)}
        />
      ) : (
        <TransactionHistoryTable
          items={paginatedTransactions}
          totalCount={filteredTransactions.length}
          filters={transactionFilters}
          onFilterChange={(newFilters) => {
            setTransactionFilters(newFilters);
            setTransactionPage(1);
          }}
          pagination={transactionPagination}
          onPageChange={setTransactionPage}
        />
      )}

      {/* Receive Goods Dialog Modal */}
      <ReceiveGoodsModal
        isOpen={receiveModalOpen}
        activeStore={currentStore}
        availableBookings={availableBookings}
        onClose={() => setReceiveModalOpen(false)}
        onConfirmReceipt={handleConfirmReceipt}
      />
    </div>
  );
}
