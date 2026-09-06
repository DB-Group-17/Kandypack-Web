'use client';

/**
 * @file new/page.tsx
 * @description Static frontend shell for creating a new truck schedule (/truck-schedule/new).
 * Owned by Member 3 (Fleet & Deliveries). Aligns with Docs/05_api-and-pages.md §A7 and DESIGN.md.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import type { TruckItem, DriverItem, AssistantItem } from '@/types/fleet';

/**
 * Mock reference dataset for available trucks.
 */
const mockTrucks: TruckItem[] = [
  { truck_id: 1, plate_number: 'WP-LC-1234', capacity_kg: 5000, home_store_id: 1 },
  { truck_id: 2, plate_number: 'WP-LC-5678', capacity_kg: 5000, home_store_id: 1 },
  { truck_id: 3, plate_number: 'WP-LC-9012', capacity_kg: 3500, home_store_id: 2 },
];

/**
 * Mock reference dataset for drivers with weekly hour tracking.
 */
const mockDrivers: DriverItem[] = [
  { driver_id: 101, full_name: 'Nimal Perera', current_week_hours: 32, weekly_limit: 40, hours_remaining: 8 },
  { driver_id: 102, full_name: 'Sunil Jayawardena', current_week_hours: 38, weekly_limit: 40, hours_remaining: 2 },
  { driver_id: 103, full_name: 'Sarath Bandara', current_week_hours: 20, weekly_limit: 40, hours_remaining: 20 },
];

/**
 * Mock reference dataset for assistants with weekly hour tracking.
 */
const mockAssistants: AssistantItem[] = [
  { assistant_id: 201, full_name: 'Kamal Silva', current_week_hours: 45, weekly_limit: 40, hours_remaining: 0 },
  { assistant_id: 202, full_name: 'Anura Kumara', current_week_hours: 28, weekly_limit: 40, hours_remaining: 12 },
  { assistant_id: 203, full_name: 'Pradeep Chaminda', current_week_hours: 15, weekly_limit: 40, hours_remaining: 25 },
];

/**
 * NewTruckSchedulePage component renders the interactive schedule creation form.
 *
 * @returns {JSX.Element} The rendered schedule creation interface.
 */
export default function NewTruckSchedulePage() {
  const [selectedDriverId, setSelectedDriverId] = useState<number | ''>('');
  const [selectedAssistantId, setSelectedAssistantId] = useState<number | ''>('');

  const selectedDriver = mockDrivers.find((d) => d.driver_id === selectedDriverId);
  const selectedAssistant = mockAssistants.find((a) => a.assistant_id === selectedAssistantId);

  const hasDriverWarning = selectedDriver && selectedDriver.current_week_hours >= 36;
  const hasAssistantWarning = selectedAssistant && selectedAssistant.current_week_hours >= 40;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link 
          href="/truck-schedule"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#474554]" />
        </Link>
        <div>
          <h1 className="text-[24px] font-semibold text-[#121C2C]">
            Schedule a Truck
          </h1>
          <p className="text-sm text-[#474554]">
            Assign truck, driver, and assistant for daily delivery route
          </p>
        </div>
      </div>

      {/* Live Conflict Warning Banner */}
      {(hasDriverWarning || hasAssistantWarning) && (
        <div className="bg-[#FFF9E6] border border-[#FFB800]/20 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#FFB800] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-[#FFB800]">Live Conflict Warning</h3>
            <p className="text-sm text-[#474554] mt-1">
              {hasAssistantWarning
                ? `Assistant ${selectedAssistant?.full_name} has exceeded weekly threshold (${selectedAssistant?.current_week_hours}h / 40h).`
                : `Driver ${selectedDriver?.full_name} is nearing weekly threshold (${selectedDriver?.current_week_hours}h / 40h).`}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-8 border border-[#C8C4D7]/40">
        <form className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Scheduled Date
              </label>
              <input 
                type="date" 
                defaultValue="2026-09-02"
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px]"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Select Truck
              </label>
              <select className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white">
                <option value="">Choose a truck...</option>
                {mockTrucks.map((t) => (
                  <option key={t.truck_id} value={t.truck_id}>
                    {t.plate_number} ({t.capacity_kg}kg capacity)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Assign Driver
              </label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value ? Number(e.target.value) : '')}
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white"
              >
                <option value="">Choose a driver...</option>
                {mockDrivers.map((d) => (
                  <option key={d.driver_id} value={d.driver_id}>
                    {d.full_name} ({d.current_week_hours}h / {d.weekly_limit}h limit)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Assign Assistant
              </label>
              <select
                value={selectedAssistantId}
                onChange={(e) => setSelectedAssistantId(e.target.value ? Number(e.target.value) : '')}
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white"
              >
                <option value="">Choose an assistant...</option>
                {mockAssistants.map((a) => (
                  <option key={a.assistant_id} value={a.assistant_id}>
                    {a.full_name} ({a.current_week_hours}h / {a.weekly_limit}h limit)
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="pt-6 mt-6 border-t border-[#C8C4D7] flex justify-end gap-3">
            <Link 
              href="/truck-schedule"
              className="px-6 flex items-center h-12 rounded-full border border-[#C8C4D7] text-[#474554] font-medium hover:bg-[#F0F3FF] transition-colors"
            >
              Cancel
            </Link>
            <button 
              type="button"
              className="bg-[#4132C7] hover:bg-[#5A4FE0] text-white px-8 h-12 rounded-full font-medium transition-colors shadow-sm"
            >
              Create Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
