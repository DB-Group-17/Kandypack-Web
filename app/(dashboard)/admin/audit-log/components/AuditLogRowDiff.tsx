'use client';

/**
 * @file AuditLogRowDiff.tsx
 * @description User-friendly diff inspection component for audit log entries.
 * Renders clear, readable field-level attribute cards instead of raw code/JSON syntax.
 */

import React, { useState } from 'react';
import { AuditLogItem } from '../types';

interface AuditLogRowDiffProps {
  /** The audit log record being inspected */
  item: AuditLogItem;
}

/**
 * Converts camelCase or snake_case database field names into clean, readable labels.
 * Example: 'expected_delivery' -> 'Expected Delivery', 'driver_id' -> 'Driver ID'
 *
 * @param key Raw property key
 * @returns Human-friendly label string
 */
function formatFieldLabel(key: string): string {
  const acronyms: Record<string, string> = {
    id: 'ID',
    lkr: '(LKR)',
    cbm: '(CBM)',
    nic: 'NIC',
    sku: 'SKU',
    url: 'URL',
    no: 'No.',
  };

  return key
    .split('_')
    .map((word) => {
      const lower = word.toLowerCase();
      if (acronyms[lower]) return acronyms[lower];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Formats property values into user-friendly display text.
 *
 * @param val Raw value
 * @returns Formatted string representation
 */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val.toLocaleString();
  return String(val);
}

/**
 * AuditLogRowDiff Component
 *
 * Displays human-friendly Before/After attribute cards for an audit log record.
 */
export const AuditLogRowDiff: React.FC<AuditLogRowDiffProps> = ({ item }) => {
  const [showRawJson, setShowRawJson] = useState(false);

  // Check if both objects exist and are identical
  const hasDifferences =
    !item.old_data ||
    !item.new_data ||
    JSON.stringify(item.old_data) !== JSON.stringify(item.new_data);

  if (!hasDifferences && item.old_data !== null && item.new_data !== null) {
    return (
      <div className="p-6 ml-6 md:ml-12 bg-white border-l-4 border-[#6c61e8] my-3 mr-6 rounded-r-xl shadow-sm">
        <h4 className="text-[14px] font-semibold text-[#121C2C] mb-1">Field Changes</h4>
        <p className="text-[13px] text-[#777586] italic">No field-level changes recorded.</p>
      </div>
    );
  }

  // Get union of all keys across before and after snapshots
  const allKeys = Array.from(
    new Set([
      ...(item.old_data ? Object.keys(item.old_data) : []),
      ...(item.new_data ? Object.keys(item.new_data) : []),
    ])
  );

  return (
    <div className="p-6 ml-6 md:ml-12 bg-white border-l-4 border-[#6c61e8] my-3 mr-6 rounded-r-xl shadow-sm">
      {/* Header with Title and Mode Toggle */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#F0F3FF]">
        <div>
          <h4 className="text-[14px] font-bold text-[#121C2C] tracking-tight">
            Field-Level Changes
          </h4>
          <p className="text-[12px] text-[#777586]">
            Inspecting record modifications for <span className="font-mono text-[#5A4FE0] font-semibold">{item.record_id}</span>
          </p>
        </div>

        {/* Optional Raw JSON Toggle */}
        <button
          type="button"
          onClick={() => setShowRawJson(!showRawJson)}
          className="text-[12px] font-semibold text-[#5A4FE0] hover:text-[#251297] px-3 py-1 rounded-full bg-[#F0F3FF] hover:bg-[#DEE8FF] transition-colors cursor-pointer"
        >
          {showRawJson ? 'Show Friendly View' : 'Show Raw JSON'}
        </button>
      </div>

      {showRawJson ? (
        /* Raw JSON Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#777586] mb-2">
              Before
            </p>
            <pre className="bg-[#F9F9FF] border border-[#DEE8FF] rounded-lg p-3 font-mono text-[12px] text-[#474554] overflow-x-auto whitespace-pre">
              {item.old_data ? JSON.stringify(item.old_data, null, 2) : 'No previous record'}
            </pre>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#777586] mb-2">
              After
            </p>
            <pre className="bg-[#F9F9FF] border border-[#DEE8FF] rounded-lg p-3 font-mono text-[12px] text-[#474554] overflow-x-auto whitespace-pre">
              {item.new_data ? JSON.stringify(item.new_data, null, 2) : 'Record deleted'}
            </pre>
          </div>
        </div>
      ) : (
        /* Friendly Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* BEFORE Panel */}
          <div className="bg-[#F9F9FF] rounded-xl p-4 border border-[#DEE8FF]">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#777586]" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#777586]">
                Previous Value (Before)
              </p>
            </div>

            {item.old_data ? (
              <div className="space-y-2.5">
                {allKeys.map((key) => {
                  const val = item.old_data?.[key];
                  if (val === undefined) return null;

                  return (
                    <div
                      key={key}
                      className="bg-white rounded-lg p-2.5 border border-[#DEE8FF] flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-2xs"
                    >
                      <span className="text-[12px] font-semibold text-[#474554]">
                        {formatFieldLabel(key)}
                      </span>
                      <span className="text-[13px] font-medium text-[#121C2C] break-all">
                        {formatValue(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center bg-white rounded-lg border border-dashed border-[#C8C4D7] text-[13px] text-[#777586]">
                <p className="font-medium text-[#00B69B]">✨ New Record Created</p>
                <p className="text-[12px] mt-0.5">No previous data existed.</p>
              </div>
            )}
          </div>

          {/* AFTER Panel */}
          <div className="bg-[#F9F9FF] rounded-xl p-4 border border-[#DEE8FF]">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#5A4FE0]" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#5A4FE0]">
                Updated Value (After)
              </p>
            </div>

            {item.new_data ? (
              <div className="space-y-2.5">
                {allKeys.map((key) => {
                  const newVal = item.new_data?.[key];
                  const oldVal = item.old_data?.[key];
                  if (newVal === undefined) return null;

                  const isModified =
                    item.old_data !== null &&
                    JSON.stringify(oldVal) !== JSON.stringify(newVal);

                  return (
                    <div
                      key={key}
                      className={`rounded-lg p-2.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-2xs ${
                        isModified
                          ? 'bg-[#DEE8FF] border-[#6c61e8]/40'
                          : 'bg-white border-[#DEE8FF]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-[#474554]">
                          {formatFieldLabel(key)}
                        </span>
                        {isModified && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#5A4FE0] text-white tracking-wider">
                            Changed
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[13px] break-all ${
                          isModified
                            ? 'font-bold text-[#251297]'
                            : 'font-medium text-[#121C2C]'
                        }`}
                      >
                        {formatValue(newVal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center bg-white rounded-lg border border-dashed border-[#F93C65]/40 text-[13px] text-[#F93C65]">
                <p className="font-semibold">🗑️ Record Permanently Deleted</p>
                <p className="text-[12px] text-[#777586] mt-0.5">
                  This item was removed from the active database.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
