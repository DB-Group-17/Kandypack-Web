"use client";

import React, { useState } from "react";

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
 * ReportsPage provides the operational management analytics interface.
 *
 * Page Architecture & Data Flow:
 * - Implements 6 distinct report tabs matching SRS §Expected Management Reports and Docs/05_api-and-pages.md §A9.
 * - Dynamic parameter filter bar adapts according to the active report tab (year, quarter, date range, customer).
 * - Generates live data previews, KPI summary counters, formatted data tables, and table footer totals.
 * - Simulates synchronous CSV export download and PDF generation states with toast feedback.
 *
 * @returns {JSX.Element} The rendered Reports static page shell.
 */
export default function ReportsPage() {
  // --- Active Tab & Filter State ---
  const [activeTab, setActiveTab] = useState<ReportTab>("quarterly-sales");
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(3);
  const [selectedMonth, setSelectedMonth] = useState<number>(9);
  const [dateFrom, setDateFrom] = useState<string>("2026-08-01");
  const [dateTo, setDateTo] = useState<string>("2026-09-01");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [weekStart, setWeekStart] = useState<string>("2026-08-31");

  // Export and Notification Feedback States
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /**
   * Simulates immediate synchronous CSV export download.
   */
  const handleExportCsv = (): void => {
    setIsExportingCsv(true);
    setTimeout(() => {
      setIsExportingCsv(false);
      setToastMessage(`CSV export for ${TABS.find((t) => t.id === activeTab)?.label} started.`);
      setTimeout(() => setToastMessage(null), 4000);
    }, 600);
  };

  /**
   * Simulates synchronous direct PDF generation with intermediate progress states.
   * Aligned with Docs/03_architecture.md §11 and Docs/07_content-copy.md §/reports.
   */
  const handleExportPdf = (): void => {
    setIsExportingPdf(true);
    setTimeout(() => {
      setIsExportingPdf(false);
      setToastMessage("Your PDF report is ready.");
      setTimeout(() => setToastMessage(null), 4000);
    }, 1400);
  };

  /**
   * Formats numeric currency values with commas and two decimal places.
   *
   * @param {number | string} amount - Value to format.
   * @returns {string} Formatted currency string.
   */
  const formatCurrency = (amount: number | string): string => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return `LKR ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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

        {/* Export Toolbar Buttons */}
        <div className="flex items-center gap-2.5">
          {/* CSV Export Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExportingCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#C8C4D7] text-xs font-semibold text-[#121C2C] hover:bg-[#F0F3FF] transition-all shadow-xs disabled:opacity-50"
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
            disabled={isExportingPdf}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>{isExportingPdf ? "Generating PDF…" : "Export PDF"}</span>
          </button>
        </div>
      </div>

      {/* Report Tabs Navigation Bar */}
      <div className="bg-white p-1.5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
        <div className="flex overflow-x-auto gap-1 no-scrollbar">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-1 sm:flex-initial text-center ${
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
            {/* Year Filter (Reports 1, 2, 5) */}
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
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>
              </div>
            )}

            {/* Quarter Filter (Reports 1, 2) */}
            {(activeTab === "quarterly-sales" ||
              activeTab === "most-ordered-items") && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#474554]">Quarter:</label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-1.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
                >
                  <option value={1}>Q1 (Jan - Mar)</option>
                  <option value={2}>Q2 (Apr - Jun)</option>
                  <option value={3}>Q3 (Jul - Sep)</option>
                  <option value={4}>Q4 (Oct - Dec)</option>
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
                  <option value={7}>July</option>
                  <option value={8}>August</option>
                  <option value={9}>September</option>
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
                <label className="text-xs font-semibold text-[#474554]">Week starting:</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
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
                  className="text-xs bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-1.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
                >
                  <option value={1}>Colombo Retail Mart (Retail)</option>
                  <option value={3}>Colombo Wholesale Distributors (Wholesale)</option>
                  <option value={5}>Negombo Retail Mart (Retail)</option>
                  <option value={9}>Galle Trading Co. (Wholesale)</option>
                  <option value={13}>Jaffna Family Store (Retail)</option>
                </select>
              </div>
            )}

            {/* Run Report CTA */}
            <button
              type="button"
              className="px-4 py-1.5 rounded-lg bg-[#5A4FE0] text-white text-xs font-semibold hover:bg-[#483CC4] transition-all shadow-xs"
            >
              Run Report
            </button>
          </div>
        </div>
      </div>

      {/* Tab Specific Content Renderers */}

      {/* --- TAB 1: Quarterly Sales Report --- */}
      {activeTab === "quarterly-sales" && (
        <div className="space-y-5">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
                Total Orders Placed
              </p>
              <p className="text-2xl font-bold text-[#121C2C] mt-2">45</p>
              <p className="text-xs text-[#00B69B] mt-1 font-medium">Across all 6 destination cities</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
                Total Sales Revenue
              </p>
              <p className="text-2xl font-bold text-[#4132C7] mt-2">
                {formatCurrency(1845000)}
              </p>
              <p className="text-xs text-[#474554] mt-1">Retail & wholesale distribution</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
                Total Cargo Volume
              </p>
              <p className="text-2xl font-bold text-[#121C2C] mt-2">2,450.00 units</p>
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
                  <tr className="hover:bg-[#F9F9FF] transition-colors">
                    <td className="px-6 py-4 font-semibold text-[#121C2C]">2026</td>
                    <td className="px-6 py-4 font-medium text-[#4132C7]">Q3 (Current)</td>
                    <td className="px-6 py-4 text-center font-mono">20</td>
                    <td className="px-6 py-4 text-right font-mono">1,120.00 units</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                      {formatCurrency(870000)}
                    </td>
                  </tr>
                  <tr className="hover:bg-[#F9F9FF] transition-colors">
                    <td className="px-6 py-4 font-semibold text-[#121C2C]">2026</td>
                    <td className="px-6 py-4 font-medium text-[#474554]">Q2 (Completed)</td>
                    <td className="px-6 py-4 text-center font-mono">25</td>
                    <td className="px-6 py-4 text-right font-mono">1,330.00 units</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                      {formatCurrency(975000)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-[#F9F9FF] border-t border-[#C8C4D7] font-semibold text-xs text-[#121C2C]">
                    <td colSpan={3} className="px-6 py-3.5">
                      Totals: {formatCurrency(1845000)} · 2,450.00 units
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono">2,450.00 units</td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#4132C7]">
                      {formatCurrency(1845000)}
                    </td>
                  </tr>
                </tfoot>
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
                    <th className="px-6 py-3.5">SKU</th>
                    <th className="px-6 py-3.5">Product Name</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5 text-right">Quantity Ordered</th>
                    <th className="px-6 py-3.5 text-right">Total Order Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {[
                    { rank: 1, sku: "DET-1KG", name: "Detergent Powder 1kg", cat: "Household", qty: 850, val: 382500 },
                    { rank: 2, sku: "RICE-5KG", name: "Rice 5kg Bag", cat: "Food", qty: 420, val: 378000 },
                    { rank: 3, sku: "NOOD-24", name: "Instant Noodles Box (24)", cat: "Food", qty: 310, val: 372000 },
                    { rank: 4, sku: "COCO-1L", name: "Coconut Oil 1L", cat: "Food", qty: 340, val: 221000 },
                    { rank: 5, sku: "BISC-FAM", name: "Biscuits Family Pack", cat: "Food", qty: 650, val: 143000 },
                    { rank: 6, sku: "TEA-400G", name: "Tea Powder 400g", cat: "Food", qty: 380, val: 133000 },
                  ].map((item) => (
                    <tr key={item.sku} className="hover:bg-[#F9F9FF] transition-colors">
                      <td className="px-6 py-4 font-bold text-[#4132C7]">#{item.rank}</td>
                      <td className="px-6 py-4 font-mono text-[#474554]">{item.sku}</td>
                      <td className="px-6 py-4 font-semibold text-[#121C2C]">{item.name}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0F3FF] text-[#5A4FE0]">
                          {item.cat}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-medium">{item.qty.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                        {formatCurrency(item.val)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F9F9FF] border-t border-[#C8C4D7] font-semibold text-xs text-[#121C2C]">
                    <td colSpan={4} className="px-6 py-3.5">
                      Totals: {formatCurrency(1629500)} · 2,950 units
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono">2,950</td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#4132C7]">
                      {formatCurrency(1629500)}
                    </td>
                  </tr>
                </tfoot>
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
                    <th className="px-6 py-3.5 text-right">Space Utilized</th>
                    <th className="px-6 py-3.5 text-right">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {[
                    { city: "Colombo", route: "Colombo North Route", orders: 14, space: "460.00", rev: 490000 },
                    { city: "Colombo", route: "Colombo South Route", orders: 12, space: "410.00", rev: 415000 },
                    { city: "Negombo", route: "Negombo Central Route", orders: 8, space: "280.00", rev: 295000 },
                    { city: "Galle", route: "Galle Coastal Route", orders: 5, space: "190.00", rev: 210000 },
                    { city: "Matara", route: "Matara Town Route", orders: 4, space: "150.00", rev: 185000 },
                    { city: "Jaffna", route: "Jaffna Peninsula Route", orders: 6, space: "240.00", rev: 250000 },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#F9F9FF] transition-colors">
                      <td className="px-6 py-4 font-semibold text-[#121C2C]">{row.city}</td>
                      <td className="px-6 py-4 text-[#474554]">{row.route}</td>
                      <td className="px-6 py-4 text-center font-mono">{row.orders}</td>
                      <td className="px-6 py-4 text-right font-mono">{row.space} units</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                        {formatCurrency(row.rev)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F9F9FF] border-t border-[#C8C4D7] font-semibold text-xs text-[#121C2C]">
                    <td colSpan={3} className="px-6 py-3.5">
                      Totals: {formatCurrency(1845000)} · 1,730.00 units
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono">1,730.00 units</td>
                    <td className="px-6 py-3.5 text-right font-mono text-[#4132C7]">
                      {formatCurrency(1845000)}
                    </td>
                  </tr>
                </tfoot>
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
                <span className="text-xs text-[#474554]">8 Active Drivers</span>
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
                    {[
                      { name: "Sunil Perera", hours: 32.5, rem: 7.5, alert: false },
                      { name: "Anura Kumara", hours: 38.0, rem: 2.0, alert: true },
                      { name: "Nimal Fernando", hours: 24.0, rem: 16.0, alert: false },
                      { name: "Bandula Silva", hours: 28.0, rem: 12.0, alert: false },
                    ].map((d) => (
                      <tr key={d.name} className="hover:bg-[#F9F9FF]">
                        <td className="px-5 py-3.5 font-semibold text-[#121C2C]">{d.name}</td>
                        <td className="px-5 py-3.5 text-right font-mono">{d.hours.toFixed(1)}h</td>
                        <td className="px-5 py-3.5 text-right font-mono font-medium">{d.rem.toFixed(1)}h</td>
                        <td className="px-5 py-3.5 text-center">
                          {d.alert ? (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Assistants Table */}
            <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-[#F0F3FF] flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#121C2C]">Assistants (Weekly Limit: 60h)</h3>
                <span className="text-xs text-[#474554]">8 Active Assistants</span>
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
                    {[
                      { name: "Kamal Silva", hours: 48.0, rem: 12.0, alert: false },
                      { name: "Ruwan Senarath", hours: 56.5, rem: 3.5, alert: true },
                      { name: "Janaka Jayasuriya", hours: 38.0, rem: 22.0, alert: false },
                      { name: "Suresh Perera", hours: 42.0, rem: 18.0, alert: false },
                    ].map((a) => (
                      <tr key={a.name} className="hover:bg-[#F9F9FF]">
                        <td className="px-5 py-3.5 font-semibold text-[#121C2C]">{a.name}</td>
                        <td className="px-5 py-3.5 text-right font-mono">{a.hours.toFixed(1)}h</td>
                        <td className="px-5 py-3.5 text-right font-mono font-medium">{a.rem.toFixed(1)}h</td>
                        <td className="px-5 py-3.5 text-center">
                          {a.alert ? (
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
                    ))}
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
                    <th className="px-6 py-3.5">Truck Plate</th>
                    <th className="px-6 py-3.5">Home Store Location</th>
                    <th className="px-6 py-3.5 text-center">Total Trips</th>
                    <th className="px-6 py-3.5 text-center">Active Days</th>
                    <th className="px-6 py-3.5 text-right">Operating Hours</th>
                    <th className="px-6 py-3.5 text-right">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {[
                    { plate: "NB-1001", store: "Colombo Station Store", trips: 22, days: 19, hours: 88.0, util: "82%" },
                    { plate: "NB-1002", store: "Negombo Station Store", trips: 18, days: 16, hours: 72.0, util: "74%" },
                    { plate: "NB-1003", store: "Galle Station Store", trips: 14, days: 13, hours: 56.0, util: "65%" },
                    { plate: "NB-1004", store: "Matara Station Store", trips: 12, days: 11, hours: 48.0, util: "58%" },
                    { plate: "NB-1005", store: "Jaffna Station Store", trips: 16, days: 14, hours: 64.0, util: "68%" },
                    { plate: "NB-1006", store: "Trincomalee Station Store", trips: 10, days: 9, hours: 40.0, util: "50%" },
                  ].map((t) => (
                    <tr key={t.plate} className="hover:bg-[#F9F9FF] transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-[#4132C7]">{t.plate}</td>
                      <td className="px-6 py-4 font-semibold text-[#121C2C]">{t.store}</td>
                      <td className="px-6 py-4 text-center font-mono">{t.trips}</td>
                      <td className="px-6 py-4 text-center font-mono">{t.days} / 26</td>
                      <td className="px-6 py-4 text-right font-mono">{t.hours.toFixed(1)} hrs</td>
                      <td className="px-6 py-4 text-right">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E0F2FF] text-[#0047CC]">
                          {t.util}
                        </span>
                      </td>
                    </tr>
                  ))}
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
          <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#4132C7]">
                Customer Account #1
              </span>
              <h3 className="text-lg font-bold text-[#121C2C]">Colombo Retail Mart</h3>
              <p className="text-xs text-[#474554] mt-0.5">
                Type: <span className="font-semibold capitalize text-[#121C2C]">Retail</span> · Phone: 0771234567 · City: Colombo
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#474554]">Total Lifetime Orders</p>
              <p className="text-xl font-bold text-[#4132C7]">8 Orders</p>
            </div>
          </div>

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
                  {[
                    { id: 101, placed: "2026-08-15", exp: "2026-08-23", del: "2026-08-23 14:15", truck: "NB-1001", driver: "Sunil P.", val: 45000, status: "Delivered" },
                    { id: 112, placed: "2026-08-20", exp: "2026-08-28", del: "2026-08-28 11:30", truck: "NB-1001", driver: "Sunil P.", val: 62000, status: "Delivered" },
                    { id: 125, placed: "2026-08-26", exp: "2026-09-04", del: "-", truck: "NB-1001", driver: "Anura K.", val: 38000, status: "In Transit" },
                  ].map((ord) => (
                    <tr key={ord.id} className="hover:bg-[#F9F9FF] transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-[#4132C7]">#{ord.id}</td>
                      <td className="px-6 py-4 text-[#474554]">{ord.placed}</td>
                      <td className="px-6 py-4 text-[#474554]">{ord.exp}</td>
                      <td className="px-6 py-4 text-[#474554]">{ord.del}</td>
                      <td className="px-6 py-4 text-[#121C2C] font-medium">{ord.truck} ({ord.driver})</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-[#121C2C]">
                        {formatCurrency(ord.val)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            ord.status === "Delivered"
                              ? "bg-[#E6F6F4] text-[#00B69B]"
                              : "bg-[#FFF9E6] text-[#FFB800]"
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
