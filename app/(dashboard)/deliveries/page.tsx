'use client';

/**
 * @file app/(dashboard)/deliveries/page.tsx
 * @description Deliveries management page (/deliveries) — wired to real data.
 * Owner: Member 3 (Fleet & Deliveries).
 *
 * Data flow:
 *   - On mount and on filter change, fetches deliveries from GET /api/deliveries
 *     with optional query params (status, date_from, date_to).
 *   - "Mark Complete" calls PATCH /api/deliveries/:id/complete, which invokes the
 *     complete_delivery() stored procedure. On success the row updates in-place
 *     and a success toast appears briefly.
 *
 * User interactions:
 *   - Status filter pill bar to filter by delivery lifecycle status.
 *   - Date range inputs to narrow deliveries by creation date.
 *   - Inline notes input + "Complete" button per active delivery.
 *   - Success toast on completion, inline error on failure.
 *
 * Page-specific logic:
 *   - Only deliveries with status 'Scheduled' or 'In Progress' show the
 *     complete action. 'Completed', 'Failed', and 'Cancelled' are read-only.
 *   - The page uses client-side fetching rather than server-component DB access
 *     because it needs interactive state for the mark-complete flow.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A8 (Deliveries) and §B /deliveries page spec
 *   - DESIGN.md §2 colors, §3 typography, §5 status badges
 *   - Docs/11_ui-rules.md §5 status badges, §3 cards, §6 tables
 *   - types/fleet.ts DeliveryItem, DeliveryStatus
 */

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, MessageSquare, Truck, Loader2, AlertCircle } from 'lucide-react';
import type { DeliveryItem, DeliveryStatus } from '@/types/fleet';

// ─── Status filter options ──────────────────────────────────────────────────

/** All possible delivery statuses for the filter bar, plus 'All' to clear. */
const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Scheduled', value: 'Scheduled' },
  { label: 'In progress', value: 'In Progress' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Failed', value: 'Failed' },
  { label: 'Cancelled', value: 'Cancelled' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns semantic badge classes for DeliveryStatus.
 * Uses DESIGN.md §2 semantic color palette for status indicators.
 *
 * @param status - The current lifecycle status of the delivery
 * @returns CSS class string for background and text colors
 */
function getDeliveryBadgeClass(status: DeliveryStatus): string {
  switch (status) {
    case 'Completed':
      return 'bg-[#E6F6F4] text-[#00B69B]';
    case 'In Progress':
      return 'bg-[#FFF9E6] text-[#FFB800]';
    case 'Scheduled':
      return 'bg-[#E0F2FF] text-[#0047CC]';
    case 'Failed':
    case 'Cancelled':
      return 'bg-[#FFF0F0] text-[#F93C65]';
    default:
      return 'bg-[#F1F1F5] text-[#474554]';
  }
}

/**
 * Returns true if the delivery can be marked as completed.
 * Only 'Scheduled' and 'In Progress' deliveries are eligible.
 *
 * @param status - The delivery's current status
 * @returns Whether the complete action should be shown
 */
function isCompletable(status: DeliveryStatus): boolean {
  return status === 'In Progress' || status === 'Scheduled';
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * DeliveriesPage renders the list of customer order deliveries with real data
 * from GET /api/deliveries, and allows marking deliveries as completed via
 * PATCH /api/deliveries/:id/complete.
 *
 * @returns The rendered Deliveries management interface
 */
export default function DeliveriesPage() {
  // ── Data state ────────────────────────────────────────────────────────
  const [deliveries, setDeliveries] = useState<DeliveryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Interaction state ─────────────────────────────────────────────────
  /** Per-delivery notes being composed before clicking "Complete" */
  const [deliveryNotes, setDeliveryNotes] = useState<Record<number, string>>({});
  /** delivery_id currently being submitted to the PATCH endpoint */
  const [completingId, setCompletingId] = useState<number | null>(null);
  /** Per-delivery inline error messages from failed complete attempts */
  const [completeErrors, setCompleteErrors] = useState<Record<number, string>>({});
  /** Toast shown briefly after a successful completion */
  const [toast, setToast] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────

  /**
   * Fetches deliveries from GET /api/deliveries with the current filter state.
   * Builds query params from statusFilter, dateFrom, and dateTo.
   * Sets loading/error state around the fetch.
   */
  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build URL with filter query params
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const queryString = params.toString();
      const url = `/api/deliveries${queryString ? `?${queryString}` : ''}`;

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Failed to load deliveries (${res.status})`);
      }

      const data = await res.json();
      setDeliveries(data.items ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo]);

  /** Refetch deliveries whenever filters change */
  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  // ── Mark Complete handler ─────────────────────────────────────────────

  /**
   * Marks a delivery as completed by calling PATCH /api/deliveries/:id/complete.
   * On success: updates the delivery in local state, shows a toast, clears notes.
   * On failure: shows an inline error below the delivery card.
   *
   * @param deliveryId - The primary key of the delivery to complete
   */
  const markComplete = async (deliveryId: number) => {
    // Prevent double-submission
    if (completingId !== null) return;

    setCompletingId(deliveryId);
    // Clear any previous error for this delivery
    setCompleteErrors((prev) => {
      const next = { ...prev };
      delete next[deliveryId];
      return next;
    });

    try {
      const notes = deliveryNotes[deliveryId]?.trim() || undefined;
      const res = await fetch(`/api/deliveries/${deliveryId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notes ? { notes } : {}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.error?.message || `Failed to complete delivery (${res.status})`;
        setCompleteErrors((prev) => ({ ...prev, [deliveryId]: message }));
        return;
      }

      // Update local state: flip status to Completed and set delivered_at
      setDeliveries((prev) =>
        (prev ?? []).map((d) =>
          d.delivery_id === deliveryId
            ? {
                ...d,
                status: 'Completed' as DeliveryStatus,
                delivered_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                notes: notes || d.notes,
              }
            : d
        )
      );

      // Clear notes input for this delivery
      setDeliveryNotes((prev) => {
        const next = { ...prev };
        delete next[deliveryId];
        return next;
      });

      // Show success toast for 3 seconds
      setToast('Delivery marked as completed');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setCompleteErrors((prev) => ({ ...prev, [deliveryId]: message }));
    } finally {
      setCompletingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.02em] text-[#121C2C]">
            Active deliveries
          </h1>
          <p className="text-sm text-[#474554] mt-1">
            Track and complete store-to-customer order deliveries
          </p>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Status pill bar */}
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-4 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-[#4132C7] text-white shadow-sm'
                    : 'bg-[#F5F5FA] text-[#474554] hover:bg-[#ECEAF8]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date range inputs */}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#C8C4D7] text-[13px] text-[#474554] outline-none focus:border-[#4132C7]"
              aria-label="Filter from date"
            />
            <span className="text-[13px] text-[#777586]">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#C8C4D7] text-[13px] text-[#474554] outline-none focus:border-[#4132C7]"
              aria-label="Filter to date"
            />
          </div>
        </div>
      </div>

      {/* ── Success toast ── */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-[#00B69B] text-white px-6 py-3 rounded-[12px] shadow-lg flex items-center gap-2 text-[14px] font-medium animate-[fadeIn_200ms_ease-out]">
          <CheckCircle2 className="w-5 h-5" />
          {toast}
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#4132C7] animate-spin" />
          <span className="ml-3 text-[14px] text-[#474554]">Loading deliveries…</span>
        </div>
      )}

      {/* ── Error state ── */}
      {error && !loading && (
        <div className="bg-[#FFF0F0] border border-[#F93C65]/20 rounded-[16px] p-4 text-[14px] text-[#F93C65] flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && deliveries !== null && deliveries.length === 0 && (
        <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 py-16 text-center">
          <Truck className="w-10 h-10 text-[#C8C4D7] mx-auto mb-3" />
          <p className="text-[14px] text-[#474554]">No deliveries found</p>
          <p className="text-[13px] text-[#777586] mt-1">
            {statusFilter ? 'Try changing the status filter or date range.' : 'Deliveries will appear here once truck schedules are created.'}
          </p>
        </div>
      )}

      {/* ── Delivery cards ── */}
      {!loading && deliveries !== null && deliveries.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {deliveries.map((delivery) => (
            <div
              key={delivery.delivery_id}
              className="bg-white p-6 rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 hover:border-[#C8C4D7] transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                {/* ── Delivery info ── */}
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Order ID badge */}
                    <span className="font-mono text-sm text-[#474554] bg-[#F5F5FA] px-2.5 py-1 rounded font-semibold">
                      ORD-{delivery.order_id}
                    </span>
                    {/* Status badge */}
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getDeliveryBadgeClass(delivery.status)}`}
                    >
                      {delivery.status}
                    </span>
                    {/* Truck + driver info */}
                    <span className="text-xs text-[#777586] flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-[#474554]" />
                      {delivery.truck_plate} ({delivery.driver_name})
                    </span>
                  </div>
                  {/* Customer name */}
                  <h3 className="text-[16px] text-[#121C2C] font-semibold mt-1">
                    {delivery.customer_name}
                  </h3>
                  {/* Delivered-at timestamp for completed deliveries */}
                  {delivery.delivered_at && (
                    <p className="text-[13px] text-[#777586]">
                      Delivered: {delivery.delivered_at}
                    </p>
                  )}
                  {/* Notes display */}
                  {delivery.notes && (
                    <div className="flex items-start gap-2 mt-2 text-[#777586]">
                      <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="text-[13px]">{delivery.notes}</p>
                    </div>
                  )}
                </div>

                {/* ── Complete action (only for active deliveries) ── */}
                {isCompletable(delivery.status) && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      {/* Notes input */}
                      <input
                        type="text"
                        placeholder="Add delivery notes…"
                        value={deliveryNotes[delivery.delivery_id] || ''}
                        onChange={(e) =>
                          setDeliveryNotes({
                            ...deliveryNotes,
                            [delivery.delivery_id]: e.target.value,
                          })
                        }
                        disabled={completingId === delivery.delivery_id}
                        className="flex-1 md:w-52 h-10 px-3 rounded-lg border border-[#C8C4D7] text-[14px] outline-none focus:border-[#4132C7] disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {/* Complete button */}
                      <button
                        onClick={() => markComplete(delivery.delivery_id)}
                        disabled={completingId !== null}
                        className="bg-[#00B69B] hover:bg-[#00a38b] disabled:bg-[#00B69B]/50 disabled:cursor-not-allowed text-white px-5 h-10 rounded-full font-medium transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
                      >
                        {completingId === delivery.delivery_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Complete
                      </button>
                    </div>
                    {/* Inline error for this delivery's completion attempt */}
                    {completeErrors[delivery.delivery_id] && (
                      <p className="text-[12px] text-[#F93C65] flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {completeErrors[delivery.delivery_id]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
