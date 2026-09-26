'use client';

/**
 * @file CitiesTab.tsx
 * @description Read-only tabular view of Sri Lankan Distribution Hub Cities.
 * Displays city name, type (Origin/Destination), associated store, and status.
 * Conforms to Docs/07_content-copy.md §381 ("Cities are fixed reference data and cannot be edited here.").
 */

import React from 'react';
import { CityItem } from '../types';

interface CitiesTabProps {
  /** Array of cities to display */
  items: CityItem[];
}

/**
 * CitiesTab Component (Read-Only)
 */
export const CitiesTab: React.FC<CitiesTabProps> = ({ items }) => {
  return (
    <div className="space-y-4">
      {/* Informative Note Banner */}
      <div className="bg-[#E0F2FF]/60 border border-[#0047CC]/20 rounded-xl p-4 flex items-start gap-3 text-[13px] text-[#0047CC]">
        <svg className="w-5 h-5 text-[#0047CC] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <p className="font-semibold text-[#0047CC]">Read-only reference data</p>
          <p className="text-[#474554] mt-0.5">
            Cities are fixed reference data and cannot be edited here.
          </p>
        </div>
      </div>

      {/* Empty State or Main Cities Table */}
      {items.length === 0 ? (
        <div className="py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-[#EBE9FE] text-[#4132C7] mx-auto flex items-center justify-center mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-[16px] font-semibold text-[#121C2C] mb-1">
            No records yet.
          </h3>
          <p className="text-[13px] text-[#474554] max-w-sm mx-auto">
            No cities match your search filters or have been registered in the system reference database.
          </p>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8F9FC] border-b border-[#C8C4D7]/30 text-[11px] font-bold text-[#474554] tracking-wider uppercase">
              <th className="py-3.5 px-5">City ID</th>
              <th className="py-3.5 px-5">City Name</th>
              <th className="py-3.5 px-5">Type (Origin / Destination)</th>
              <th className="py-3.5 px-5">Station Store / Hub</th>
              <th className="py-3.5 px-5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#C8C4D7]/20 text-[13px] text-[#121C2C]">
            {items.map((city) => (
              <tr
                key={city.city_id}
                className="hover:bg-[#F9F9FF] transition-colors group"
              >
                {/* ID */}
                <td className="py-4 px-5 font-mono text-[12px] text-[#474554]">
                  #{city.city_id}
                </td>

                {/* City Name with Icon */}
                <td className="py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#E0F2FF] text-[#0047CC] flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                        />
                      </svg>
                    </div>
                    <span className="font-semibold text-[#121C2C] text-[14px]">
                      {city.city_name}
                    </span>
                  </div>
                </td>

                {/* Hub Type */}
                <td className="py-4 px-5">
                  {city.is_origin ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#EBE9FE] text-[#4132C7]">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <span>Origin Hub (Central)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#E0F2FF] text-[#0047CC]">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                      <span>Destination Station</span>
                    </span>
                  )}
                </td>

                {/* Station Store */}
                <td className="py-4 px-5 text-[#474554] font-medium">
                  {city.store_name || '—'}
                </td>

                {/* Status */}
                <td className="py-4 px-5 text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F6F4] text-[#00B69B]">
                    {city.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
};
