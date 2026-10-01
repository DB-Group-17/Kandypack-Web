'use client';

/**
 * @file page.tsx
 * @description Frontend page for the Store Inventory route (/inventory).
 * Connects directly to backend APIs to display real-time store stock levels,
 * immutable inventory transaction ledgers, and goods receipt workflows.
 *
 * Architecture and Data Flow:
 * 1. Authentication & RBAC:
 *    - Ingests user session claims from AuthContext (`useAuth`).
 *    - Enforces store-manager tenant isolation: `store_manager` users are locked
 *      strictly to their assigned store ID (`user.store_id`) and cannot view or
 *      switch to other branches.
 *    - System Administrators and Logistics Managers receive global store-selection
 *      capabilities across all network stores.
 *    - Logistics Managers have read-only visibility; only Store Managers and System
 *      Administrators can trigger the Receive Goods mutation.
 * 2. Real API Integrations:
 *    - Current Inventory: `GET /api/stores/:id/inventory`
 *    - Transaction History: `GET /api/inventory/transactions?store_id=...`
 *    - Receive Goods Mutation: `POST /api/stores/:id/receive-goods`
 *    - Auxiliary reference data: `GET /api/stores` & `GET /api/products`
 * 3. Reactive State & Refresh:
 *    - After confirming cargo receipt, live inventory stock and transaction ledgers
 *      are automatically re-fetched so the user immediately views updated quantities.
 *    - Prevents duplicate submissions while mutations are pending.
 *
 * Authority: Docs/03_architecture.md §4 & §6, Docs/05_api-and-pages.md §A6 & §B, Docs/07_content-copy.md §/inventory
 * Owner: Member 4 (Vidura)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { StockLevelsTable } from './components/StockLevelsTable';
import { TransactionHistoryTable } from './components/TransactionHistoryTable';
import { ReceiveGoodsModal } from './components/ReceiveGoodsModal';
import {
  Store,
  StockItem,
  InventoryTransaction,
  PaginationState,
  TransactionFilters,
  ApiStoreInventoryResponse,
  ApiInventoryTransactionsResponse,
  ProductCatalogItem,
  StockStatus,
} from './types';

/**
 * Default transaction query filter parameters.
 */
const INITIAL_TRANSACTION_FILTERS: TransactionFilters = {
  searchQuery: '',
  typeFilter: 'all',
  dateFrom: '',
  dateTo: '',
};

/**
 * Table page size for client-side pagination.
 */
const PAGE_SIZE = 5;

/**
 * Evaluates semantic inventory health status based on quantity on hand and an authoritative threshold.
 * When threshold is undefined or null, no status classification is inferred.
 *
 * @param quantity - Current physical count on hand
 * @param threshold - Minimum threshold before low stock alert triggers (optional)
 * @returns 'critical' | 'low_stock' | 'healthy' | undefined
 */
function computeStockStatus(quantity: number, threshold?: number): StockStatus | undefined {
  if (threshold === undefined || threshold === null) return undefined;
  if (quantity <= threshold * 0.25) return 'critical';
  if (quantity <= threshold) return 'low_stock';
  return 'healthy';
}

/**
 * StoreInventoryPage Component
 *
 * Main component orchestrating store inventory stock management and transactions.
 *
 * @returns JSX element
 */
export default function StoreInventoryPage(): React.JSX.Element {
  // Authentication & Session context
  const { user, role, store_id: userStoreId, isLoading: authLoading } = useAuth();

  // Master stores list retrieved from GET /api/stores
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState<boolean>(true);

  // Selected store ID chosen by global roles (admin / logistics manager)
  const [globalStoreId, setGlobalStoreId] = useState<number | null>(null);

  // Active tab selection ('stock' or 'transactions')
  const [activeTab, setActiveTab] = useState<'stock' | 'transactions'>('stock');

  // Top header search query for stock levels
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Catalog products map for SKU & product metadata enrichment
  const [productsMap, setProductsMap] = useState<Map<number, ProductCatalogItem>>(new Map());

  // Real store inventory stock state
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState<boolean>(true);
  const [stockError, setStockError] = useState<string | null>(null);

  // Real inventory transactions ledger state
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [txnLoading, setTxnLoading] = useState<boolean>(true);
  const [txnError, setTxnError] = useState<string | null>(null);

  // Trigger counter to refresh inventory and transactions after a mutation or retry
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Transaction tab filter options
  const [transactionFilters, setTransactionFilters] = useState<TransactionFilters>(
    INITIAL_TRANSACTION_FILTERS
  );

  // Pagination states
  const [stockPage, setStockPage] = useState<number>(1);
  const [transactionPage, setTransactionPage] = useState<number>(1);

  // Modal open state for receiving goods
  const [receiveModalOpen, setReceiveModalOpen] = useState<boolean>(false);

  // User-facing toast feedback notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  /**
   * Evaluates permissions based on active role.
   */
  const isAuthorizedRole = useMemo(() => {
    if (!role) return false;
    return ['system_administrator', 'logistics_manager', 'store_manager'].includes(role);
  }, [role]);

  const canReceiveGoods = useMemo(() => {
    return role === 'system_administrator' || role === 'store_manager';
  }, [role]);

  const canSelectStore = useMemo(() => {
    return role === 'system_administrator' || role === 'logistics_manager';
  }, [role]);

  /**
   * Helper to display auto-dismissing toast notifications.
   *
   * @param msg - Toast message string
   * @param type - Notification semantic type ('success' or 'error')
   */
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  }, []);

  /**
   * Derived active store ID enforcing strict store_manager tenant isolation.
   */
  const activeStoreId: number | null = useMemo(() => {
    if (role === 'store_manager') {
      return userStoreId !== null && userStoreId !== undefined ? Number(userStoreId) : null;
    }
    if (globalStoreId !== null) {
      return globalStoreId;
    }
    return stores.length > 0 ? stores[0].store_id : null;
  }, [role, userStoreId, globalStoreId, stores]);

  /**
   * Derives current active Store object for UI headings and badges.
   */
  const currentStore: Store = useMemo(() => {
    if (activeStoreId !== null) {
      const found = stores.find((s) => s.store_id === activeStoreId);
      if (found) return found;
    }
    return {
      store_id: activeStoreId || 1,
      store_name:
        role === 'store_manager' && user?.display_name
          ? `Store #${userStoreId ?? activeStoreId}`
          : 'Store Inventory',
      city_id: 1,
      city_name: 'Distribution Hub',
    };
  }, [stores, activeStoreId, role, user, userStoreId]);

  /**
   * Fetches store master records and product catalog items on component mount.
   */
  useEffect(() => {
    let isSubscribed = true;

    async function loadMasterData() {
      try {
        setStoresLoading(true);

        const [storesRes, productsRes] = await Promise.all([
          fetch('/api/stores', { cache: 'no-store' }),
          fetch('/api/products', { cache: 'no-store' }),
        ]);

        if (!isSubscribed) return;

        if (storesRes.ok) {
          const storesData = (await storesRes.json()) as { items: Store[] };
          setStores(storesData.items || []);
        } else {
          console.error('Failed to fetch stores:', storesRes.status);
        }

        if (productsRes.ok) {
          const productsData = (await productsRes.json()) as { items: ProductCatalogItem[] };
          const pMap = new Map<number, ProductCatalogItem>();
          (productsData.items || []).forEach((p) => {
            pMap.set(p.product_id, p);
          });
          setProductsMap(pMap);
        } else {
          console.error('Failed to fetch products:', productsRes.status);
        }
      } catch (err) {
        console.error('Error loading master data:', err);
      } finally {
        if (isSubscribed) setStoresLoading(false);
      }
    }

    if (isAuthorizedRole) {
      void loadMasterData();
    }

    return () => {
      isSubscribed = false;
    };
  }, [isAuthorizedRole]);

  /**
   * Refreshes both inventory stock levels and transaction history for the selected store.
   */
  const refreshData = useCallback(() => {
    setStockLoading(true);
    setTxnLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  /**
   * Synchronizes stock data whenever the active store, products map, or refresh trigger changes.
   */
  useEffect(() => {
    let ignore = false;
    if (activeStoreId === null) return;

    const loadStock = async () => {
      try {
        const res = await fetch(`/api/stores/${activeStoreId}/inventory`, {
          cache: 'no-store',
        });

        if (ignore) return;

        if (res.ok) {
          const data = (await res.json()) as ApiStoreInventoryResponse;
          if (ignore) return;
          const items: StockItem[] = (data.items || []).map((row) => {
            const productMeta = productsMap.get(row.product_id);
            const qty = Number(row.quantity_on_hand);
            // Authoritative per-product threshold (undefined until provided by backend schema)
            const threshold: number | undefined = undefined;
            return {
              product_id: row.product_id,
              product_name: row.product_name,
              sku: productMeta?.sku || `SKU-${row.product_id}`,
              category: productMeta?.category,
              unit_of_measure: productMeta?.unit_of_measure,
              quantity_on_hand: qty,
              threshold,
              updated_at: row.updated_at,
              status: computeStockStatus(qty, threshold),
            };
          });

          setStockItems(items);
          setStockError(null);
        } else {
          const errBody = await res.json().catch(() => null);
          const msg =
            errBody?.error?.message || `Failed to retrieve store stock (HTTP ${res.status}).`;
          setStockError(msg);
          setStockItems([]);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Network error loading store inventory:', err);
          setStockError('Network error while retrieving inventory. Please check connection.');
          setStockItems([]);
        }
      } finally {
        if (!ignore) {
          setStockLoading(false);
        }
      }
    };

    void loadStock();

    return () => {
      ignore = true;
    };
  }, [activeStoreId, productsMap, refreshTrigger]);

  /**
   * Synchronizes transactions data whenever active store, filters, or refresh trigger changes.
   */
  useEffect(() => {
    let ignore = false;
    if (activeStoreId === null) return;

    const loadTransactions = async () => {
      try {
        const params = new URLSearchParams();
        params.set('store_id', String(activeStoreId));

        if (transactionFilters.typeFilter && transactionFilters.typeFilter !== 'all') {
          params.set('type', transactionFilters.typeFilter);
        }

        if (transactionFilters.dateFrom) {
          params.set('date_from', transactionFilters.dateFrom);
        }

        if (transactionFilters.dateTo) {
          params.set('date_to', transactionFilters.dateTo);
        }

        const res = await fetch(`/api/inventory/transactions?${params.toString()}`, {
          cache: 'no-store',
        });

        if (ignore) return;

        if (res.ok) {
          const data = (await res.json()) as ApiInventoryTransactionsResponse;
          if (ignore) return;
          const items: InventoryTransaction[] = (data.items || []).map((row) => {
            const productMeta = productsMap.get(row.product_id);
            let refCode = '—';
            if (row.train_booking_id) {
              refCode = `TB-${row.train_booking_id}`;
            } else if (row.delivery_id) {
              refCode = `DEL-${row.delivery_id}`;
            } else {
              refCode = `TXN-${row.transaction_id}`;
            }

            return {
              transaction_id: row.transaction_id,
              store_id: row.store_id,
              store_name: currentStore.store_name,
              product_id: row.product_id,
              product_name: productMeta?.product_name || `Product #${row.product_id}`,
              sku: productMeta?.sku || `SKU-${row.product_id}`,
              change_qty: Number(row.change_qty),
              transaction_type: row.transaction_type,
              train_booking_id: row.train_booking_id,
              delivery_id: row.delivery_id,
              reference_code: refCode,
              created_at: row.created_at,
              created_by_name: 'Verified Ledger',
            };
          });

          setTransactions(items);
          setTxnError(null);
        } else {
          const errBody = await res.json().catch(() => null);
          const msg =
            errBody?.error?.message ||
            `Failed to retrieve transactions ledger (HTTP ${res.status}).`;
          setTxnError(msg);
          setTransactions([]);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Network error loading transactions ledger:', err);
          setTxnError('Network error while retrieving transactions. Please check connection.');
          setTransactions([]);
        }
      } finally {
        if (!ignore) {
          setTxnLoading(false);
        }
      }
    };

    void loadTransactions();

    return () => {
      ignore = true;
    };
  }, [
    activeStoreId,
    productsMap,
    currentStore.store_name,
    transactionFilters.typeFilter,
    transactionFilters.dateFrom,
    transactionFilters.dateTo,
    refreshTrigger,
  ]);

  /**
   * Switches the active store for global administrator/logistics roles.
   *
   * @param storeId - Newly selected store ID
   */
  const handleStoreChange = (storeId: number) => {
    if (!canSelectStore) return;
    setStockLoading(true);
    setTxnLoading(true);
    setGlobalStoreId(storeId);
    setStockPage(1);
    setTransactionPage(1);
  };

  /**
   * Confirms cargo receipt by invoking POST /api/stores/:id/receive-goods.
   *
   * @param bookingId - Arrived train booking identifier
   * @returns Object with success flag and optional error message
   */
  const handleConfirmReceipt = async (
    bookingId: number
  ): Promise<{ success: boolean; error?: string; updated_products?: number }> => {
    if (activeStoreId === null) {
      return { success: false, error: 'No active store selected for goods receipt.' };
    }

    try {
      const response = await fetch(`/api/stores/${activeStoreId}/receive-goods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ train_booking_id: bookingId }),
      });

      const data = await response.json();

      if (response.ok) {
        const count = data.updated_products ?? 0;
        showToast(`Stock updated — ${count} products received.`, 'success');

        // Refresh stock levels and transaction ledgers without page reload
        refreshData();

        return { success: true, updated_products: count };
      } else {
        const errorMessage =
          data?.error?.message || 'Failed to process goods receipt. Please verify booking ID.';
        return { success: false, error: errorMessage };
      }
    } catch (err: unknown) {
      console.error('Error invoking receive goods API:', err);
      return {
        success: false,
        error: 'Network failure while transmitting receipt. Please try again.',
      };
    }
  };

  /**
   * Client-side filters stock items by search query matching product name or SKU.
   */
  const filteredStockItems = useMemo(() => {
    if (!globalSearch.trim()) return stockItems;
    const q = globalSearch.toLowerCase();
    return stockItems.filter(
      (item) => item.product_name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
    );
  }, [stockItems, globalSearch]);

  /**
   * Paginated slice of current stock items.
   */
  const paginatedStockItems = useMemo(() => {
    const startIndex = (stockPage - 1) * PAGE_SIZE;
    return filteredStockItems.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredStockItems, stockPage]);

  /**
   * Client-side filters transactions by local search query matching product name, SKU, or reference code.
   */
  const filteredTransactions = useMemo(() => {
    if (!transactionFilters.searchQuery.trim()) return transactions;
    const q = transactionFilters.searchQuery.toLowerCase();
    return transactions.filter(
      (txn) =>
        txn.product_name.toLowerCase().includes(q) ||
        txn.sku.toLowerCase().includes(q) ||
        txn.reference_code.toLowerCase().includes(q)
    );
  }, [transactions, transactionFilters.searchQuery]);

  /**
   * Paginated slice of current transactions.
   */
  const paginatedTransactions = useMemo(() => {
    const startIndex = (transactionPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredTransactions, transactionPage]);

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

  // 1. Loading Authentication state
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <svg className="animate-spin w-8 h-8 text-[#4132C7] mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-[14px] font-medium text-[#474554]">Loading session...</p>
      </div>
    );
  }

  // 2. Access Denied for unauthorized roles
  if (!isAuthorizedRole) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-[#C8C4D7]/40 shadow-xs max-w-lg mx-auto text-center mt-12">
        <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#F93C65] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-[18px] font-bold text-[#121C2C] mb-2">Access Restricted</h2>
        <p className="text-[14px] text-[#474554] leading-relaxed">
          Your active account role (<strong className="text-[#121C2C]">{role || 'Unassigned'}</strong>) is not authorized
          to inspect or manage physical store inventory.
        </p>
      </div>
    );
  }

  // 3. Store manager missing store assignment warning
  if (role === 'store_manager' && (userStoreId === null || userStoreId === undefined)) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-[#C8C4D7]/40 shadow-xs max-w-lg mx-auto text-center mt-12">
        <div className="w-12 h-12 rounded-full bg-[#FFF9E6] text-[#FFB800] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-[18px] font-bold text-[#121C2C] mb-2">No Store Assigned</h2>
        <p className="text-[14px] text-[#474554] leading-relaxed">
          Your store manager account does not have a physical store assigned in the system registry. Please
          contact a System Administrator to link your profile to a home store.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 border ${
              toastType === 'error'
                ? 'bg-[#93000A] border-white/20'
                : 'bg-[#121c2c] border-white/10'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                toastType === 'error' ? 'bg-[#FFDAD6]' : 'bg-[#00B69B]'
              }`}
            />
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

      {/* Page Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-[32px] font-bold text-[#121C2C] tracking-tight leading-tight">
            Store Inventory
          </h2>
          <p className="text-[14px] text-[#474554] mt-1">
            {currentStore.store_name} stock levels
          </p>
        </div>

        {/* Header Right Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Global Search Bar (for active stock view) */}
          {activeTab === 'stock' && (
            <div className="relative">
              <input
                type="text"
                placeholder="Search SKU or name..."
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setStockPage(1);
                }}
                className="w-44 sm:w-56 h-10 pl-9 pr-3 rounded-lg border border-[#C8C4D7] text-[13px] outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] bg-white shadow-xs transition-all"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777586] pointer-events-none">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>
          )}

          {/* Store Selector (for Admin/Logistics roles) vs Static Badge (Store Manager) */}
          {canSelectStore ? (
            <div className="relative">
              <select
                value={activeStoreId ?? ''}
                onChange={(e) => handleStoreChange(Number(e.target.value))}
                disabled={storesLoading}
                className="appearance-none bg-white border border-[#C8C4D7] text-[#121C2C] font-medium text-[14px] rounded-lg pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-[#4132C7] focus:border-[#4132C7] shadow-xs outline-none cursor-pointer disabled:opacity-60"
                title="Select Store"
              >
                {stores.map((s) => (
                  <option key={s.store_id} value={s.store_id}>
                    {s.store_name} ({s.city_name})
                  </option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#474554]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          ) : (
            <div className="bg-[#F0F3FF] border border-[#DEE8FF] text-[#4132C7] text-[13px] font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>{currentStore.store_name}</span>
            </div>
          )}

          {/* Receive Goods Button (store_manager and system_administrator only) */}
          {canReceiveGoods && (
            <button
              onClick={() => setReceiveModalOpen(true)}
              className="bg-[#4132C7] text-white font-semibold text-[14px] rounded-full px-6 py-2.5 shadow-md hover:bg-[#4132C7]/90 active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Receive Goods</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#C8C4D7] mb-6">
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-6 py-3 font-semibold text-[14px] cursor-pointer transition-colors ${
            activeTab === 'stock'
              ? 'text-[#4132C7] border-b-2 border-[#4132C7] -mb-[1px]'
              : 'text-[#474554] hover:text-[#4132C7] hover:bg-[#F0F3FF] rounded-t-lg'
          }`}
        >
          Stock Levels
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-6 py-3 font-semibold text-[14px] cursor-pointer transition-colors ${
            activeTab === 'transactions'
              ? 'text-[#4132C7] border-b-2 border-[#4132C7] -mb-[1px]'
              : 'text-[#474554] hover:text-[#4132C7] hover:bg-[#F0F3FF] rounded-t-lg'
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
          isLoading={stockLoading}
          error={stockError}
          onRetry={refreshData}
          canReceiveGoods={canReceiveGoods}
          searchQuery={globalSearch}
          onClearSearch={() => setGlobalSearch('')}
        />
      ) : (
        <TransactionHistoryTable
          items={paginatedTransactions}
          totalCount={filteredTransactions.length}
          filters={transactionFilters}
          onFilterChange={(newFilters) => {
            setTxnLoading(true);
            setTransactionFilters(newFilters);
            setTransactionPage(1);
          }}
          pagination={transactionPagination}
          onPageChange={setTransactionPage}
          isLoading={txnLoading}
          error={txnError}
          onRetry={refreshData}
        />
      )}

      {/* Receive Goods Dialog Modal */}
      {receiveModalOpen && (
        <ReceiveGoodsModal
          isOpen={receiveModalOpen}
          activeStore={currentStore}
          onClose={() => setReceiveModalOpen(false)}
          onConfirmReceipt={handleConfirmReceipt}
        />
      )}
    </div>
  );
}


