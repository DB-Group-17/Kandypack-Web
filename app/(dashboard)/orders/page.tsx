"use client";

/**
 * @file app/(dashboard)/orders/page.tsx
 * @description Orders List page — the primary workspace for viewing, filtering, and
 * navigating to customer orders.
 *
 * Page Architecture & Data Flow:
 * - Fetches a paginated, filtered list of orders from `GET /api/orders`.
 * - Filters (status, destination city, date range, search) are mirrored into the URL
 *   query string via `router.replace()`, so the view is shareable and survives a refresh.
 * - The destination-city filter options are loaded once from `GET /api/cities?destination_only=true`
 *   (reused from Member 4's cities endpoint) instead of a hardcoded city list.
 * - Search input is debounced 300ms before triggering a request, to avoid firing a
 *   network call on every keystroke.
 * - Role-aware UI: the City filter is hidden for `store_manager` accounts because the
 *   API already forces their results to their assigned store's city; the "+ New Order"
 *   button is hidden for roles without `orders:place_order` permission.
 * - Row click navigates to `/orders/[orderId]` (order detail, not yet built as of this task).
 *
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §5,
 *   Docs/05_api-and-pages.md §A4, Docs/07_content-copy.md §/orders
 * Visual System: DESIGN.md, Docs/11_ui-rules.md
 * Owner: Member 1 (Dineth)
 */

import React, { Suspense, useState, useEffect, useCallback, useId, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { hasPermission } from "@/lib/rbac";

/**
 * Canonical order status values, matching the `orders.status` enum in the database
 * and the badge copy in Docs/07_content-copy.md §/orders.
 */
type OrderStatus =
  | "Pending"
  | "In Transit"
  | "At Store"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled";

/**
 * Single order row as returned by `GET /api/orders` (mirrors `OrderListItemRow`
 * in app/api/orders/route.ts).
 */
interface OrderListItem {
  order_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  destination_city_id: number;
  destination_city: string;
  delivery_area: string;
  delivery_address: string;
  route_id: number | null;
  order_placed_at: string;
  expected_delivery_date: string;
  status: OrderStatus;
  total_value: string;
  total_space_required: string;
}

/** Paginated envelope returned by `GET /api/orders`. */
interface OrdersResponse {
  items: OrderListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Destination city option, sourced from `GET /api/cities`. */
interface CityOption {
  city_id: number;
  city_name: string;
}

/** Fixed page size for the orders table (matches the API default). */
const PAGE_SIZE = 10;

/** All selectable statuses for the Status filter, in display order. */
const STATUS_OPTIONS: OrderStatus[] = [
  "Pending",
  "In Transit",
  "At Store",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
];

/**
 * Formats an ISO/SQL datetime string into a short human-readable date, e.g. "Oct 24, 2023".
 * Falls back to the raw string if parsing fails, so malformed data never crashes the row.
 *
 * @param {string} value - Date or datetime string from the API.
 * @returns {string} Formatted calendar date.
 */
function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Formats a numeric string total value as Sri Lankan Rupees, e.g. "Rs. 145,000".
 * The API returns DECIMAL columns as strings to avoid floating-point rounding.
 *
 * @param {string} value - Decimal string total value.
 * @returns {string} Formatted currency string.
 */
function formatCurrency(value: string): string {
  const numeric = Number(value);
  if (isNaN(numeric)) return `Rs. ${value}`;
  return `Rs. ${numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * Returns the semantic pill badge for a given order status, matching
 * DESIGN.md's status color language and Docs/07_content-copy.md badge text.
 *
 * @param {OrderStatus} status - The order's current status.
 * @returns {JSX.Element} The rendered status badge.
 */
function StatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    Pending: "bg-[#E0F2FF] text-[#0047CC]",
    "In Transit": "bg-[#EBE9FE] text-[#5B3CDD]",
    "At Store": "bg-[#FFF9E6] text-[#FFB800]",
    "Out for Delivery": "bg-[#F0F3FF] text-[#474554]",
    Delivered: "bg-[#E6F6F4] text-[#00B69B]",
    Cancelled: "bg-[#FFF0F0] text-[#F93C65]",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/**
 * OrdersPage renders the filterable, paginated list of customer orders.
 * Owns all filter/pagination state, syncs it to the URL, fetches from the API,
 * and renders loading/error/empty/populated states for the results table.
 *
 * @returns {JSX.Element} The interactive Orders list page component.
 */
function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useAuth();

  // --- Data & Async States ---
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Destination city options (for the City filter dropdown) ---
  const [cities, setCities] = useState<CityOption[]>([]);

  // --- Filter States (initial values hydrated from the URL, so a shared/bookmarked
  //     link or a page refresh reproduces the same filtered view) ---
  const [status, setStatus] = useState<string>(searchParams.get("status") || "All");
  const [cityId, setCityId] = useState<string>(searchParams.get("city_id") || "All");
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get("date_from") || "");
  const [dateTo, setDateTo] = useState<string>(searchParams.get("date_to") || "");
  const [searchInput, setSearchInput] = useState<string>(searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState<string>(searchParams.get("search") || "");
  const [page, setPage] = useState<number>(Number(searchParams.get("page")) || 1);

  // --- Accessible Form Element IDs ---
  const searchInputId = useId();
  const statusSelectId = useId();
  const citySelectId = useId();
  const dateFromId = useId();
  const dateToId = useId();

  /** Tracks whether the destination-city list has already been fetched once. */
  const citiesFetchedRef = useRef<boolean>(false);

  /**
   * Determines whether the current role may place new orders, controlling
   * visibility of the "+ New Order" call-to-action.
   */
  const canPlaceOrder = useMemo(() => {
    return role ? hasPermission(role, "orders", "place_order") : false;
  }, [role]);

  /**
   * Store managers are already forced to their own city server-side, so the
   * City filter would be misleading (and always a no-op) for that role.
   */
  const showCityFilter = role !== "store_manager";

  // Debounce the free-text search box: reset a 300ms timer on every keystroke so a
  // network request only fires once the user pauses typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load the destination-city options once for the City filter dropdown.
  useEffect(() => {
    if (citiesFetchedRef.current) return;
    citiesFetchedRef.current = true;

    const loadCities = async () => {
      try {
        const response = await fetch("/api/cities?destination_only=true", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        setCities(
          (data.items || []).map((c: { city_id: number; city_name: string }) => ({
            city_id: c.city_id,
            city_name: c.city_name,
          }))
        );
      } catch (err) {
        // Non-fatal: the City filter simply stays empty if this fails.
        console.error("Failed to load destination cities:", err);
      }
    };

    loadCities();
  }, []);

  /**
   * Builds the query string for the current filter/pagination state.
   * Shared by the fetch call and the URL-sync effect so both stay in lockstep.
   */
  const buildQueryString = useCallback((): string => {
    const params = new URLSearchParams();
    if (status !== "All") params.set("status", status);
    if (cityId !== "All") params.set("city_id", cityId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    return params.toString();
  }, [status, cityId, dateFrom, dateTo, debouncedSearch, page]);

  /**
   * Fetches the current page of orders from `GET /api/orders` using the active
   * filter state. Used for the initial load, filter changes, and the Retry button.
   */
  const fetchOrders = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const response = await fetch(`/api/orders?${buildQueryString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || "Couldn't load orders. Please try again."
        );
      }

      const data: OrdersResponse = await response.json();
      setOrders(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err: unknown) {
      console.error("Failed to load orders:", err);
      setFetchError(
        err instanceof Error ? err.message : "Couldn't load orders. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [buildQueryString]);

  // Re-fetch whenever the filter/pagination state changes, and mirror it into the
  // URL (replace, not push, so filtering doesn't spam the browser back-button history).
  // The loader is defined inline (rather than invoking the memoized `fetchOrders`
  // directly) so an in-flight request from a stale filter combination never
  // overwrites a newer one, via the `ignore` guard below.
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setIsLoading(true);
      setFetchError(null);

      try {
        const response = await fetch(`/api/orders?${buildQueryString()}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || "Couldn't load orders. Please try again."
          );
        }

        const data: OrdersResponse = await response.json();
        if (ignore) return;
        setOrders(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      } catch (err: unknown) {
        console.error("Failed to load orders:", err);
        if (!ignore) {
          setFetchError(
            err instanceof Error ? err.message : "Couldn't load orders. Please try again."
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };

    load();

    const queryString = buildQueryString();
    router.replace(queryString ? `/orders?${queryString}` : "/orders", { scroll: false });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cityId, dateFrom, dateTo, debouncedSearch, page]);

  /** Navigates to the order detail page for the clicked row. */
  const handleRowClick = (orderId: number): void => {
    router.push(`/orders/${orderId}`);
  };

  /**
   * Wraps a filter setter so changing any filter also resets pagination back to
   * page 1 (the previously selected page may not exist under the new filter set).
   */
  const applyFilter = <T,>(setter: (value: T) => void) => (value: T): void => {
    setter(value);
    setPage(1);
  };

  const handleStatusChange = applyFilter(setStatus);
  const handleCityChange = applyFilter(setCityId);
  const handleDateFromChange = applyFilter(setDateFrom);
  const handleDateToChange = applyFilter(setDateTo);

  /** Clears every filter back to its default (unfiltered) state. */
  const handleClearFilters = (): void => {
    setStatus("All");
    setCityId("All");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setPage(1);
  };

  const hasActiveFilters =
    status !== "All" || cityId !== "All" || !!dateFrom || !!dateTo || !!searchInput;

  // Range shown in the "Showing X–Y of Z orders" pagination footer.
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      {/* Page Header per Docs/07_content-copy.md §/orders */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#121C2C]">
            Orders
          </h1>
          <p className="text-sm text-[#474554] mt-1">
            Manage and track customer orders
          </p>
        </div>

        {/* Primary CTA — only shown to roles permitted to place orders */}
        {canPlaceOrder && (
          <button
            type="button"
            onClick={() => router.push("/orders/new")}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-sm font-semibold hover:bg-[#3427A8] transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Order</span>
          </button>
        )}
      </div>

      {/* Filter Bar per Docs/07_content-copy.md §/orders */}
      <div className="bg-white p-4 rounded-2xl border border-[#C8C4D7]/40 shadow-xs flex flex-col lg:flex-row gap-4 lg:items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777586]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
          </span>
          <label htmlFor={searchInputId} className="sr-only">
            Search orders
          </label>
          <input
            id={searchInputId}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by customer name or order ID…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#C8C4D7] rounded-lg text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <label htmlFor={statusSelectId} className="text-xs font-semibold text-[#474554] whitespace-nowrap">
            Status:
          </label>
          <select
            id={statusSelectId}
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-xs font-medium bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-2 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
          >
            <option value="All">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* City filter — hidden for store managers, who are always scoped server-side */}
        {showCityFilter && (
          <div className="flex items-center gap-2">
            <label htmlFor={citySelectId} className="text-xs font-semibold text-[#474554] whitespace-nowrap">
              City:
            </label>
            <select
              id={citySelectId}
              value={cityId}
              onChange={(e) => handleCityChange(e.target.value)}
              className="text-xs font-medium bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-2 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
            >
              <option value="All">All cities</option>
              {cities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.city_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <label htmlFor={dateFromId} className="text-xs font-semibold text-[#474554] whitespace-nowrap">
            From:
          </label>
          <input
            id={dateFromId}
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-2 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
          />
          <label htmlFor={dateToId} className="text-xs font-semibold text-[#474554] whitespace-nowrap">
            To:
          </label>
          <input
            id={dateToId}
            type="date"
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-2 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-xs font-semibold text-[#4132C7] hover:text-[#3427A8] whitespace-nowrap px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Main Content Area: Loading, Error, Empty, or Table */}
      {isLoading ? (
        /* Loading State per Docs/07_content-copy.md §/orders */
        <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 p-12 text-center shadow-xs">
          <div className="inline-block w-8 h-8 border-3 border-[#4132C7]/30 border-t-[#4132C7] rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-[#121C2C]">Loading orders…</p>
        </div>
      ) : fetchError ? (
        /* Error State with Retry Button */
        <div className="bg-white rounded-2xl border border-[#F93C65]/30 p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#F93C65] mx-auto flex items-center justify-center mb-3 text-lg font-bold">
            ⚠
          </div>
          <h3 className="text-base font-semibold text-[#121C2C]">{fetchError}</h3>
          <button
            type="button"
            onClick={() => fetchOrders()}
            className="mt-4 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-xs"
          >
            Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        /* Empty State per Docs/07_content-copy.md §/orders */
        <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#F0F3FF] text-[#4132C7] mx-auto flex items-center justify-center mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[#121C2C]">No orders found</h3>
          <p className="text-xs text-[#474554] mt-1 max-w-sm mx-auto">
            Try adjusting your filters, or create a new order to get started.
          </p>
          {canPlaceOrder && (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => router.push("/orders/new")}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all"
              >
                + New Order
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Populated Table + Pagination */
        <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                  <th className="px-5 py-3.5">Order ID</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Destination</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Placed On</th>
                  <th className="px-5 py-3.5">Expected Delivery</th>
                  <th className="px-5 py-3.5 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3FF] text-xs">
                {orders.map((order) => (
                  <tr
                    key={order.order_id}
                    onClick={() => handleRowClick(order.order_id)}
                    className="hover:bg-[#F9F9FF] transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4 font-mono font-semibold text-[#4132C7]">
                      #ORD-{order.order_id}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-[#121C2C]">{order.customer_name}</div>
                      <div className="text-[11px] text-[#474554]">{order.customer_phone}</div>
                    </td>
                    <td className="px-5 py-4 text-[#121C2C]">
                      {order.delivery_area}, {order.destination_city}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-4 text-[#474554]">
                      {formatDate(order.order_placed_at)}
                    </td>
                    <td className="px-5 py-4 text-[#474554]">
                      {formatDate(order.expected_delivery_date)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#121C2C] text-right">
                      {formatCurrency(order.total_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer per Docs/07_content-copy.md §/orders */}
          <div className="mt-auto px-5 py-4 border-t border-[#F0F3FF] flex items-center justify-between">
            <span className="text-xs text-[#474554]">
              Showing {rangeStart}–{rangeEnd} of {total} orders
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-4 py-2 border border-[#C8C4D7] rounded-lg text-xs font-semibold text-[#121C2C] hover:bg-[#F0F3FF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-4 py-2 border border-[#C8C4D7] rounded-lg text-xs font-semibold text-[#121C2C] hover:bg-[#F0F3FF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * OrdersPage is the routed page component. It wraps `OrdersPageContent` in a
 * Suspense boundary because that component reads `useSearchParams()`, which
 * Next.js requires to be suspended during static prerendering.
 *
 * @returns {JSX.Element} The Orders list page, suspense-wrapped.
 */
export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 p-12 text-center shadow-xs">
          <div className="inline-block w-8 h-8 border-3 border-[#4132C7]/30 border-t-[#4132C7] rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-[#121C2C]">Loading orders…</p>
        </div>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}
