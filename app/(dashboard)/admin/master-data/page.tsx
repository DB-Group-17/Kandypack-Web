'use client';

/**
 * @file page.tsx
 * @description Static frontend shell for the /admin/master-data route (Member 4, Phase 0).
 *
 * Structure & Data Flow:
 * 1. Manages active tab state across 5 reference data sub-sections:
 *    - Products: Product catalog items, pricing, space rates, and status.
 *    - Routes: Store-specific delivery routes and coverage areas.
 *    - Cities: Read-only geographic reference data for origin and destination hubs.
 *    - Employees: Personnel roster with roles, store assignments, and driver licenses.
 *    - Customers: Retail and wholesale customer accounts.
 * 2. Provides dynamic 3-metric KPI stats banner adaptively calculated per active tab.
 * 3. Supports real-time client-side search filtering within the active tab.
 * 4. Provides accessible modal dialogs for creating new reference entities with duplicate validation.
 * 5. Features chevron pagination, empty states, and toast notifications.
 *
 * Conforms to Docs/05_api-and-pages.md §384, Docs/07_content-copy.md §361, and UI/master_data/.
 */

import React, { useState, useMemo } from 'react';
import { QuickStatsBanner } from './components/QuickStatsBanner';
import { ProductsTab } from './components/ProductsTab';
import { RoutesTab } from './components/RoutesTab';
import { CitiesTab } from './components/CitiesTab';
import { EmployeesTab } from './components/EmployeesTab';
import { CustomersTab } from './components/CustomersTab';
import { MasterDataPagination } from './components/MasterDataPagination';
import { AddProductModal } from './components/AddProductModal';
import { AddRouteModal } from './components/AddRouteModal';
import { AddEmployeeModal } from './components/AddEmployeeModal';
import { AddCustomerModal } from './components/AddCustomerModal';

import {
  MOCK_CITIES,
  MOCK_STORES,
  INITIAL_PRODUCTS,
  INITIAL_ROUTES,
  INITIAL_EMPLOYEES,
  INITIAL_CUSTOMERS,
  getStatsForTab,
} from './mockData';

import {
  MasterDataTab,
  ProductItem,
  RouteItem,
  CityItem,
  EmployeeItem,
  CustomerItem,
  PaginationState,
  NewProductPayload,
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

  // Master Data entity lists stored in local client state for Phase 0 interactive CRUD
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [routes, setRoutes] = useState<RouteItem[]>(INITIAL_ROUTES);
  const [cities] = useState<CityItem[]>(MOCK_CITIES);
  const [employees, setEmployees] = useState<EmployeeItem[]>(INITIAL_EMPLOYEES);
  const [customers, setCustomers] = useState<CustomerItem[]>(INITIAL_CUSTOMERS);

  // Modal dialog visibility states
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
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
   * Switches the active reference data tab and resets pagination if needed.
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
   * Computes dynamic KPI statistics cards for current tab.
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
   * Handles creating a new product.
   *
   * @param payload Validated product input
   */
  const handleAddProduct = (payload: NewProductPayload) => {
    const newProduct: ProductItem = {
      product_id: Date.now(),
      sku: payload.sku,
      product_name: payload.product_name,
      category: payload.category,
      unit_of_measure: payload.unit_of_measure,
      unit_price: payload.unit_price,
      space_rate: payload.space_rate,
      status: 'Active',
      created_at: new Date().toISOString().slice(0, 10),
    };
    setProducts((prev) => [newProduct, ...prev]);
    showToast(`Product "${payload.product_name}" (${payload.sku}) added successfully.`);
  };

  /**
   * Handles creating a new route.
   *
   * @param payload Validated route input
   */
  const handleAddRoute = (payload: NewRoutePayload) => {
    const assignedStore = MOCK_STORES.find((s) => s.store_id === payload.store_id);
    const newRoute: RouteItem = {
      route_id: Date.now(),
      store_id: payload.store_id,
      store_name: assignedStore ? assignedStore.store_name : 'Assigned Store',
      route_name: payload.route_name,
      coverage_description: payload.coverage_description,
      max_delivery_time_hours: payload.max_delivery_time_hours,
      coverage_areas: payload.coverage_areas.map((a, idx) => {
        const city = MOCK_CITIES.find((c) => c.city_id === a.city_id);
        return {
          coverage_id: Date.now() + idx,
          route_id: Date.now(),
          city_id: a.city_id,
          city_name: city ? city.city_name : 'City',
          area_name: a.area_name,
        };
      }),
      status: 'Active',
      created_at: new Date().toISOString().slice(0, 10),
    };
    setRoutes((prev) => [newRoute, ...prev]);
    showToast(`Route "${payload.route_name}" configured successfully.`);
  };

  /**
   * Handles creating a new employee.
   *
   * @param payload Validated employee input
   */
  const handleAddEmployee = (payload: NewEmployeePayload) => {
    const assignedStore = payload.home_store_id
      ? MOCK_STORES.find((s) => s.store_id === payload.home_store_id)
      : null;

    const roleLabels: Record<string, string> = {
      system_administrator: 'System Administrator',
      logistics_manager: 'Logistics Manager',
      order_entry_clerk: 'Order Entry Clerk',
      store_manager: 'Store Manager',
      fleet_supervisor: 'Fleet Supervisor',
      driver: 'Driver',
      assistant: 'Assistant',
    };

    const newEmp: EmployeeItem = {
      employee_id: Date.now(),
      full_name: payload.full_name,
      nic_number: payload.nic_number,
      phone: payload.phone,
      email: payload.email,
      employee_type: payload.employee_type,
      employee_type_label: roleLabels[payload.employee_type] || 'Staff Member',
      home_store_id: payload.home_store_id || null,
      home_store_name: assignedStore ? assignedStore.store_name : 'Central HQ (Kandy)',
      license_number: payload.license_number,
      license_expiry: payload.license_expiry,
      status: 'Active',
      hire_date: new Date().toISOString().slice(0, 10),
    };
    setEmployees((prev) => [newEmp, ...prev]);
    showToast(`Employee "${payload.full_name}" registered successfully.`);
  };

  /**
   * Handles creating a new customer account.
   *
   * @param payload Validated customer input
   */
  const handleAddCustomer = (payload: NewCustomerPayload) => {
    const regCity = MOCK_CITIES.find((c) => c.city_id === payload.registered_city_id);
    const newCust: CustomerItem = {
      customer_id: Date.now(),
      customer_name: payload.customer_name,
      customer_type: payload.customer_type,
      phone: payload.phone,
      email: payload.email,
      registered_city_id: payload.registered_city_id,
      registered_city_name: regCity ? regCity.city_name : 'Colombo',
      address_line: payload.address_line,
      status: 'Active',
      created_at: new Date().toISOString().slice(0, 10),
    };
    setCustomers((prev) => [newCust, ...prev]);
    showToast(`Customer account "${payload.customer_name}" created successfully.`);
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
            className="h-11 px-6 rounded-full bg-[#4132C7] hover:bg-[#3527a8] text-white font-semibold text-[13px] flex items-center justify-center gap-2 shadow-sm transition-all duration-150 active:scale-[0.98] whitespace-nowrap"
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

      {/* Navigation Tabs (Products, Routes, Cities, Employees, Customers) */}
      <div className="border-b border-[#C8C4D7]/40">
        <nav aria-label="Master Data Tabs" className="flex gap-6 overflow-x-auto pb-px">
          <button
            onClick={() => handleTabChange('products')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === 'products'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Products
          </button>

          <button
            onClick={() => handleTabChange('routes')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === 'routes'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Routes
          </button>

          <button
            onClick={() => handleTabChange('cities')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === 'cities'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Cities
          </button>

          <button
            onClick={() => handleTabChange('employees')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === 'employees'
                ? 'border-[#4132C7] text-[#4132C7]'
                : 'border-transparent text-[#474554] hover:text-[#121C2C]'
            }`}
          >
            Employees
          </button>

          <button
            onClick={() => handleTabChange('customers')}
            className={`pb-3 px-1 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 ${
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
              className="flex items-center gap-1.5 px-3.5 py-2 border border-[#C8C4D7]/50 rounded-lg text-[#474554] hover:bg-[#F5F5FA] hover:text-[#121C2C] text-[12px] font-semibold transition-colors"
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
              className="flex items-center gap-1.5 px-3.5 py-2 border border-[#C8C4D7]/50 rounded-lg text-[#474554] hover:bg-[#F5F5FA] hover:text-[#121C2C] text-[12px] font-semibold transition-colors"
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

        {/* Tab Content Display */}
        {activeTab === 'products' && (
          <ProductsTab
            items={paginatedItems as ProductItem[]}
            onAddClick={() => setIsAddProductOpen(true)}
            onEditClick={(item) => showToast(`Edit mode for "${item.product_name}" triggered.`, 'info')}
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
      </div>

      {/* Creation Modals */}
      <AddProductModal
        isOpen={isAddProductOpen}
        existingProducts={products}
        onClose={() => setIsAddProductOpen(false)}
        onSubmit={handleAddProduct}
      />

      <AddRouteModal
        isOpen={isAddRouteOpen}
        onClose={() => setIsAddRouteOpen(false)}
        onSubmit={handleAddRoute}
      />

      <AddEmployeeModal
        isOpen={isAddEmployeeOpen}
        onClose={() => setIsAddEmployeeOpen(false)}
        onSubmit={handleAddEmployee}
      />

      <AddCustomerModal
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onSubmit={handleAddCustomer}
      />
    </div>
  );
}
