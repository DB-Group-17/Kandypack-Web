/**
 * @file app/(dashboard)/truck-schedule/TruckScheduleFilters.tsx
 * @description Client component — filter bar for the Truck Schedules list page.
 *
 * Purpose:
 *   Renders four filter controls (date-from, date-to, status, driver) that
 *   update the page URL search params on submission. The parent server component
 *   reads those params and forwards them to GET /api/truck-schedules, so no
 *   client-side fetch is needed — a full navigation drives the filtering.
 *
 * Controls:
 *   - Date from (date input)   → ?date_from=YYYY-MM-DD
 *   - Date to   (date input)   → ?date_to=YYYY-MM-DD
 *   - Status    (select)       → ?status=Scheduled|In Progress|Completed|Cancelled
 *   - Driver    (text search)  → ?driver_name=<partial name>
 *
 * Note on driver filter:
 *   The GET /api/truck-schedules endpoint accepts driver_id (a number). This bar
 *   passes driver_name as a URL param; fetchSchedules() in page.tsx extends the
 *   param allowlist to include driver_name and the server performs a LIKE match
 *   so users can search by partial name without knowing IDs.
 *
 * UX:
 *   - "Apply" submits the form as a client navigation (router.push).
 *   - "Clear" resets all fields and navigates to the base route.
 *   - Active filter count badge on the filter icon encourages discoverability.
 *
 * Design tokens: DESIGN.md §2 surface/outline palette, §4 spacing, §5 shape.
 * UI rules: Docs/11_ui-rules.md §4 (compact toolbar inputs, 40px height),
 *           §3 (tonal filter tray surface).
 *
 * References:
 *   - Docs/05_api-and-pages.md §B /truck-schedule filter bar spec
 *   - Docs/07_content-copy.md  truck schedules section
 *   - app/(dashboard)/truck-schedule/page.tsx (consumer)
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, X, Search } from 'lucide-react';

/** Allowed values for the status filter, matching the DB enum. */
const STATUS_OPTIONS = [
  { value: '',             label: 'All statuses' },
  { value: 'Scheduled',   label: 'Scheduled' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed',   label: 'Completed' },
  { value: 'Cancelled',   label: 'Cancelled' },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Internal form state mirroring the filter URL params. */
interface FilterState {
  /** Start date for the date range (YYYY-MM-DD or empty). */
  date_from: string;
  /** End date for the date range (YYYY-MM-DD or empty). */
  date_to: string;
  /** Status enum value or empty string for "all". */
  status: string;
  /** Free-text driver name; sent as driver_name param for server-side LIKE search. */
  driver_name: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * TruckScheduleFilters — filter bar for the truck-schedule list page.
 *
 * Reads the current URL search params to pre-populate the controls so that
 * the filter state survives page refreshes and back-navigation.
 *
 * @returns The rendered filter bar
 */
export default function TruckScheduleFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Derive initial state from the current URL search params.
   * Keeps the form in sync if the user navigates back to the page.
   */
  const [filters, setFilters] = useState<FilterState>({
    date_from:   searchParams.get('date_from')   ?? '',
    date_to:     searchParams.get('date_to')     ?? '',
    status:      searchParams.get('status')      ?? '',
    driver_name: searchParams.get('driver_name') ?? '',
  });

  /**
   * Re-sync form state if URL params change externally
   * (e.g. user hits Back after clearing filters).
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters({
      date_from:   searchParams.get('date_from')   ?? '',
      date_to:     searchParams.get('date_to')     ?? '',
      status:      searchParams.get('status')      ?? '',
      driver_name: searchParams.get('driver_name') ?? '',
    });
  }, [searchParams]);

  /**
   * Count non-empty filter fields for the active-filter badge.
   */
  const activeCount = [
    filters.date_from,
    filters.date_to,
    filters.status,
    filters.driver_name,
  ].filter(Boolean).length;

  /**
   * Generic change handler for all controlled filter inputs.
   * Uses the element's `name` attribute to update the correct field.
   *
   * @param e - Change event from an input or select element
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFilters((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  /**
   * Build the new URL search string from the current filter state and
   * navigate to it. Only non-empty params are included to keep URLs clean.
   *
   * @param e - Form submit event (prevented to avoid native GET submission)
   */
  const handleApply = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams();
      if (filters.date_from)   params.set('date_from',   filters.date_from);
      if (filters.date_to)     params.set('date_to',     filters.date_to);
      if (filters.status)      params.set('status',      filters.status);
      if (filters.driver_name) params.set('driver_name', filters.driver_name);
      const qs = params.toString();
      router.push(`/truck-schedule${qs ? `?${qs}` : ''}`);
    },
    [filters, router]
  );

  /**
   * Reset all filter fields and navigate back to the unfiltered list.
   */
  const handleClear = useCallback(() => {
    setFilters({ date_from: '', date_to: '', status: '', driver_name: '' });
    router.push('/truck-schedule');
  }, [router]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    /* Filter tray: tonal surface per UI-rules §3 */
    <form
      id="truck-schedule-filter-bar"
      onSubmit={handleApply}
      aria-label="Filter truck schedules"
      className="bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-[16px] px-5 py-4 flex flex-wrap items-end gap-3"
    >
      {/* ── Filter icon + active count ── */}
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#474554] self-center shrink-0 mr-1">
        <Filter className="w-4 h-4 text-[#4132C7]" aria-hidden="true" />
        Filters
        {activeCount > 0 && (
          <span
            aria-label={`${activeCount} active filter${activeCount > 1 ? 's' : ''}`}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#4132C7] text-white text-[10px] font-bold"
          >
            {activeCount}
          </span>
        )}
      </div>

      {/* ── Date from ── */}
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label
          htmlFor="filter-date-from"
          className="text-[11px] font-semibold text-[#474554] uppercase tracking-wider"
        >
          Date from
        </label>
        <input
          id="filter-date-from"
          name="date_from"
          type="date"
          value={filters.date_from}
          onChange={handleChange}
          /* Prevent nonsensical ranges: "from" cannot be after "to" */
          max={filters.date_to || undefined}
          className="h-10 px-3 rounded-[8px] border border-[#C8C4D7] bg-white text-[13px] text-[#121C2C]
                     focus:outline-none focus:ring-2 focus:ring-[#4132C7]/30 focus:border-[#4132C7]
                     transition-colors"
        />
      </div>

      {/* ── Date to ── */}
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label
          htmlFor="filter-date-to"
          className="text-[11px] font-semibold text-[#474554] uppercase tracking-wider"
        >
          Date to
        </label>
        <input
          id="filter-date-to"
          name="date_to"
          type="date"
          value={filters.date_to}
          onChange={handleChange}
          /* "to" cannot be before "from" */
          min={filters.date_from || undefined}
          className="h-10 px-3 rounded-[8px] border border-[#C8C4D7] bg-white text-[13px] text-[#121C2C]
                     focus:outline-none focus:ring-2 focus:ring-[#4132C7]/30 focus:border-[#4132C7]
                     transition-colors"
        />
      </div>

      {/* ── Status select ── */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label
          htmlFor="filter-status"
          className="text-[11px] font-semibold text-[#474554] uppercase tracking-wider"
        >
          Status
        </label>
        <select
          id="filter-status"
          name="status"
          value={filters.status}
          onChange={handleChange}
          className="h-10 px-3 rounded-[8px] border border-[#C8C4D7] bg-white text-[13px] text-[#121C2C]
                     focus:outline-none focus:ring-2 focus:ring-[#4132C7]/30 focus:border-[#4132C7]
                     transition-colors appearance-none cursor-pointer"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Driver name search ── */}
      <div className="flex flex-col gap-1 min-w-[180px] flex-1">
        <label
          htmlFor="filter-driver"
          className="text-[11px] font-semibold text-[#474554] uppercase tracking-wider"
        >
          Driver
        </label>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#777586] pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="filter-driver"
            name="driver_name"
            type="text"
            placeholder="Search by driver name…"
            value={filters.driver_name}
            onChange={handleChange}
            className="h-10 w-full pl-9 pr-3 rounded-[8px] border border-[#C8C4D7] bg-white text-[13px] text-[#121C2C]
                       placeholder:text-[#777586]
                       focus:outline-none focus:ring-2 focus:ring-[#4132C7]/30 focus:border-[#4132C7]
                       transition-colors"
          />
        </div>
      </div>

      {/* ── Apply / Clear actions ── */}
      <div className="flex items-end gap-2 shrink-0">
        <button
          id="btn-apply-truck-filters"
          type="submit"
          className="h-10 px-5 rounded-full bg-[#4132C7] hover:bg-[#5A4FE0] text-white text-[13px] font-semibold
                     transition-colors duration-150 shadow-sm"
        >
          Apply
        </button>

        {/* Clear button — only visible when at least one filter is active */}
        {activeCount > 0 && (
          <button
            id="btn-clear-truck-filters"
            type="button"
            onClick={handleClear}
            aria-label="Clear all filters"
            className="h-10 px-4 rounded-full border border-[#C8C4D7] bg-white hover:bg-[#F0F3FF]
                       text-[13px] font-semibold text-[#474554] transition-colors duration-150
                       flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
