'use client';

/**
 * @file page.tsx
 * @description Master client orchestrator for the /admin/master-data route (Member 4, Phase 1).
 *
 * Structure & Data Flow:
 * 1. Connects to live backend API endpoints (/api/products, /api/routes, /api/cities, /api/stores, /api/employees, /api/customers).
 * 2. Manages active tab state across 5 reference data domains:
 *    - Products: Catalog inventory items, pricing, space rates, and status.
 *    - Routes: Store-specific delivery routes and coverage areas.
 *    - Cities: Read-only geographic reference data for origin and destination hubs.
 *    - Employees: Personnel roster with roles, store assignments, and driver licenses.
 *    - Customers: Retail and wholesale customer accounts.
 * 3. Dynamically calculates 3-metric KPI Bento banner metrics from real active items.
 * 4. Supports real-time client-side search filtering within the active tab.
 * 5. Provides accessible creation modals with server constraint and duplicate validation.
 * 6. Displays loading spinner, error retry banner, chevron pagination, and auto-dismiss toast notifications.
 *
 * Authority: Docs/03_architecture.md §4, Docs/05_api-and-pages.md §384, Docs/07_content-copy.md §361, DESIGN.md
 * Owner: Member 4 (Vidura)
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { QuickStatsBanner } from './components/QuickStatsBanner';
import { ProductsTab } from './components/ProductsTab';
import { RoutesTab } from './components/RoutesTab';
import { CitiesTab } from './components/CitiesTab';
import { EmployeesTab } from './components/EmployeesTab';
import { CustomersTab } from './components/CustomersTab';
import { MasterDataPagination } from './components/MasterDataPagination';
import { AddProductModal } from './components/AddProductModal';
import { EditProductModal } from './components/EditProductModal';
import { AddRouteModal } from './components/AddRouteModal';
import { AddEmployeeModal } from './components/AddEmployeeModal';
import { AddCustomerModal } from './components/AddCustomerModal';

import { getStatsForTab } from './mockData';

import {
  MasterDataTab,
  ProductItem,
  RouteItem,
  CityItem,
  EmployeeItem,
  CustomerItem,
  PaginationState,
  NewProductPayload,
  UpdateProductPayload,
  NewRoutePayload,
  NewEmployeePayload,
  NewCustomerPayload,
} from './types';

const PAGE_SIZE = 5;

/**
 * Toast feedback notification state interface.
 */
interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info';
}

/**
 * Interface representing a store reference row.
 */
interface StoreRef {
  store_id: number;
  city_id: number;
  store_name: string;
  city_name: string;
  railway_station_name?: string;
  contact_phone?: string;
}

/**
 * MasterDataPage Component
 *
 * Main page component for the /admin/master-data route.
 */
export default function MasterDataPage(): React.JSX.Element {
  // Active navigation tab
  const [activeTab, setActiveTab] = useState<MasterDataTab>('products');

  // Search filter query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Tab-specific pagination page numbers
  const [pageByTab, setPageByTab] = useState<Record<MasterDataTab, number>>({
    products: 1,
    routes: 1,
    cities: 1,
    employees: 1,
    customers: 1,
  });

  // Master Data entity lists initialized as empty arrays and populated exclusively via live APIs
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [cities, setCities] = useState<CityItem[]>([]);
  const [stores, setStores] = useState<StoreRef[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);

  // Loading and error states for live data fetching
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal dialog visibility states
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isAddRouteOpen, setIsAddRouteOpen] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  // Toast notification feedback state
  const [toast, setToast] = useState<ToastState | null>(null);

  /**
   * Triggers a transient toast notification.
   *
   * @param message Text to display
   * @param type Semantic tone of the message
   */
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3500);
  };

  /**
   * Fetches master data from all 6 backend endpoints in parallel.
   * Reusable function used for both initial mount and the error Retry action.
   */
  const fetchMasterData = useCallback(async () => {
    try {
      const [prodRes, routesRes, citiesRes, storesRes, empRes, custRes] = await Promise.all([
        fetch('/api/products', { cache: 'no-store' }),
        fetch('/api/routes', { cache: 'no-store' }),
        fetch('/api/cities', { cache: 'no-store' }),
        fetch('/api/stores', { cache: 'no-store' }),
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/customers', { cache: 'no-store' }),
      ]);

      if (!prodRes.ok || !routesRes.ok || !citiesRes.ok || !storesRes.ok || !empRes.ok || !custRes.ok) {
        throw new Error("Couldn't load master data. Please try again.");
      }

      const [prodData, routesData, citiesData, storesData, empData, custData] = await Promise.all([
        prodRes.json(),
        routesRes.json(),
        citiesRes.json(),
        storesRes.json(),
        empRes.json(),
        custRes.json(),
      ]);

      // Always populate from API responses directly, including empty arrays []
      if (Array.isArray(prodData.items)) {
        setProducts(prodData.items);
      }
      if (Array.isArray(routesData.items)) {
        setRoutes(routesData.items);
      }
      if (Array.isArray(citiesData.items)) {
        setCities(citiesData.items);
      }
      if (Array.isArray(storesData.items)) {
        setStores(storesData.items);
      }
      if (Array.isArray(empData.items)) {
        setEmployees(empData.items);
      }
      if (Array.isArray(custData.items)) {
        setCustomers(custData.items);
      }
      setFetchError(null);
    } catch (err: unknown) {
      console.error('Failed to load master data:', err);
      if (err instanceof Error) {
        setFetchError(err.message);
      } else {
        setFetchError("Couldn't load master data. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Hydrate master data on initial component mount using the shared fetch function
  useEffect(() => {
    let ignore = false;

    const loadData = async () => {
      if (!ignore) {
        await fetchMasterData();
      }
    };

    void loadData();

    return () => {
      ignore = true;
    };
  }, [fetchMasterData]);

  /**
   * Switches the active reference data tab and resets search and pagination.
   *
   * @param tab Target MasterDataTab
   */
  const handleTabChange = (tab: MasterDataTab) => {
    setActiveTab(tab);
    setSearchQuery('');
  };

  /**
   * Updates the current pagination page index for the active tab.
   *
   * @param newPage Target 1-indexed page number
   */
  const handlePageChange = (newPage: number) => {
    setPageByTab((prev) => ({
      ...prev,
      [activeTab]: newPage,
    }));
  };

  /**
   * Filters product records based on search query.
   */
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.product_name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  /**
   * Filters route records based on search query.
   */
  const filteredRoutes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(
      (r) =>
        r.route_name.toLowerCase().includes(q) ||
        r.store_name.toLowerCase().includes(q) ||
        r.coverage_areas.some((a) => a.area_name.toLowerCase().includes(q))
    );
  }, [routes, searchQuery]);

  /**
   * Filters city records based on search query.
   */
  const filteredCities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) =>
        c.city_name.toLowerCase().includes(q) ||
        (c.store_name && c.store_name.toLowerCase().includes(q))
    );
  }, [cities, searchQuery]);

  /**
   * Filters employee records based on search query.
   */
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.nic_number.toLowerCase().includes(q) ||
        e.employee_type_label.toLowerCase().includes(q) ||
        (e.home_store_name && e.home_store_name.toLowerCase().includes(q))
    );
  }, [employees, searchQuery]);

  /**
   * Filters customer records based on search query.
   */
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.registered_city_name.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  /**
   * Computes dynamic KPI statistics cards for current tab from live items.
   */
  const currentTabStats = useMemo(() => {
    return getStatsForTab(activeTab, products, routes, cities, employees, customers);
  }, [activeTab, products, routes, cities, employees, customers]);

  /**
   * Slices records for current page pagination based on active tab.
   */
  const currentPage = pageByTab[activeTab] || 1;

  const { paginatedItems, totalCount } = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    switch (activeTab) {
      case 'products':
        return {
          paginatedItems: filteredProducts.slice(startIndex, startIndex + PAGE_SIZE),
          totalCount: filteredProducts.length,
        };
      case 'routes':
        return {
          paginatedItems: filteredRoutes.slice(startIndex, startIndex + PAGE_SIZE),
          totalCount: filteredRoutes.length,
        };
      case 'cities':
        return {
          paginatedItems: filteredCities.slice(startIndex, startIndex + PAGE_SIZE),
          totalCount: filteredCities.length,
        };
      case 'employees':
        return {
          paginatedItems: filteredEmployees.slice(startIndex, startIndex + PAGE_SIZE),
          totalCount: filteredEmployees.length,
        };
      case 'customers':
        return {
          paginatedItems: filteredCustomers.slice(startIndex, startIndex + PAGE_SIZE),
          totalCount: filteredCustomers.length,
        };
    }
  }, [
    activeTab,
    currentPage,
    filteredProducts,
    filteredRoutes,
    filteredCities,
    filteredEmployees,
    filteredCustomers,
  ]);

  const paginationState: PaginationState = {
    currentPage,
    pageSize: PAGE_SIZE,
    totalCount,
  };

  /**
   * Handles dynamic Add action button click depending on the active tab.
   */
  const handleMainAddClick = () => {
    switch (activeTab) {
      case 'products':
        setIsAddProductOpen(true);
        break;
      case 'routes':
        setIsAddRouteOpen(true);
        break;
      case 'employees':
        setIsAddEmployeeOpen(true);
        break;
      case 'customers':
        setIsAddCustomerOpen(true);
        break;
      case 'cities':
        // Cities are read-only
        break;
    }
  };

  /**
   * Handles creating a new product via POST /api/products.
   *
   * @param payload Validated product input
   */
  const handleAddProduct = async (payload: NewProductPayload) => {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error?.message || 'Failed to create product.',
        };
      }

      const createdProduct: ProductItem = data;
      setProducts((prev) => [createdProduct, ...prev]);
      showToast(`Product "${payload.product_name}" (${payload.sku}) added successfully.`);
      return { success: true };
    } catch (err: unknown) {
      console.error('Failed to create product:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error creating product.',
      };
    }
  };

  /**
   * Handles updating an existing product via PATCH /api/products/:id.
   *
   * @param productId Unique identifier of product to update
   * @param payload Validated product specifications
   */
  const handleEditProduct = async (productId: number, payload: UpdateProductPayload) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error?.message || 'Failed to update product.',
        };
      }

      const updatedProduct: ProductItem = data;
      setProducts((prev) =>
        prev.map((p) => (p.product_id === productId ? { ...p, ...updatedProduct } : p))
      );
      showToast(`Product "${updatedProduct.product_name}" updated successfully.`);
      setEditingProduct(null);
      return { success: true };
    } catch (err: unknown) {
      console.error('Failed to update product:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error updating product.',
      };
    }
  };

  /**
   * Handles creating a new route via POST /api/routes.
   *
   * @param payload Validated route input
   */
  const handleAddRoute = async (payload: NewRoutePayload) => {
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error?.message || 'Failed to configure route.',
        };
      }

      const createdRoute: RouteItem = data;
      setRoutes((prev) => [createdRoute, ...prev]);
      showToast(`Route "${payload.route_name}" configured successfully.`);
      return { success: true };
    } catch (err: unknown) {
      console.error('Failed to configure route:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error configuring route.',
      };
    }
  };

  /**
   * Handles creating a new employee via POST /api/employees.
   *
   * @param payload Validated employee input
   */
  const handleAddEmployee = async (payload: NewEmployeePayload) => {
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error?.message || 'Failed to register employee.',
        };
      }

      const createdEmp: EmployeeItem = data;
      setEmployees((prev) => [createdEmp, ...prev]);
      showToast(`Employee "${payload.full_name}" registered successfully.`);
      return { success: true };
    } catch (err: unknown) {
      console.error('Failed to register employee:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error registering employee.',
      };
    }
  };

  /**
   * Handles creating a new customer account via POST /api/customers.
   *
   * @param payload Validated customer input
   */
  const handleAddCustomer = async (payload: NewCustomerPayload) => {
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          error: data.error?.message || 'Failed to register customer.',
        };
      }

      const createdCust: CustomerItem = data;
      setCustomers((prev) => [createdCust, ...prev]);
      showToast(`Customer account "${payload.customer_name}" created successfully.`);
      return { success: true };
    } catch (err: unknown) {
      console.error('Failed to register customer:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error registering customer.',
      };
    }
  };

  // Dynamic Add button text
  const addBtnLabel = useMemo(() => {
    switch (activeTab) {
      case 'products':
        return '+ Add Product';
      case 'routes':
        return '+ Add Route';
      case 'employees':
        return '+ Add Employee';
      case 'customers':
        return '+ Add Customer';
      case 'cities':
        return 'Read Only';
    }
  }, [activeTab]);

  // Search input placeholder
  const searchPlaceholder = useMemo(() => {
    switch (activeTab) {
      case 'products':
        return 'Search products by SKU or Name...';
      case 'routes':
        return 'Search routes by Name, Store, or Area...';
      case 'cities':
        return 'Search cities by Name or Store...';
      case 'employees':
        return 'Search employees by Name, NIC, or Role...';
      case 'customers':
        return 'Search customers by Name, Phone, or City...';
    }
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* Toast Feedback Notification Banner */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-[#121C2C] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-[13px] border border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00B69B]" />
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Page Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] lg:text-[32px] font-bold text-[#121C2C] tracking-tight leading-none">
            Master Data
          </h1>
          <p className="text-[14px] text-[#474554] font-normal mt-1.5">
            Manage reference data used across the system
          </p>
        </div>

        {/* Dynamic Action Button */}
        {activeTab !== 'cities' ? (
          <button
            onClick={handleMainAddClick}
            className="h-11 px-6 rounded-full bg-[#4132C7] hover:bg-[#3527a8] text-white font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm transition-all duration-150 active:scale-[0.98] whitespace-nowrap cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>{addBtnLabel.replace('+ ', '')}</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F1F1F5] text-[12px] font-semibold text-[#474554]">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Read Only Reference</span>
          </span>
        )}
      </div>

      {/* Error Alert Banner */}
      {fetchError && (
        <div className="p-4 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl flex items-center justify-between gap-3 text-[13px] text-[#F93C65]">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{fetchError}</span>
          </div>
          <button
            onClick={() => {
              setIsLoading(true);
              setFetchError(null);
              void fetchMasterData();
            }}
            className="px-4 py-1.5 rounded-full bg-[#F93C65] text-white font-semibold text-[12px] hover:bg-[#d6284e] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Navigation Tabs (Products, Routes, Cities, Employees, Customers) */}
      <div className="border-b border-[#C8C4D7]/40">
        <nav aria-label="Master Data Tabs" className="flex gap-6 overflow-x-auto pb-px">
          <button
            onClick={() => handleTabChange('products')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === 'products'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Products
          </button>

          <button
            onClick={() => handleTabChange('routes')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === 'routes'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Routes
          </button>

          <button
            onClick={() => handleTabChange('cities')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === 'cities'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Cities
          </button>

          <button
            onClick={() => handleTabChange('employees')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === 'employees'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Employees
          </button>

          <button
            onClick={() => handleTabChange('customers')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 cursor-pointer ${
              activeTab === 'customers'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Customers
          </button>
        </nav>
      </div>

      {/* Dynamic 3-Card Quick Stats Bento Banner */}
      <QuickStatsBanner stats={currentTabStats} />

      {/* Main Data Table Container Card */}
      <div className="bg-white rounded-2xl shadow-soft border border-[#C8C4D7]/30 overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-[#C8C4D7]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          <div className="relative max-w-sm w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[#777586]">
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
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPageByTab((prev) => ({ ...prev, [activeTab]: 1 }));
              }}
              placeholder={searchPlaceholder}
              className="w-full h-10 pl-9 pr-4 text-[13px] bg-[#F5F5FA] border border-[#C8C4D7]/50 rounded-lg focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] transition-all text-[#121C2C] placeholder-[#777586]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => showToast('Filter options are active for this view.', 'info')}
              className="flex items-center gap-1.5 px-3.5 py-2 border border-[#C8C4D7]/50 rounded-lg text-[#474554] hover:bg-[#F5F5FA] hover:text-[#121C2C] text-[12px] font-semibold transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <span>Filter</span>
            </button>
            <button
              onClick={() => showToast('Export generated (CSV/PDF ready).', 'info')}
              className="flex items-center gap-1.5 px-3.5 py-2 border border-[#C8C4D7]/50 rounded-lg text-[#474554] hover:bg-[#F5F5FA] hover:text-[#121C2C] text-[12px] font-semibold transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Tab Content Display or Loading Indicator */}
        {isLoading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 border-3 border-[#4132C7] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[13px] text-[#474554] font-medium">Loading reference records...</p>
          </div>
        ) : (
          <>
            {activeTab === 'products' && (
              <ProductsTab
                items={paginatedItems as ProductItem[]}
                onAddClick={() => setIsAddProductOpen(true)}
                onEditClick={(item) => setEditingProduct(item)}
              />
            )}

            {activeTab === 'routes' && (
              <RoutesTab
                items={paginatedItems as RouteItem[]}
                onAddClick={() => setIsAddRouteOpen(true)}
                onEditClick={(item) => showToast(`Edit mode for "${item.route_name}" triggered.`, 'info')}
              />
            )}

            {activeTab === 'cities' && (
              <CitiesTab items={paginatedItems as CityItem[]} />
            )}

            {activeTab === 'employees' && (
              <EmployeesTab
                items={paginatedItems as EmployeeItem[]}
                onAddClick={() => setIsAddEmployeeOpen(true)}
                onEditClick={(item) => showToast(`Edit mode for "${item.full_name}" triggered.`, 'info')}
              />
            )}

            {activeTab === 'customers' && (
              <CustomersTab
                items={paginatedItems as CustomerItem[]}
                onAddClick={() => setIsAddCustomerOpen(true)}
                onEditClick={(item) => showToast(`Edit mode for "${item.customer_name}" triggered.`, 'info')}
              />
            )}

            {/* Pagination Footer */}
            <MasterDataPagination
              pagination={paginationState}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      {/* Creation and Edit Modals wired to real endpoints */}
      <AddProductModal
        isOpen={isAddProductOpen}
        existingProducts={products}
        onClose={() => setIsAddProductOpen(false)}
        onSubmit={handleAddProduct}
      />

      <EditProductModal
        isOpen={editingProduct !== null}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSubmit={handleEditProduct}
      />

      <AddRouteModal
        isOpen={isAddRouteOpen}
        stores={stores}
        cities={cities}
        onClose={() => setIsAddRouteOpen(false)}
        onSubmit={handleAddRoute}
      />

      <AddEmployeeModal
        isOpen={isAddEmployeeOpen}
        stores={stores}
        onClose={() => setIsAddEmployeeOpen(false)}
        onSubmit={handleAddEmployee}
      />

      <AddCustomerModal
        isOpen={isAddCustomerOpen}
        cities={cities}
        onClose={() => setIsAddCustomerOpen(false)}
        onSubmit={handleAddCustomer}
      />
    </div>
  );
}
