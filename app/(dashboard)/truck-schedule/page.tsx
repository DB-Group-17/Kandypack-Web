/**
 * @file app/(dashboard)/truck-schedule/page.tsx
 * @description Truck Schedules list page (/truck-schedule).
 * Owner: Member 3 (Fleet & Deliveries).
 *
 * Data flow:
 *   - Server component: fetches real schedule data from GET /api/truck-schedules
 *     on every request (no stale mock data).
 *   - Passes query params from the URL search string directly to the API so the
 *     client-side filter bar can drive server-side filtering without client fetches.
 *   - Falls back to an empty list with an error notice if the API is unavailable.
 *
 * User interactions:
 *   - "New Schedule" button links to /truck-schedule/new.
 *   - Status badge renders with semantic DESIGN.md colors.
 *   - Date and time window columns show formatted values from the API response.
 *
 * References:
 *   - Docs/05_api-and-pages.md §B /truck-schedule
 *   - Docs/03_architecture.md §8
 *   - DESIGN.md §2 colors, §3 typography, §6 tables
 */

import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { TruckScheduleItem, TruckScheduleStatus } from '@/types/fleet';
import { headers } from 'next/headers';

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
 * Fetches truck schedules from the internal API route.
 * Called on the server so the JWT auth cookie is forwarded automatically.
 *
 * @param searchParams - URL search params passed from the page (for filters)
 * @returns Array of TruckScheduleItem records and an optional error message
 */
async function fetchSchedules(
  searchParams: Record<string, string>
): Promise<{ items: TruckScheduleItem[]; error?: string }> {
  try {
    // Build the API URL with any active filters forwarded from the page URL
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (['date_from', 'date_to', 'status', 'driver_id', 'truck_id'].includes(key) && value) {
        params.set(key, value);
      }
    }

    // Read the host header so we can construct an absolute URL for the internal fetch
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const url = `${protocol}://${host}/api/truck-schedules${params.toString() ? `?${params.toString()}` : ''}`;

    // Forward the cookie header so the API route can authenticate via getSession()
    const cookie = headersList.get('cookie') ?? '';
    const response = await fetch(url, {
      headers: { cookie },
      // No cache — schedules change frequently; rely on Next.js request deduplication
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = (body as { error?: { message?: string } })?.error?.message ?? 'Failed to load schedules.';
      return { items: [], error: message };
    }

    const data = (await response.json()) as { items: TruckScheduleItem[] };
    return { items: data.items ?? [] };
  } catch {
    return { items: [], error: 'Could not reach the schedule service. Check your connection.' };
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
            Truck Schedules
          </h1>
          <p className="text-sm text-[#474554] mt-1">
            Manage fleet assignments and daily last-mile routes
          </p>
        </div>
        <Link
          href="/truck-schedule/new"
          id="btn-new-truck-schedule"
          className="bg-[#4132C7] hover:bg-[#5A4FE0] text-white px-6 h-12 rounded-full flex items-center gap-2 font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Schedule
        </Link>
      </div>

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
            No truck schedules found.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]">
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Route</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Truck</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Driver</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Assistant</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Time window</th>
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
                    <td className="px-6 py-4 text-[14px] font-medium text-[#121C2C]">
                      {schedule.route_name}
                    </td>
                    <td className="px-6 py-4 text-[14px] text-[#121C2C] font-mono">
                      {schedule.truck_plate}
                    </td>
                    <td className="px-6 py-4 text-[14px] text-[#121C2C]">
                      {schedule.driver_name}
                    </td>
                    <td className="px-6 py-4 text-[14px] text-[#121C2C]">
                      {schedule.assistant_name}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[#474554]">
                      {datePart}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[#474554]">
                      {startTime} – {endTime}
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
