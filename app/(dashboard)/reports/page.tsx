"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import type {
  QuarterlySalesRow,
  MostOrderedItemRow,
  CityRouteSalesRow,
  DriverAssistantHoursRow,
  TruckUsageMonthlyRow,
  CustomerOrderHistoryRow,
} from "@/lib/reports";

/**
 * ReportTab identifies the 6 management reports defined in SRS & Docs/05_api-and-pages.md.
 */
type ReportTab =
  | "quarterly-sales"
  | "most-ordered-items"
  | "city-route-sales"
  | "driver-assistant-hours"
  | "truck-usage"
  | "customer-history";

/**
 * Tab configuration metadata.
 */
interface TabMeta {
  id: ReportTab;
  label: string;
  description: string;
}

const TABS: TabMeta[] = [
  {
    id: "quarterly-sales",
    label: "Quarterly Sales",
    description: "Revenue and volume analysis broken down by quarter and financial year",
  },
  {
    id: "most-ordered-items",
    label: "Most Ordered Items",
    description: "Top-performing FMCG products by volume and total order value in a selected quarter",
  },
  {
    id: "city-route-sales",
    label: "City & Route Sales",
    description: "Geographic sales breakdown across destination cities and last-mile delivery routes",
  },
  {
    id: "driver-assistant-hours",
    label: "Driver & Assistant Hours",
    description: "Weekly roster hours, workload distribution, and compliance against 40h/60h limits",
  },
  {
    id: "truck-usage",
    label: "Truck Usage",
    description: "Monthly fleet vehicle utilization, operational hours, and trip frequency per station store",
  },
  {
    id: "customer-history",
    label: "Customer History",
    description: "Individual customer order progression, delivery timelines, and item details",
  },
];

/**
 * Interface representing a customer option for the customer history filter dropdown.
 */
interface CustomerOption {
  customer_id: number;
  customer_name: string;
  customer_type: string;
  registered_city_name?: string;
  phone?: string;
}

// ---------------------------------------------------------------------------
// Dynamic filter defaults — computed from the current date at module load time
// so they never go stale (reviewer issue #4).
// ---------------------------------------------------------------------------

/**
 * Formats a Date object as a YYYY-MM-DD string in the user's LOCAL timezone (reviewer issues B & D).
 * Avoids Date.toISOString() which converts to UTC and shifts dates backward in timezones like Asia/Colombo (UTC+5:30).
 */
function toLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns the local ISO date string (YYYY-MM-DD) of the Monday of the current week. */
function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysBack = day === 0 ? 6 : day - 1;
  now.setDate(now.getDate() - daysBack);
  return toLocalIsoDate(now);
}

/** Returns { from, to } covering the first day of last month to today in local timezone. */
function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = toLocalIsoDate(now);
  // First day of the previous calendar month
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const from = toLocalIsoDate(firstOfLastMonth);
  return { from, to };
}

const _now = new Date();
/** Current calendar year. */
const CURRENT_YEAR = _now.getFullYear();
/** Current calendar quarter (1–4). */
const CURRENT_QUARTER = Math.ceil((_now.getMonth() + 1) / 3);
/** Current calendar month (1–12). */
const CURRENT_MONTH = _now.getMonth() + 1;

/** Year dropdown options: current year going back 4 years. */
const YEAR_OPTIONS: number[] = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const _defaultDateRange = getDefaultDateRange();

/**
 * ReportsPage provides the operational management analytics interface for Kandypack.
 *
 * Page Architecture & Data Flow:
 * - Wires all 6 report tabs to live backend REST endpoints under `/api/reports/*`.
 * - Populates dynamic customer directory from `/api/customers`.
 * - Implements live parameter filters (year, quarter, month, date range, week start, customer).
 * - Displays loading skeletons, error alerts, and approved empty state copy from Docs/07_content-copy.md.
 * - Computes KPI cards and table footer totals dynamically.
 * - Triggers CSV exports directly via browser download from `/api/reports/:type/export/csv`.
 *
 * @returns {JSX.Element} The rendered Reports page component.
 */
export default function ReportsPage() {
  // Read the current user's role and auth hydration status from AuthContext (reviewer issue #1).
  // fleet_supervisor has reports.read but NOT reports.export (lib/rbac.ts line 250).
  const { role, isLoading: isAuthLoading } = useAuth();

  /** Counter tracking latest report fetch request ID to ignore stale out-of-order responses */
  const activeRequestIdRef = useRef<number>(0);

  /** True when the current role is permitted to export reports. */
  const canExport = role === "system_administrator" || role === "logistics_manager";

  /**
   * Filter TABS by user role (reviewer issue A & issue #1).
   * While auth is hydrating, returns an empty array to avoid flashing unauthorized tabs.
   * fleet_supervisor can only access operational/fleet reports: driver-assistant-hours and truck-usage.
   * system_administrator and logistics_manager retain access to all 6 reports.
   */
  const visibleTabs = useMemo(() => {
    if (isAuthLoading || !role) {
      return [];
    }
    if (role === "fleet_supervisor") {
      return TABS.filter(
        (t) => t.id === "driver-assistant-hours" || t.id === "truck-usage"
      );
    }
    return TABS;
  }, [role, isAuthLoading]);

  // --- Selected Tab State ---
  const [selectedTab, setSelectedTab] = useState<ReportTab>("quarterly-sales");

  /**
   * Derive the effective active tab based on role permissions (reviewer issue A).
   * If selectedTab is permitted for the user's role, use it;
   * otherwise immediately fallback to the first allowed tab (e.g. driver-assistant-hours for fleet_supervisor).
   * Computing during render eliminates setState-in-effect cascading render violations.
   */
  const activeTab: ReportTab = useMemo(() => {
    if (visibleTabs.some((t) => t.id === selectedTab)) {
      return selectedTab;
    }
    return visibleTabs[0]?.id ?? "quarterly-sales";
  }, [visibleTabs, selectedTab]);

  // --- Dynamic Filter Parameters (defaults derived from today — reviewer issue #4) ---
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  // null = "All quarters" (default for Quarterly Sales so the full comparison view loads first).
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  // Dedicated quarter state for Most Ordered Items which requires a non-null quarter (reviewer issue C).
  const [mostOrderedQuarter, setMostOrderedQuarter] = useState<number>(CURRENT_QUARTER);
  const [selectedMonth, setSelectedMonth] = useState<number>(CURRENT_MONTH);
  const [dateFrom, setDateFrom] = useState<string>(_defaultDateRange.from);
  const [dateTo, setDateTo] = useState<string>(_defaultDateRange.to);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(0);
  const [weekStart, setWeekStart] = useState<string>(getCurrentMonday());

  // --- Customers Directory State ---
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState<boolean>(false);

  // --- Report Data States ---
  const [quarterlySales, setQuarterlySales] = useState<QuarterlySalesRow[]>([]);
  const [mostOrderedItems, setMostOrderedItems] = useState<MostOrderedItemRow[]>([]);
  const [cityRouteSales, setCityRouteSales] = useState<CityRouteSalesRow[]>([]);
  const [driverAssistantHours, setDriverAssistantHours] = useState<DriverAssistantHoursRow[]>([]);
  const [truckUsage, setTruckUsage] = useState<TruckUsageMonthlyRow[]>([]);
  const [customerHistory, setCustomerHistory] = useState<CustomerOrderHistoryRow[]>([]);

  // --- Request Lifecycle & Feedback States ---
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /**
   * Formats numeric currency values into standardized Sri Lankan Rupees (LKR).
   *
   * @param {number | string} amount - Numeric value to format.
   * @returns {string} Formatted currency string (e.g. LKR 1,845,000.00).
   */
  const formatCurrency = (amount: number | string): string => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (Number.isNaN(num)) return "LKR 0.00";
    return `LKR ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  /**
   * Fetches customer accounts directory once auth is ready to populate Customer History selector.
   * Only fetches for roles that have access to Customer History (skips fleet_supervisor, reviewer issue #2).
   */
  useEffect(() => {
    if (isAuthLoading || !role || role === "fleet_supervisor") {
      return;
    }

    async function loadCustomers() {
      setIsLoadingCustomers(true);
      try {
        const res = await fetch("/api/customers");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            setCustomers(data.items);
            setSelectedCustomerId(data.items[0].customer_id);
          }
        }
      } catch (err) {
        console.error("Failed to load customer list for reports:", err);
      } finally {
        setIsLoadingCustomers(false);
      }
    }

    loadCustomers();
  }, [isAuthLoading, role]);

  /**
   * Fetches the report dataset corresponding to the specified tab with current filter parameters.
   *
   * @param {ReportTab} tab - The report tab to fetch.
   */
  const fetchReportData = useCallback(async (tab: ReportTab) => {
    // Wait until auth is resolved and user role is confirmed (reviewer issue #1)
    if (isAuthLoading || !role) {
      return;
    }

    // Guard against fetching reports not permitted for fleet_supervisor (reviewer issue A)
    if (role === "fleet_supervisor" && tab !== "driver-assistant-hours" && tab !== "truck-usage") {
      return;
    }

    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let endpoint = "";

      switch (tab) {
        case "quarterly-sales": {
          // When selectedQuarter is null, omit the quarter param to get all quarters
          // (the full year-over-year comparison the report exists for).
          const qParams = new URLSearchParams({ year: String(selectedYear) });
          if (selectedQuarter !== null) qParams.append("quarter", String(selectedQuarter));
          endpoint = `/api/reports/quarterly-sales?${qParams.toString()}`;
          break;
        }
        case "most-ordered-items":
          endpoint = `/api/reports/most-ordered-items?year=${selectedYear}&quarter=${mostOrderedQuarter}`;
          break;
        case "city-route-sales": {
          const params = new URLSearchParams();
          if (dateFrom) params.append("date_from", dateFrom);
          if (dateTo) params.append("date_to", dateTo);
          endpoint = `/api/reports/city-route-sales?${params.toString()}`;
          break;
        }
        case "driver-assistant-hours":
          if (!weekStart) {
            setDriverAssistantHours([]);
            setIsLoading(false);
            return;
          }
          endpoint = `/api/reports/driver-assistant-hours?week_start=${weekStart}`;
          break;
        case "truck-usage":
          endpoint = `/api/reports/truck-usage?year=${selectedYear}&month=${selectedMonth}`;
          break;
        case "customer-history":
          if (!selectedCustomerId) {
            setCustomerHistory([]);
            setIsLoading(false);
            return;
          }
          endpoint = `/api/reports/customer-history?customer_id=${selectedCustomerId}`;
          break;
      }

      const res = await fetch(endpoint);
      const json = await res.json();

      // If a newer request was dispatched while this was in flight, ignore the response (reviewer issue #1)
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }

      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to load report data.");
      }

      const items = json.items || [];

      switch (tab) {
        case "quarterly-sales":
          setQuarterlySales(items);
          break;
        case "most-ordered-items":
          setMostOrderedItems(items);
          break;
        case "city-route-sales":
          setCityRouteSales(items);
          break;
        case "driver-assistant-hours":
          setDriverAssistantHours(items);
          break;
        case "truck-usage":
          setTruckUsage(items);
          break;
        case "customer-history":
          setCustomerHistory(items);
          break;
      }
    } catch (err: unknown) {
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [isAuthLoading, role, selectedYear, selectedQuarter, mostOrderedQuarter, selectedMonth, dateFrom, dateTo, weekStart, selectedCustomerId]);

  /**
   * Refetches report data whenever active tab or auth status changes.
   * Uses a microtask deferral to prevent synchronous cascading re-renders.
   */
  useEffect(() => {
    if (isAuthLoading || !role) {
      return;
    }

    let ignore = false;
    const timer = setTimeout(() => {
      if (!ignore) {
        fetchReportData(activeTab);
      }
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [isAuthLoading, role, activeTab, fetchReportData]);

  /**
   * Handles immediate synchronous CSV export download from the server.
   */
  const handleExportCsv = (): void => {
    setIsExportingCsv(true);

    const params = new URLSearchParams();
    switch (activeTab) {
      case "quarterly-sales":
        params.append("year", String(selectedYear));
        // Omit quarter when "All quarters" is selected (selectedQuarter === null)
        if (selectedQuarter !== null) params.append("quarter", String(selectedQuarter));
        break;
      case "most-ordered-items":
        params.append("year", String(selectedYear));
        params.append("quarter", String(mostOrderedQuarter));
        break;
      case "city-route-sales":
        if (dateFrom) params.append("date_from", dateFrom);
        if (dateTo) params.append("date_to", dateTo);
        break;
      case "driver-assistant-hours":
        params.append("week_start", weekStart);
        break;
      case "truck-usage":
        params.append("year", String(selectedYear));
        params.append("month", String(selectedMonth));
        break;
      case "customer-history":
        params.append("customer_id", String(selectedCustomerId));
        break;
    }

    const downloadUrl = `/api/reports/${activeTab}/export/csv?${params.toString()}`;

    // Trigger browser file download without mutating window.location
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", "");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setIsExportingCsv(false);
      setToastMessage(`CSV export for ${TABS.find((t) => t.id === activeTab)?.label} initiated.`);
      setTimeout(() => setToastMessage(null), 4000);
    }, 800);
  };


  /**
   * Shows informational feedback regarding direct PDF report generation.
   * Aligned with Docs/03_architecture.md §11 and Docs/07_content-copy.md §/reports.
   */
  const handleExportPdf = (): void => {
    setIsExportingPdf(true);
    setTimeout(() => {
      setIsExportingPdf(false);
      setToastMessage("Direct PDF export will be enabled in Phase 3.");
      setTimeout(() => setToastMessage(null), 4000);
    }, 1000);
  };

  // --- Computed Totals & Metrics for Tabs ---

  const quarterlyTotals = useMemo(() => {
    const orders = quarterlySales.reduce((acc, row) => acc + row.num_orders, 0);
    const volume = quarterlySales.reduce((acc, row) => acc + row.total_volume, 0);
    const value = quarterlySales.reduce((acc, row) => acc + row.total_value, 0);
    return { orders, volume, value };
  }, [quarterlySales]);

  const mostOrderedTotals = useMemo(() => {
    const qty = mostOrderedItems.reduce((acc, row) => acc + row.total_quantity, 0);
    const val = mostOrderedItems.reduce((acc, row) => acc + row.total_value, 0);
    return { qty, val };
  }, [mostOrderedItems]);

  const cityRouteTotals = useMemo(() => {
    const orders = cityRouteSales.reduce((acc, row) => acc + row.num_orders, 0);
    const volume = cityRouteSales.reduce((acc, row) => acc + row.total_volume, 0);
    const value = cityRouteSales.reduce((acc, row) => acc + row.total_value, 0);
    return { orders, volume, value };
  }, [cityRouteSales]);

  const driversList = useMemo(
    () => driverAssistantHours.filter((row) => row.person_role === "driver"),
    [driverAssistantHours]
  );

  const assistantsList = useMemo(
    () => driverAssistantHours.filter((row) => row.person_role === "assistant"),
    [driverAssistantHours]
  );

  const activeCustomer = useMemo(
    () => customers.find((c) => c.customer_id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Show loading skeleton while authentication session is being hydrated (reviewer issue #1)
  if (isAuthLoading || !role) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="h-8 bg-[#E2E8F0] rounded-lg w-40" />
            <div className="h-4 bg-[#E2E8F0] rounded-md w-56 mt-2" />
          </div>
        </div>
        <div className="h-12 bg-[#E2E8F0] rounded-2xl w-full" />
        <div className="h-28 bg-[#E2E8F0] rounded-2xl w-full" />
        <div className="h-64 bg-[#E2E8F0] rounded-2xl w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification Container */}
      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-50 bg-[#121C2C] text-white px-5 py-3.5 rounded-xl shadow-lg flex items-center gap-3 transition-all transform animate-slide-up text-sm font-medium"
        >
          <div className="w-5 h-5 rounded-full bg-[#00B69B] flex items-center justify-center text-white text-xs font-bold">
            ✓
          </div>
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-3 text-white/60 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Page Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#121C2C]">
            Reports
          </h1>
          <p className="text-sm text-[#474554] mt-1">
            Business insights and exports
          </p>
        </div>

        {/* Export Toolbar Buttons — visible to system_administrator and logistics_manager only.
            fleet_supervisor has reports.read but not reports.export (lib/rbac.ts). */}
        {canExport && (
          <div className="flex items-center gap-2.5">
            {/* CSV Export Button */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExportingCsv || isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#C8C4D7] text-xs font-semibold text-[#121C2C] hover:bg-[#F0F3FF] transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4 text-[#474554]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{isExportingCsv ? "Exporting CSV…" : "Export CSV"}</span>
            </button>

            {/* PDF Export Button */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf || isLoading}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span>{isExportingPdf ? "Generating PDF…" : "Export PDF"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Report Tabs Navigation Bar — displays only tabs permitted for current user role */}
      <div className="bg-white p-1.5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
        <div className="flex overflow-x-auto gap-1 no-scrollbar">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-1 sm:flex-initial text-center cursor-pointer ${
                  active
                    ? "bg-[#5A4FE0] text-white font-semibold shadow-xs"
                    : "text-[#474554] hover:bg-[#F0F3FF] hover:text-[#121C2C]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Filter Controls Bar */}
      <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#121C2C]">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-[#474554] mt-0.5">
              {TABS.find((t) => t.id === activeTab)?.description}
            </p>
          </div>

          {/* Filter Inputs Tailored per Report */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Year Filter (Reports 1, 2, 5) — dynamic list from YEAR_OPTIONS */}
            {(activeTab === "quarterly-sales" ||
              activeTab === "most-ordered-items" ||
              activeTab === "truck-usage") && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#474554]">Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-1.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Quarter Filter (Report 1: Quarterly Sales — supports All quarters) */}
            {activeTab === "quarterly-sales" && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#474554]">Quarter:</label>
                <select
                  value={selectedQuarter ?? ""}
                  onChange={(e) =>
                    setSelectedQuarter(e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-1.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
                >
                  <option value="">All quarters</option>
                  <option value={1}>Q1 (Jan – Mar)</option>
                  <option value={2}>Q2 (Apr – Jun)</option>
                  <option value={3}>Q3 (Jul – Sep)</option>
                  <option value={4}>Q4 (Oct – Dec)</option>
                </select>
              </div>
            )}

            {/* Quarter Filter (Report 2: Most Ordered Items — requires specific quarter, reviewer issue C) */}
            {activeTab === "most-ordered-items" && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#474554]">Quarter:</label>
                <select
                  value={mostOrderedQuarter}
                  onChange={(e) => setMostOrderedQuarter(Number(e.target.value))}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-1.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
                >
                  <option value={1}>Q1 (Jan – Mar)</option>
                  <option value={2}>Q2 (Apr – Jun)</option>
                  <option value={3}>Q3 (Jul – Sep)</option>
                  <option value={4}>Q4 (Oct – Dec)</option>
                </select>
              </div>
            )}

            {/* Month Filter (Report 5) */}
            {activeTab === "truck-usage" && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#474554]">Month:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-1.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
                >
                  <option value={1}>January</option>
                  <option value={2}>February</option>
                  <option value={3}>March</option>
                  <option value={4}>April</option>
                  <option value={5}>May</option>
                  <option value={6}>June</option>
                  <option value={7}>July</option>
                  <option value={8}>August</option>
                  <option value={9}>September</option>
                  <option value={10}>October</option>
                  <option value={11}>November</option>
                  <option value={12}>December</option>
                </select>
              </div>
            )}

            {/* Date Range Filter (Report 3) */}
            {activeTab === "city-route-sales" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[#474554]">From:</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-2.5 py-1.5 text-[#121C2C]"
                />
                <label className="text-xs font-semibold text-[#474554]">To:</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-2.5 py-1.5 text-[#121C2C]"
                />
              </div>
            )}

            {/* Week Start Filter (Report 4) */}
            {activeTab === "driver-assistant-hours" && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#474554]">Week starting (Monday):</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Safely handle cleared input without throwing RangeError (reviewer issue B)
                    if (!val) {
                      setWeekStart("");
                      return;
                    }
                    // Parse year, month, day to construct a local Date, avoiding UTC shift bugs (reviewer issue B)
                    const parts = val.split("-").map(Number);
                    if (parts.length !== 3 || parts.some(Number.isNaN)) {
                      setWeekStart(val);
                      return;
                    }
                    const [y, m, d] = parts;
                    const picked = new Date(y, m - 1, d);
                    const day = picked.getDay(); // 0=Sun, 1=Mon … 6=Sat
                    const daysBack = day === 0 ? 6 : day - 1; // distance to Monday
                    picked.setDate(picked.getDate() - daysBack);
                    setWeekStart(toLocalIsoDate(picked));
                  }}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-2.5 py-1.5 text-[#121C2C]"
                />
              </div>
            )}

            {/* Customer Filter (Report 6) */}
            {activeTab === "customer-history" && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#474554]">Customer:</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                  disabled={isLoadingCustomers}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-1.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7] max-w-[220px] truncate"
                >
                  {customers.map((c) => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.customer_name} ({c.customer_type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Run Report CTA */}
            <button
              type="button"
              onClick={() => fetchReportData(activeTab)}
              disabled={isLoading}
              className="px-4 py-1.5 rounded-lg bg-[#5A4FE0] text-white text-xs font-semibold hover:bg-[#483CC4] transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Running…" : "Run Report"}
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert Display */}
      {errorMessage && (
        <div className="bg-[#FFF0F0] border border-[#F93C65]/30 text-[#F93C65] p-4 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">Error:</span>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[#F93C65] hover:underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* --- TAB 1: Quarterly Sales Report --- */}
      {activeTab === "quarterly-sales" && (
        <div className="space-y-5">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
                Total Orders Placed
              </p>
              <p className="text-2xl font-bold text-[#121C2C] mt-2">
                {isLoading ? "…" : quarterlyTotals.orders}
              </p>
              <p className="text-xs text-[#00B69B] mt-1 font-medium">Delivered orders only</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
                Total Sales Revenue
              </p>
              <p className="text-2xl font-bold text-[#4132C7] mt-2">
                {isLoading ? "…" : formatCurrency(quarterlyTotals.value)}
              </p>
              <p className="text-xs text-[#474554] mt-1">Retail & wholesale distribution</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
                Total Cargo Volume
              </p>
              <p className="text-2xl font-bold text-[#121C2C] mt-2">
                {isLoading ? "…" : `${quarterlyTotals.volume.toFixed(2)} units`}
              </p>
              <p className="text-xs text-[#474554] mt-1">Rail transport capacity utilized</p>
            </div>
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                    <th className="px-6 py-3.5">Financial Year</th>
                    <th className="px-6 py-3.5">Quarter</th>
                    <th className="px-6 py-3.5 text-center">Total Orders</th>
                    <th className="px-6 py-3.5 text-right">Volume (Space Units)</th>
                    <th className="px-6 py-3.5 text-right">Gross Sales Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-[#474554]">
                        Loading quarterly sales data…
                      </td>
                    </tr>
                  ) : quarterlySales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-[#474554] italic">
                        No sales recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    quarterlySales.map((row) => (
                      <tr key={`${row.sales_year}-Q${row.sales_quarter}`} className="hover:bg-[#F9F9FF] transition-colors">
                        <td className="px-6 py-4 font-semibold text-[#121C2C]">{row.sales_year}</td>
                        <td className="px-6 py-4 font-medium text-[#4132C7]">Q{row.sales_quarter}</td>
                        <td className="px-6 py-4 text-center font-mono">{row.num_orders}</td>
                        <td className="px-6 py-4 text-right font-mono">{row.total_volume.toFixed(2)} units</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                          {formatCurrency(row.total_value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!isLoading && quarterlySales.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#F9F9FF] border-t border-[#C8C4D7] font-semibold text-xs text-[#121C2C]">
                      <td colSpan={3} className="px-6 py-3.5">
                        Totals: {formatCurrency(quarterlyTotals.value)} · {quarterlyTotals.volume.toFixed(2)} units
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono">{quarterlyTotals.volume.toFixed(2)} units</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[#4132C7]">
                        {formatCurrency(quarterlyTotals.value)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: Most Ordered Items Report --- */}
      {activeTab === "most-ordered-items" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                    <th className="px-6 py-3.5">Rank</th>
                    <th className="px-6 py-3.5">Product ID</th>
                    <th className="px-6 py-3.5">Product Name</th>
                    <th className="px-6 py-3.5 text-right">Quantity Ordered</th>
                    <th className="px-6 py-3.5 text-right">Total Order Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-[#474554]">
                        Loading most ordered items…
                      </td>
                    </tr>
                  ) : mostOrderedItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-[#474554] italic">
                        No orders found for this quarter.
                      </td>
                    </tr>
                  ) : (
                    mostOrderedItems.map((item) => (
                      <tr key={item.product_id} className="hover:bg-[#F9F9FF] transition-colors">
                        <td className="px-6 py-4 font-bold text-[#4132C7]">#{item.quantity_rank}</td>
                        <td className="px-6 py-4 font-mono text-[#474554]">{item.product_id}</td>
                        <td className="px-6 py-4 font-semibold text-[#121C2C]">{item.product_name}</td>
                        <td className="px-6 py-4 text-right font-mono font-medium">{item.total_quantity.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                          {formatCurrency(item.total_value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!isLoading && mostOrderedItems.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#F9F9FF] border-t border-[#C8C4D7] font-semibold text-xs text-[#121C2C]">
                      <td colSpan={3} className="px-6 py-3.5">
                        Totals: {formatCurrency(mostOrderedTotals.val)} · {mostOrderedTotals.qty.toLocaleString()} units
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono">{mostOrderedTotals.qty.toLocaleString()}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[#4132C7]">
                        {formatCurrency(mostOrderedTotals.val)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: City & Route Sales Report --- */}
      {activeTab === "city-route-sales" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                    <th className="px-6 py-3.5">Destination City</th>
                    <th className="px-6 py-3.5">Route Name</th>
                    <th className="px-6 py-3.5 text-center">Orders Count</th>
                    <th className="px-6 py-3.5 text-right">Volume (Units)</th>
                    <th className="px-6 py-3.5 text-right">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-[#474554]">
                        Loading city & route sales data…
                      </td>
                    </tr>
                  ) : cityRouteSales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-[#474554] italic">
                        No sales data for the selected range.
                      </td>
                    </tr>
                  ) : (
                    cityRouteSales.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#F9F9FF] transition-colors">
                        <td className="px-6 py-4 font-semibold text-[#121C2C]">{row.city_name}</td>
                        <td className="px-6 py-4 text-[#474554]">{row.route_name || "Direct / Unassigned"}</td>
                        <td className="px-6 py-4 text-center font-mono">{row.num_orders}</td>
                        <td className="px-6 py-4 text-right font-mono">{row.total_volume.toFixed(2)} units</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                          {formatCurrency(row.total_value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!isLoading && cityRouteSales.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#F9F9FF] border-t border-[#C8C4D7] font-semibold text-xs text-[#121C2C]">
                      <td colSpan={3} className="px-6 py-3.5">
                        Totals: {formatCurrency(cityRouteTotals.value)} · {cityRouteTotals.volume.toFixed(2)} units
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono">{cityRouteTotals.volume.toFixed(2)} units</td>
                      <td className="px-6 py-3.5 text-right font-mono text-[#4132C7]">
                        {formatCurrency(cityRouteTotals.value)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: Driver & Assistant Hours Report --- */}
      {activeTab === "driver-assistant-hours" && (
        <div className="space-y-6">
          {/* Compliance Guidelines Alert Banner */}
          <div className="bg-[#F0F3FF] p-4 rounded-2xl border border-[#DEE8FF] flex items-start gap-3">
            <span className="text-base text-[#4132C7]">ℹ</span>
            <div className="text-xs text-[#474554]">
              <span className="font-semibold text-[#121C2C]">Roster Limit Guidelines: </span>
              Weekly limit for drivers is 40.0 hours (consecutive deliveries require break).
              Weekly limit for assistants is 60.0 hours (maximum 2 consecutive routes).
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Drivers Table */}
            <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-[#F0F3FF] flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#121C2C]">Drivers (Weekly Limit: 40h)</h3>
                <span className="text-xs text-[#474554]">{driversList.length} Scheduled</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                      <th className="px-5 py-3">Driver Name</th>
                      <th className="px-5 py-3 text-right">Logged Hours</th>
                      <th className="px-5 py-3 text-right">Remaining</th>
                      <th className="px-5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F3FF] text-xs">
                    {isLoading ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-[#474554]">
                          Loading drivers…
                        </td>
                      </tr>
                    ) : driversList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-[#474554] italic">
                          No scheduled hours for this week.
                        </td>
                      </tr>
                    ) : (
                      driversList.map((d) => {
                        const nearCap = d.remaining_hours <= 5.0;
                        return (
                          <tr key={d.person_id} className="hover:bg-[#F9F9FF]">
                            <td className="px-5 py-3.5 font-semibold text-[#121C2C]">{d.full_name}</td>
                            <td className="px-5 py-3.5 text-right font-mono">{d.total_hours.toFixed(1)}h</td>
                            <td className="px-5 py-3.5 text-right font-mono font-medium">{d.remaining_hours.toFixed(1)}h</td>
                            <td className="px-5 py-3.5 text-center">
                              {nearCap ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFF9E6] text-[#FFB800]">
                                  Near Cap
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E6F6F4] text-[#00B69B]">
                                  Healthy
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Assistants Table */}
            <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-[#F0F3FF] flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#121C2C]">Assistants (Weekly Limit: 60h)</h3>
                <span className="text-xs text-[#474554]">{assistantsList.length} Scheduled</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                      <th className="px-5 py-3">Assistant Name</th>
                      <th className="px-5 py-3 text-right">Logged Hours</th>
                      <th className="px-5 py-3 text-right">Remaining</th>
                      <th className="px-5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F3FF] text-xs">
                    {isLoading ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-[#474554]">
                          Loading assistants…
                        </td>
                      </tr>
                    ) : assistantsList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-[#474554] italic">
                          No scheduled hours for this week.
                        </td>
                      </tr>
                    ) : (
                      assistantsList.map((a) => {
                        const nearCap = a.remaining_hours <= 5.0;
                        return (
                          <tr key={a.person_id} className="hover:bg-[#F9F9FF]">
                            <td className="px-5 py-3.5 font-semibold text-[#121C2C]">{a.full_name}</td>
                            <td className="px-5 py-3.5 text-right font-mono">{a.total_hours.toFixed(1)}h</td>
                            <td className="px-5 py-3.5 text-right font-mono font-medium">{a.remaining_hours.toFixed(1)}h</td>
                            <td className="px-5 py-3.5 text-center">
                              {nearCap ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFF9E6] text-[#FFB800]">
                                  Near Cap
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E6F6F4] text-[#00B69B]">
                                  Healthy
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 5: Truck Usage Report --- */}
      {activeTab === "truck-usage" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                    <th className="px-6 py-3.5">Truck ID</th>
                    <th className="px-6 py-3.5">Plate Number</th>
                    <th className="px-6 py-3.5">Usage Month</th>
                    <th className="px-6 py-3.5 text-center">Delivery Schedules</th>
                    <th className="px-6 py-3.5 text-right">In-Service Hours</th>
                    <th className="px-6 py-3.5 text-center">Routes Covered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-[#474554]">
                        Loading truck usage statistics…
                      </td>
                    </tr>
                  ) : truckUsage.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-[#474554] italic">
                        No truck activity this month.
                      </td>
                    </tr>
                  ) : (
                    truckUsage.map((t) => (
                      <tr key={t.truck_id} className="hover:bg-[#F9F9FF] transition-colors">
                        <td className="px-6 py-4 font-mono text-[#474554]">#{t.truck_id}</td>
                        <td className="px-6 py-4 font-mono font-bold text-[#4132C7]">{t.plate_number}</td>
                        <td className="px-6 py-4 text-[#121C2C]">{t.usage_month}</td>
                        <td className="px-6 py-4 text-center font-mono font-semibold">{t.num_schedules}</td>
                        <td className="px-6 py-4 text-right font-mono font-medium">{t.total_hours.toFixed(1)} hrs</td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E0F2FF] text-[#0047CC]">
                            {t.distinct_routes_covered} routes
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 6: Customer History Report --- */}
      {activeTab === "customer-history" && (
        <div className="space-y-5">
          {/* Customer Overview Header */}
          {activeCustomer && (
            <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#4132C7]">
                  Customer Account #{activeCustomer.customer_id}
                </span>
                <h3 className="text-lg font-bold text-[#121C2C]">{activeCustomer.customer_name}</h3>
                <p className="text-xs text-[#474554] mt-0.5">
                  Type: <span className="font-semibold capitalize text-[#121C2C]">{activeCustomer.customer_type}</span>
                  {activeCustomer.phone && ` · Phone: ${activeCustomer.phone}`}
                  {activeCustomer.registered_city_name && ` · City: ${activeCustomer.registered_city_name}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#474554]">Total Recorded Orders</p>
                <p className="text-xl font-bold text-[#4132C7]">
                  {isLoading ? "…" : `${customerHistory.length} Orders`}
                </p>
              </div>
            </div>
          )}

          {/* Orders History Table */}
          <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                    <th className="px-6 py-3.5">Order ID</th>
                    <th className="px-6 py-3.5">Placed On</th>
                    <th className="px-6 py-3.5">Expected Delivery</th>
                    <th className="px-6 py-3.5">Delivered Timestamp</th>
                    <th className="px-6 py-3.5">Truck / Driver</th>
                    <th className="px-6 py-3.5 text-right">Order Value</th>
                    <th className="px-6 py-3.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-[#474554]">
                        Loading customer order history…
                      </td>
                    </tr>
                  ) : customerHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-[#474554] italic">
                        Select a customer to view their order history.
                      </td>
                    </tr>
                  ) : (
                    customerHistory.map((ord) => {
                      const isDelivered = ord.status === "Delivered";
                      const isCancelled = ord.status === "Cancelled";
                      return (
                        <tr key={ord.order_id} className="hover:bg-[#F9F9FF] transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-[#4132C7]">#{ord.order_id}</td>
                          <td className="px-6 py-4 text-[#474554]">
                            {typeof ord.order_placed_at === "string" ? ord.order_placed_at.split("T")[0] : ord.order_placed_at}
                          </td>
                          <td className="px-6 py-4 text-[#474554]">
                            {typeof ord.expected_delivery_date === "string" ? ord.expected_delivery_date.split("T")[0] : ord.expected_delivery_date}
                          </td>
                          <td className="px-6 py-4 text-[#474554]">
                            {ord.delivered_at ? (typeof ord.delivered_at === "string" ? ord.delivered_at.replace("T", " ").substring(0, 16) : ord.delivered_at) : "—"}
                          </td>
                          <td className="px-6 py-4 text-[#121C2C] font-medium">
                            {ord.truck_plate ? `${ord.truck_plate} (${ord.driver_name || "Assigned"})` : "Not scheduled"}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                            {formatCurrency(ord.total_value)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                isDelivered
                                  ? "bg-[#E6F6F4] text-[#00B69B]"
                                  : isCancelled
                                  ? "bg-[#FFF0F0] text-[#F93C65]"
                                  : "bg-[#FFF9E6] text-[#FFB800]"
                              }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
