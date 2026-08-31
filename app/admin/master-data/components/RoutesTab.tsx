'use client';

/**
 * @file RoutesTab.tsx
 * @description Tabular view of Delivery Routes and their coverage areas.
 * Columns: Route Name, Store Station, Coverage Areas, Max Delivery Time, Status, and Actions.
 * Conforms to Docs/07_content-copy.md §377 and UI/master_data/code.html.
 */

import React from 'react';
import { RouteItem } from '../types';

interface RoutesTabProps {
  /** Array of routes to display */
  items: RouteItem[];
  /** Callback to trigger opening the Add Route modal */
  onAddClick: () => void;
  /** Optional callback to edit a route */
  onEditClick?: (item: RouteItem) => void;
}

/**
 * RoutesTab Component
 */
export const RoutesTab: React.FC<RoutesTabProps> = ({
  items,
  onAddClick,
  onEditClick,
}) => {
  if (items.length === 0) {
    return (
      <div className="py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#EBE9FE] text-[#4132C7] mx-auto flex items-center justify-center mb-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        </div>
        <h3 className="text-[16px] font-semibold text-[#121C2C] mb-1">
          No records yet.
        </h3>
        <p className="text-[13px] text-[#474554] max-w-sm mx-auto mb-5">
          No delivery routes match your search filters or have been configured for store stations.
        </p>
        <button
          onClick={onAddClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#4132C7] text-white text-[13px] font-semibold hover:bg-[#3527a8] transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Route</span>
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#F8F9FC] border-b border-[#C8C4D7]/30 text-[11px] font-bold text-[#474554] tracking-wider uppercase">
            <th className="py-3.5 px-5">Route Name</th>
            <th className="py-3.5 px-5">Assigned Store</th>
            <th className="py-3.5 px-5">Coverage Areas</th>
            <th className="py-3.5 px-5 text-right">Max Delivery Time</th>
            <th className="py-3.5 px-5 text-center">Status</th>
            <th className="py-3.5 px-5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#C8C4D7]/20 text-[13px] text-[#121C2C]">
          {items.map((route) => (
            <tr
              key={route.route_id}
              className="hover:bg-[#F9F9FF] transition-colors group"
            >
              {/* Route Name with Icon */}
              <td className="py-4 px-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#EBE9FE]/70 text-[#4132C7] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-[#121C2C]">{route.route_name}</p>
                    {route.coverage_description && (
                      <p className="text-[11px] text-[#474554] line-clamp-1 max-w-xs">
                        {route.coverage_description}
                      </p>
                    )}
                  </div>
                </div>
              </td>

              {/* Assigned Store */}
              <td className="py-4 px-5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E0F2FF] text-[12px] font-medium text-[#0047CC]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"
                    />
                  </svg>
                  <span>{route.store_name}</span>
                </span>
              </td>

              {/* Coverage Areas */}
              <td className="py-4 px-5">
                <div className="flex flex-wrap gap-1.5 max-w-md">
                  {route.coverage_areas.map((area) => (
                    <span
                      key={area.coverage_id}
                      className="inline-block px-2 py-0.5 rounded-md bg-[#F1F1F5] text-[11px] text-[#121C2C] font-medium"
                    >
                      {area.area_name}
                    </span>
                  ))}
                </div>
              </td>

              {/* Max Delivery Time */}
              <td className="py-4 px-5 text-right font-medium text-[#121C2C]">
                {route.max_delivery_time_hours} hrs
              </td>

              {/* Status */}
              <td className="py-4 px-5 text-center">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    route.status === 'Active'
                      ? 'bg-[#E6F6F4] text-[#00B69B]'
                      : 'bg-[#F1F1F5] text-[#474554]'
                  }`}
                >
                  {route.status}
                </span>
              </td>

              {/* Actions */}
              <td className="py-4 px-5 text-right">
                <button
                  onClick={() => onEditClick?.(route)}
                  className="p-1.5 rounded-lg text-[#777586] hover:text-[#4132C7] hover:bg-[#EBE9FE]/50 transition-colors"
                  title="Edit route"
                  aria-label={`Edit ${route.route_name}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
