/**
 * @file app/(dashboard)/truck-schedule/page.tsx
 * @description Truck Schedules list page (/truck-schedule).
 * Owner: Member 3 (Fleet & Deliveries).
 *
 * Data flow:
 *   - Server component: reads schedules straight from MySQL through
 *     fetchTruckSchedulesFromDB() (shared with GET /api/truck-schedules) on every
 *     request. Access is enforced by proxy.ts, which only lets system_administrator
 *     and fleet_supervisor reach /truck-schedule.
 *   - URL search params (date_from, date_to, status, driver_id, driver_name, truck_id)
 *     are passed through as filters, so the client filter bar drives server-side
 *     filtering without client fetches.
 *   - If the query fails, the error is logged server-side and the page renders an
 *     empty list with an error notice.
 *
 * User interactions:
 *   - "New schedule" button links to /truck-schedule/new.
 *   - Filter bar (TruckScheduleFilters) updates URL search params; the server
 *     re-renders with the new params on navigation. Requires a Suspense boundary
 *     because the client component calls useSearchParams().
 *   - After a schedule is created, /truck-schedule/new redirects here with
 *     ?placed=1&route_name=…; ScheduleCreatedToast shows the doc 07 success toast
 *     once and strips those params from the URL.
 *   - Status badge renders with semantic DESIGN.md colors.
 *
 * Page-specific logic:
 *   - driver_name is a partial (LIKE) match resolved in fetchTruckSchedulesFromDB;
 *     driver_id takes precedence when both are present.
 *
 * References:
 *   - Docs/05_api-and-pages.md §B /truck-schedule
 *   - Docs/03_architecture.md §8
 *   - DESIGN.md §2 colors, §3 typography, §6 tables
 *   - app/(dashboard)/truck-schedule/TruckScheduleFilters.tsx
 */

import React, { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { TruckScheduleItem, TruckScheduleStatus } from '@/types/fleet';
import TruckScheduleFilters from './TruckScheduleFilters';
import ScheduleCreatedToast from './ScheduleCreatedToast';
import { fetchTruckSchedulesFromDB } from '@/app/api/truck-schedules/service';

/**
 * Returns Tailwind CSS classes for a given TruckScheduleStatus badge.
 * Uses DESIGN.md §2 semantic color palette.
 *
 * @param status - The lifecycle status of the schedule
 * @returns Tailwind class string for background and text
 */
function getStatusBadgeClass(status: TruckScheduleStatus): string {
  switch (status) {
    case 'Completed':   return 'bg-[#E6F6F4] text-[#00B69B]';
    case 'In Progress': return 'bg-[#FFF9E6] text-[#FFB800]';
    case 'Scheduled':   return 'bg-[#E0F2FF] text-[#0047CC]';
    case 'Cancelled':   return 'bg-[#FFF0F0] text-[#F93C65]';
    default:            return 'bg-[#F1F1F5] text-[#474554]';
  }
}

/**
 * Loads truck schedules for the list, applying any filters from the URL.
 * Runs on the server and queries the database directly (no HTTP round trip).
 * Errors are logged and converted into a user-facing notice instead of throwing,
 * so the page still renders its header and filter bar.
 *
 * @param searchParams - URL search params passed from the page (for filters)
 * @returns Array of TruckScheduleItem records and an optional error message
 */
async function fetchSchedules(
  searchParams: Record<string, string>
): Promise<{ items: TruckScheduleItem[]; error?: string }> {
  try {
    const items = await fetchTruckSchedulesFromDB({
      dateFrom: searchParams.date_from,
      dateTo: searchParams.date_to,
      status: searchParams.status,
      driverId: searchParams.driver_id,
      driverName: searchParams.driver_name,
      truckId: searchParams.truck_id,
    });
    return { items };
  } catch (err) {
    // Log the real cause server-side; the user only sees a generic notice.
    console.error('[truck-schedule page] Failed to load schedules:', err);
    return { items: [], error: 'Could not load schedules from the database.' };
  }
}

/**
 * TruckSchedulesPage — server component that fetches and renders the list of
 * operational truck delivery schedules.
 *
 * @param props.searchParams - Next.js page search params (forwarded to the API for filtering)
 * @returns The rendered Truck Schedule list page
 */
export default async function TruckSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const resolvedParams = await searchParams;
  const { items, error } = await fetchSchedules(resolvedParams);

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.02em] text-[#121C2C]">
            Truck schedules
          </h1>
          <p className="text-sm text-[#474554] mt-1">
            Last-mile delivery scheduling
          </p>
        </div>
        <Link
          href="/truck-schedule/new"
          id="btn-new-truck-schedule"
          className="bg-[#4132C7] hover:bg-[#5A4FE0] text-white px-6 h-12 rounded-full flex items-center gap-2 font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New schedule
        </Link>
      </div>

      {/* ── Filter bar ──
           Wrapped in Suspense because TruckScheduleFilters calls useSearchParams(),
           which requires a Suspense boundary in the App Router (Next.js 13+).
           The fallback is an invisible placeholder so layout does not shift. */}
      <Suspense fallback={<div className="h-[76px] rounded-[16px] bg-[#F9F9FF] animate-pulse" />}>
        <TruckScheduleFilters />
      </Suspense>

      {/* ── Success toast after creating a schedule (reads ?placed=1 once) ──
           Own Suspense boundary (useSearchParams); renders nothing when absent. */}
      <Suspense fallback={null}>
        <ScheduleCreatedToast />
      </Suspense>

      {/* ── Error notice ── */}
      {error && (
        <div className="bg-[#FFF0F0] border border-[#F93C65]/20 rounded-[16px] p-4 text-[14px] text-[#F93C65]">
          {error}
        </div>
      )}

      {/* ── Schedule table ── */}
      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden border border-[#C8C4D7]/40">
        {items.length === 0 && !error ? (
          <div className="py-16 text-center text-[14px] text-[#474554]">
            No truck schedules for this period.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]">
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Truck</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Driver</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Assistant</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Route</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Start</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">End</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8C4D7]">
              {items.map((schedule) => {
                // Extract date and time portions from the YYYY-MM-DD HH:MM:SS strings
                const datePart  = schedule.start_time.slice(0, 10);
                const startTime = schedule.start_time.slice(11, 16);
                const endTime   = schedule.end_time.slice(11, 16);

                return (
                  <tr
                    key={schedule.schedule_id}
                    className="hover:bg-[#F0F3FF]/50 transition-colors h-[56px]"
                  >
                    <td className="px-6 py-4 text-[14px] text-[#121C2C] font-mono">
                      {schedule.truck_plate}
                    </td>
                    <td className="px-6 py-4 text-[14px] text-[#121C2C]">
                      {schedule.driver_name}
                    </td>
                    <td className="px-6 py-4 text-[14px] text-[#121C2C]">
                      {schedule.assistant_name}
                    </td>
                    <td className="px-6 py-4 text-[14px] font-medium text-[#121C2C]">
                      {schedule.route_name}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[#474554]">
                      {datePart} {startTime}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[#474554]">
                      {datePart} {endTime}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold ${getStatusBadgeClass(schedule.status)}`}
                      >
                        {schedule.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
