'use client';

/**
 * @file AuditLogTable.tsx
 * @description Main data table for displaying audit log entries with expandable diff rows and action badges.
 * Follows table specifications from Docs/11_ui-rules.md §6 and UI/audit_log reference.
 */

import React, { useState } from 'react';
import { AuditLogItem, AuditActionType } from '../types';
import { AuditLogRowDiff } from './AuditLogRowDiff';

interface AuditLogTableProps {
  /** Array of audit log records to display in the table */
  items: AuditLogItem[];
}

/**
 * Helper function to format an ISO 8601 date string into a user-friendly timestamp.
 * Example: "2023-10-24T14:32:05Z" -> "Oct 24, 14:32:05"
 *
 * @param dateStr ISO timestamp string
 * @returns Formatted date string
 */
function formatTimestamp(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${month} ${day}, ${hours}:${minutes}:${seconds}`;
  } catch {
    return dateStr;
  }
}

/**
 * Helper function to render the appropriate status badge for Created, Updated, or Deleted actions.
 * Adheres to semantic colors in DESIGN.md §2 and UI/audit_log reference.
 *
 * @param action AuditActionType enum value
 * @returns React element with semantic styling
 */
function renderActionBadge(action: AuditActionType): React.JSX.Element {
  switch (action) {
    case 'Created':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#e6f4ea] text-[#137333]">
          Created
        </span>
      );
    case 'Updated':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#e7f0ff] text-[#0047cc]">
          Updated
        </span>
      );
    case 'Deleted':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#fce8e6] text-[#c5221f]">
          Deleted
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#f1f1f5] text-[#474553]">
          {action}
        </span>
      );
  }
}

/**
 * Helper function to format raw database table names into readable title case.
 * Example: 'truck_schedules' -> 'Truck Schedule'
 *
 * @param tableName Raw database table identifier
 * @returns Human-readable table label
 */
function formatTableName(tableName: string): string {
  if (tableName === 'truck_schedules') return 'Truck Schedule';
  if (tableName === 'train_trips') return 'Train Schedule';
  return tableName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * AuditLogTable Component
 *
 * Renders the filterable audit log records in a table layout with interactive expandable diff panels.
 */
export const AuditLogTable: React.FC<AuditLogTableProps> = ({ items }) => {
  // Set of currently expanded log_ids (initialized empty so all rows start collapsed)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<number>>(new Set());

  /**
   * Toggles the expanded status of a given log record row.
   * @param logId Primary key identifier of the audit log record
   */
  const toggleRow = (logId: number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  // If no items match current filter criteria, render empty state
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] p-12 text-center my-6">
        <div className="w-16 h-16 rounded-full bg-[#F0F3FF] text-[#4132C7] flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-[16px] font-semibold text-[#121C2C] mb-1">
          No audit records match these filters.
        </h3>
        <p className="text-[14px] text-[#777586]">
          Try adjusting or clearing your table, user, or date range filters to view records.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-[#F0F3FF] border-b border-[#DEE8FF] text-[#474553] text-[12px] font-semibold tracking-normal">
              <th className="px-6 py-4 w-12 text-center" aria-label="Expand column"></th>
              <th className="px-6 py-4 font-semibold">Timestamp</th>
              <th className="px-6 py-4 font-semibold">Table</th>
              <th className="px-6 py-4 font-semibold">Record ID</th>
              <th className="px-6 py-4 font-semibold">Action</th>
              <th className="px-6 py-4 font-semibold">Changed By</th>
            </tr>
          </thead>
          <tbody className="text-[14px] text-[#121C2C] divide-y divide-[#DEE8FF]">
            {items.map((item) => {
              const isExpanded = expandedRowIds.has(item.log_id);

              return (
                <React.Fragment key={item.log_id}>
                  {/* Main Row */}
                  <tr
                    onClick={() => toggleRow(item.log_id)}
                    className="hover:bg-[#F9F9FF] transition-colors cursor-pointer group select-none min-h-[56px]"
                  >
                    {/* Expand Chevron Icon */}
                    <td className="px-6 py-4 text-center">
                      <svg
                        className={`w-5 h-5 text-[#777586] transition-transform duration-200 inline-block ${
                          isExpanded ? 'rotate-180 text-[#251297]' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </td>

                    {/* Timestamp */}
                    <td className="px-6 py-4 whitespace-nowrap text-[#474553]">
                      {formatTimestamp(item.changed_at)}
                    </td>

                    {/* Table Name */}
                    <td className="px-6 py-4 text-[#121C2C]">{formatTableName(item.table_name)}</td>

                    {/* Record ID */}
                    <td className="px-6 py-4 font-mono text-[13px] text-[#474553]">
                      {item.record_id}
                    </td>

                    {/* Action Badge */}
                    <td className="px-6 py-4">{renderActionBadge(item.action)}</td>

                    {/* Changed By User */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#DEE8FF] text-[#251297] flex items-center justify-center text-[10px] font-bold tracking-tight">
                          {item.user_initials}
                        </div>
                        <span className="text-[#121C2C]">{item.user_name}</span>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Diff Row */}
                  {isExpanded && (
                    <tr className="bg-[#F9F9FF]">
                      <td colSpan={6} className="px-0 py-0 border-t-0">
                        <AuditLogRowDiff item={item} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
