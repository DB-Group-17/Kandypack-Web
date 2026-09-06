/**
 * @file page.tsx
 * @description Static frontend shell for the Truck Schedules list page (/truck-schedule).
 * Owned by Member 3 (Fleet & Deliveries). Aligns with Docs/05_api-and-pages.md §A7 and DESIGN.md.
 */

import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { TruckScheduleItem, TruckScheduleStatus } from '@/types/fleet';

/**
 * Baseline mock truck schedules aligned with seed data and API DTO contract.
 */
const mockSchedules: TruckScheduleItem[] = [
  {
    schedule_id: 1,
    truck_plate: 'WP-LC-1234',
    driver_name: 'Nimal Perera',
    assistant_name: 'Kamal Silva',
    route_name: 'Colombo Central Route',
    start_time: '2026-09-02 08:00:00',
    end_time: '2026-09-02 16:00:00',
    status: 'Scheduled',
  },
  {
    schedule_id: 2,
    truck_plate: 'WP-LC-5678',
    driver_name: 'Sunil Jayawardena',
    assistant_name: 'Anura Kumara',
    route_name: 'Negombo Coastal Route',
    start_time: '2026-09-02 07:30:00',
    end_time: '2026-09-02 15:30:00',
    status: 'In Progress',
  },
  {
    schedule_id: 3,
    truck_plate: 'WP-LC-9012',
    driver_name: 'Sarath Bandara',
    assistant_name: 'Pradeep Chaminda',
    route_name: 'Galle Commercial Route',
    start_time: '2026-09-01 08:00:00',
    end_time: '2026-09-01 14:00:00',
    status: 'Completed',
  },
];

/**
 * Returns the semantic CSS classes for a given TruckScheduleStatus badge.
 *
 * @param {TruckScheduleStatus} status - The lifecycle status of the schedule.
 * @returns {string} Tailwind CSS class list for background and text.
 */
function getStatusBadgeClass(status: TruckScheduleStatus): string {
  switch (status) {
    case 'Completed':
      return 'bg-[#E6F6F4] text-[#00B69B]';
    case 'In Progress':
      return 'bg-[#FFF9E6] text-[#FFB800]';
    case 'Scheduled':
      return 'bg-[#E0F2FF] text-[#0047CC]';
    case 'Cancelled':
      return 'bg-[#FFF0F0] text-[#F93C65]';
    default:
      return 'bg-[#F1F1F5] text-[#474554]';
  }
}

/**
 * TruckSchedulesPage renders the list of operational truck delivery schedules.
 *
 * @returns {JSX.Element} The rendered Truck Schedule list page.
 */
export default function TruckSchedulesPage() {
  return (
    <div className="space-y-6">
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
          className="bg-[#4132C7] hover:bg-[#5A4FE0] text-white px-6 h-12 rounded-full flex items-center gap-2 font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Schedule
        </Link>
      </div>

      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden border border-[#C8C4D7]/40">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]">
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Route</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Truck</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Driver</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Assistant</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Time Window</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#C8C4D7]">
            {mockSchedules.map((schedule) => (
              <tr key={schedule.schedule_id} className="hover:bg-[#F0F3FF]/50 transition-colors h-[56px]">
                <td className="px-6 py-4 text-[14px] font-medium text-[#121C2C]">{schedule.route_name}</td>
                <td className="px-6 py-4 text-[14px] text-[#121C2C] font-mono">{schedule.truck_plate}</td>
                <td className="px-6 py-4 text-[14px] text-[#121C2C]">{schedule.driver_name}</td>
                <td className="px-6 py-4 text-[14px] text-[#121C2C]">{schedule.assistant_name}</td>
                <td className="px-6 py-4 text-[13px] text-[#474554]">
                  {schedule.start_time.slice(11, 16)} – {schedule.end_time.slice(11, 16)}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold ${getStatusBadgeClass(schedule.status)}`}>
                    {schedule.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
