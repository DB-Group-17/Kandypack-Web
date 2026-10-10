'use client';

/**
 * @file page.tsx
 * @description Frontend page component for the /admin/audit-log route (Member 4, Phase 3).
 *
 * Architecture and Data Flow:
 * 1. Fetches real audit trail events from GET /api/audit-log using server-side filtering and pagination.
 * 2. Fetches user list from GET /api/users to populate actor filter options dynamically alongside system triggers.
 * 3. Keeps draft filter state separate from applied filter parameters so network requests only fire on explicit 'Filter' click or 'Clear'.
 * 4. Renders interactive AuditLogFilterBar, AuditLogTable (with expandable row diffs), and AuditLogPagination.
 * 5. Handles loading ('Loading…') and error ('Something went wrong.' + retry) states per Docs/07_content-copy.md.
 * 6. Guarantees race-condition prevention using cleanup flags and AbortController signal cancellation.
 *
 * Authority: Docs/03_architecture.md §19, Docs/05_api-and-pages.md §B/admin/audit-log, Docs/07_content-copy.md §/admin/audit-log.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AuditLogFilterBar } from './components/AuditLogFilterBar';
import { AuditLogTable } from './components/AuditLogTable';
import { AuditLogPagination } from './components/AuditLogPagination';
import {
  AuditLogItem,
  AuditLogFilters,
  PaginationState,
  FilterOption,
  AuditLogApiResponse,
} from './types';

/**
 * Default empty filter state.
 */
const INITIAL_FILTERS: AuditLogFilters = {
  tableName: '',
  user: '',
  dateFrom: '',
  dateTo: '',
};

/**
 * UI page size constant matching the design specification.
 */
const PAGE_SIZE = 6;

/**
 * Tracked database tables recorded by audit logging triggers.
 * Derived from db/migrations/15_trg_audit.sql and db/migrations/25_audit_users.sql.
 */
const TRACKED_TABLE_OPTIONS: FilterOption[] = [
  { value: 'orders', label: 'Orders' },
  { value: 'order_items', label: 'Order Items' },
  { value: 'customers', label: 'Customers' },
  { value: 'products', label: 'Products' },
  { value: 'stores', label: 'Stores' },
  { value: 'employees', label: 'Employees' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'assistants', label: 'Assistants' },
  { value: 'trucks', label: 'Trucks' },
  { value: 'routes', label: 'Routes' },
  { value: 'truck_schedules', label: 'Truck Schedule' },
  { value: 'deliveries', label: 'Deliveries' },
  { value: 'train_bookings', label: 'Train Bookings' },
  { value: 'users', label: 'Users' },
  { value: 'user_profiles', label: 'User Profiles' },
];

/**
 * AuditLogPage Component
 *
 * Main page component for the /admin/audit-log route.
 * Coordinates server-side data fetching, filter draft management, and pagination.
 *
 * @returns React element representing the audit log administrative view
 */
export default function AuditLogPage(): React.JSX.Element {
  // Live audit log items for current page slice
  const [items, setItems] = useState<AuditLogItem[]>([]);
  // Total number of matching records returned by COUNT query on backend
  const [totalCount, setTotalCount] = useState<number>(0);

  // Network request lifecycle states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter input editing state (draft), updated on field changes
  const [filterDraft, setFilterDraft] = useState<AuditLogFilters>(INITIAL_FILTERS);
  // Applied filter state, only updated when user explicitly clicks "Filter" or "Clear"
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>(INITIAL_FILTERS);

  // Dynamic actor options loaded from GET /api/users
  const [userOptions, setUserOptions] = useState<FilterOption[]>([]);

  // Current active 1-indexed pagination page
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Trigger tick used to manually reload audit records (e.g. Retry button)
  const [refreshKey, setRefreshKey] = useState<number>(0);

  /**
   * Fetches the user account list from GET /api/users on component mount
   * to populate the "User" filter dropdown with real staff accounts + system actor.
   */
  useEffect(() => {
    let ignore = false;

    async function loadUserOptions() {
      try {
        const res = await fetch('/api/users?limit=100', { cache: 'no-store' });
        if (ignore) return;

        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (ignore) return;
          const userList = Array.isArray(data?.items) ? data.items : [];
          const options: FilterOption[] = userList.map(
            (u: { user_id: string; display_name?: string; email?: string }) => ({
              value: u.user_id,
              label: u.display_name || u.email || u.user_id,
            })
          );
          // System trigger actions have NULL user_id in audit_log, queried via user_id='system'
          options.push({ value: 'system', label: 'System' });

          if (!ignore) {
            setUserOptions(options);
          }
        } else {
          // If user accounts lookup fails, provide at least the System trigger option
          if (!ignore) {
            setUserOptions([{ value: 'system', label: 'System' }]);
          }
        }
      } catch (err) {
        console.warn('Failed to load user options for audit log filter:', err);
        if (!ignore) {
          setUserOptions([{ value: 'system', label: 'System' }]);
        }
      }
    }

    void loadUserOptions();

    return () => {
      ignore = true;
    };
  }, []);

  /**
   * Fetches paginated, filtered audit log records from GET /api/audit-log
   * whenever applied filters, current page, or manual refresh key changes.
   * Cancels inflight requests and drops stale responses.
   */
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function fetchAuditLogs() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const params = new URLSearchParams();
        params.set('page', String(currentPage));
        params.set('limit', String(PAGE_SIZE));

        if (appliedFilters.tableName) {
          params.set('table_name', appliedFilters.tableName);
        }
        if (appliedFilters.user) {
          params.set('user_id', appliedFilters.user);
        }
        if (appliedFilters.dateFrom) {
          params.set('date_from', appliedFilters.dateFrom);
        }
        if (appliedFilters.dateTo) {
          params.set('date_to', appliedFilters.dateTo);
        }

        const res = await fetch(`/api/audit-log?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (ignore) return;

        const data: AuditLogApiResponse | { error?: { message?: string } } =
          await res.json().catch(() => ({}));

        if (ignore) return;

        if (!res.ok) {
          const message =
            ('error' in data && data.error?.message) ||
            `Failed to load audit records (HTTP ${res.status}).`;
          setFetchError(message);
          setItems([]);
          setTotalCount(0);
        } else {
          const responseData = data as AuditLogApiResponse;
          setItems(Array.isArray(responseData.items) ? responseData.items : []);
          setTotalCount(typeof responseData.total === 'number' ? responseData.total : 0);
          setFetchError(null);
        }
      } catch (err: unknown) {
        if (ignore) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Error fetching audit log data:', err);
        setFetchError('Network error while retrieving audit logs. Please try again.');
        setItems([]);
        setTotalCount(0);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void fetchAuditLogs();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [appliedFilters, currentPage, refreshKey]);

  /**
   * Updates filter editing draft without executing immediate API calls.
   *
   * @param newFilters The modified filter draft values
   */
  const handleFilterDraftChange = (newFilters: AuditLogFilters) => {
    setFilterDraft(newFilters);
  };

  /**
   * Applies current filter draft values and resets pagination to page 1.
   * Fired when user explicitly clicks the "Filter" button.
   */
  const handleApplyFilters = () => {
    setAppliedFilters(filterDraft);
    setCurrentPage(1);
  };

  /**
   * Resets all filter values back to initial empty state and resets pagination to page 1.
   * Fired when user clicks the "Clear" button.
   */
  const handleResetFilters = () => {
    setFilterDraft(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setCurrentPage(1);
  };

  /**
   * Handles user-driven page navigation.
   *
   * @param newPage Target 1-indexed page index
   */
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  /**
   * Forces a refetch of the current page and applied filters.
   * Used by the error state Retry button.
   */
  const handleRetry = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const paginationState: PaginationState = {
    currentPage,
    pageSize: PAGE_SIZE,
    totalCount,
  };

  return (
    <div className="space-y-6">
      {/* Page Header Area */}
      <div className="mb-6">
        <h1 className="text-[28px] lg:text-[32px] font-bold text-[#121C2C] tracking-tight mb-1">
          Audit Log
        </h1>
        <p className="text-[15px] text-[#474554]">
          Full history of data changes across the system
        </p>
      </div>

      {/* Interactive Filter Bar */}
      <AuditLogFilterBar
        filters={filterDraft}
        onFilterChange={handleFilterDraftChange}
        onResetFilters={handleResetFilters}
        onApplyFilters={handleApplyFilters}
        tableOptions={TRACKED_TABLE_OPTIONS}
        userOptions={userOptions}
      />

      {/* Main Audit Log Content Area */}
      {isLoading ? (
        /* Loading state per Docs/07_content-copy.md ("Loading…") */
        <div className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] p-12 text-center my-6">
          <div className="w-8 h-8 border-3 border-[#4132C7] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[14px] text-[#474554]">Loading…</p>
        </div>
      ) : fetchError ? (
        /* Error state with Retry trigger per Docs/07_content-copy.md ("Something went wrong." — Button: Retry) */
        <div className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] p-12 text-center my-6">
          <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#F93C65] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#121C2C]">Something went wrong.</p>
          <p className="text-[13px] text-[#777586] mt-1">{fetchError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-4 h-10 px-6 rounded-full bg-[#4132C7] text-white text-[14px] font-medium hover:bg-[#3527A8] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        /* Rendered data table and server-side pagination controls */
        <div className="space-y-0">
          <AuditLogTable items={items} />

          {/* Pagination Bar (attached to table when records exist) */}
          <AuditLogPagination
            pagination={paginationState}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
}
