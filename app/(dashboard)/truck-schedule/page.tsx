import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { TruckSchedule, Employee, Truck } from '@/types/fleet';

// Dummy data for Phase 0
const mockSchedules: (TruckSchedule & { truck: Truck, driver: Employee, assistant: Employee })[] = [
  {
    id: 'ts-1',
    truck_id: 't-1',
    driver_id: 'd-1',
    assistant_id: 'a-1',
    scheduled_date: '2026-08-31',
    status: 'scheduled',
    truck: { id: 't-1', plate_number: 'WP-LC-1234', capacity_kg: 5000, status: 'available' },
    driver: { id: 'd-1', user_id: 'u-1', name: 'Nimal Perera', role: 'driver', current_weekly_hours: 32 },
    assistant: { id: 'a-1', user_id: 'u-2', name: 'Kamal Silva', role: 'assistant', current_weekly_hours: 45 },
  },
];

export default function TruckSchedulesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.02em] text-[#121C2C]">
          Truck Schedules
        </h1>
        <Link
          href="/truck-schedule/new"
          className="bg-[#4132C7] hover:bg-[#5A4FE0] text-white px-6 h-12 rounded-full flex items-center gap-2 font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Schedule
        </Link>
      </div>

      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]">
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Date</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Truck</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Driver</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Assistant</th>
              <th className="px-6 py-4 text-[11px] font-semibold text-[#474554] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#C8C4D7]">
            {mockSchedules.map((schedule) => (
              <tr key={schedule.id} className="hover:bg-[#F0F3FF]/50 transition-colors h-[56px]">
                <td className="px-6 py-4 text-[14px] text-[#121C2C]">{schedule.scheduled_date}</td>
                <td className="px-6 py-4 text-[14px] text-[#121C2C]">{schedule.truck.plate_number}</td>
                <td className="px-6 py-4 text-[14px] text-[#121C2C]">
                  <div>{schedule.driver.name}</div>
                  <div className="text-[12px] text-[#777586]">{schedule.driver.current_weekly_hours} hrs this week</div>
                </td>
                <td className="px-6 py-4 text-[14px] text-[#121C2C]">
                  <div>{schedule.assistant.name}</div>
                  <div className="text-[12px] text-[#777586]">{schedule.assistant.current_weekly_hours} hrs this week</div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-[#E0F2FF] text-[#0047CC] capitalize">
                    {schedule.status.replace('_', ' ')}
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
