'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export default function NewTruckSchedulePage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link 
          href="/truck-schedule"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#474554]" />
        </Link>
        <h1 className="text-[24px] font-semibold text-[#121C2C]">
          Schedule a Truck
        </h1>
      </div>

      {/* Live Conflict Warning Placeholder */}
      <div className="bg-[#FFF9E6] border border-[#FFB800]/20 p-4 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#FFB800] shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-[#FFB800]">Live Conflict Warning (Placeholder)</h3>
          <p className="text-sm text-[#FFB800]/80 mt-1">
            Driver Nimal Perera has already worked 38 hours this week. Assigning this trip will exceed the 40-hour limit.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-8">
        <form className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Scheduled Date
              </label>
              <input 
                type="date" 
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px]"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Select Truck
              </label>
              <select className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white">
                <option value="">Choose a truck...</option>
                <option value="t-1">WP-LC-1234 (5000kg)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Assign Driver
              </label>
              <select className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white">
                <option value="">Choose a driver...</option>
                <option value="d-1">Nimal Perera (32 hrs)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#474554] tracking-wide block">
                Assign Assistant
              </label>
              <select className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white">
                <option value="">Choose an assistant...</option>
                <option value="a-1">Kamal Silva (45 hrs)</option>
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
