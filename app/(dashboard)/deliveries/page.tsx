'use client';

/**
 * @file app/(dashboard)/deliveries/page.tsx
 * @description Deliveries page (/deliveries) — wired to real data.
 * Owner: Member 3 (Fleet & Deliveries).
 *
 * Page structure (top to bottom):
 *   1. Toast        — success message after a delivery is completed.
 *   2. Header       — "Deliveries" title and subtitle (Docs/07_content-copy.md).
 *   3. Filter card  — status pills plus a created-date range.
 *   4. Results card — table on desktop, stacked cards on narrow screens
 *                     (DESIGN.md §7 item 4), with loading / error / empty states.
 *   5. Dialog       — "Complete delivery for Order #{id}?" with optional notes.
 *
 * Data flow:
 *   - The list comes from GET /api/deliveries (status, date_from, date_to). The page
 *     keeps ONE `result` object tagged with the query key it belongs to; "loading" is
 *     derived (result is missing or belongs to an older query) instead of being set
 *     synchronously inside the effect, and a late response for an old query is ignored.
 *   - Fetching waits for the session (useAuth) so a full page load never fires a
 *     request before the role is known.
 *   - Completing a delivery calls PATCH /api/deliveries/:id/complete, which runs the
 *     complete_delivery() procedure in a transaction. On success the dialog closes, a
 *     toast appears and the list is refetched so every field (status, delivered_at)
 *     shows what the server really stored.
 *
 * User interactions:
 *   - Status pills and date inputs refetch the list.
 *   - "Mark complete" opens the dialog; Confirm calls the API, Cancel / Escape /
 *     backdrop click closes it (blocked while a request is in flight).
 *   - Server rejections (e.g. not enough stock at the store) appear inside the dialog
 *     and nothing is changed, because the database rolls the whole completion back.
 *
 * Page-specific logic:
 *   - Only 'Scheduled' and 'In Progress' deliveries can be completed from the UI.
 *     'Completed', 'Failed' and 'Cancelled' rows are read-only.
 *   - The /deliveries route itself is limited to system_administrator and
 *     fleet_supervisor (lib/rbac.ts ROUTE_PERMISSIONS); the same roles are checked here
 *     as a fallback so a restricted role never sees a broken page.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A8 and Part B "/deliveries"
 *   - Docs/07_content-copy.md "/deliveries"
 *   - DESIGN.md §2 colours, §3 typography, §5 shape; Docs/11_ui-rules.md §5 badges, §6 tables
 *   - types/fleet.ts DeliveryItem, DeliveryStatus
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MessageSquare, Truck, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { DeliveryItem, DeliveryStatus } from '@/types/fleet';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Roles allowed to open this page (mirrors ROUTE_PERMISSIONS['/deliveries']). */
const ALLOWED_ROLES = ['system_administrator', 'fleet_supervisor'];

/** Status filter pills. An empty value means "no status filter". */
const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Scheduled', value: 'Scheduled' },
  { label: 'In progress', value: 'In Progress' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Failed', value: 'Failed' },
  { label: 'Cancelled', value: 'Cancelled' },
];

/** How long the success toast stays on screen (Docs/07: toasts auto-dismiss after 4 s). */
const TOAST_DURATION_MS = 4000;

/** Success copy from Docs/07_content-copy.md "/deliveries". */
const SUCCESS_MESSAGE = 'Delivery marked complete. Order status updated to Delivered.';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns semantic badge classes for a delivery status.
 * Uses the DESIGN.md §2 semantic pairs: success, warning, info, error, neutral.
 *
 * @param status - Current lifecycle status of the delivery
 * @returns Tailwind classes for the pill background and text colour
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
 * Returns true if the delivery can be completed from the UI.
 * Only 'Scheduled' and 'In Progress' deliveries are eligible.
 *
 * @param status - The delivery's current status
 * @returns Whether the "Mark complete" action should be shown
 */
function isCompletable(status: DeliveryStatus): boolean {
  return status === 'In Progress' || status === 'Scheduled';
}

/**
 * Formats an ISO 8601 timestamp from the API for display in the viewer's locale.
 * Falls back to the raw text if it cannot be parsed, and to an em dash when empty.
 *
 * @param iso - ISO timestamp string or null/undefined
 * @returns Human-readable date and time, or "—"
 */
function formatDeliveredAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Shape of one fetch outcome, tagged with the query it answers. */
interface LoadResult {
  /** The query key (filters + refresh counter) this result belongs to. */
  key: string;
  /** Rows on success. */
  items: DeliveryItem[];
  /** Error message when the request failed, otherwise null. */
  error: string | null;
}

// ─── Page component ─────────────────────────────────────────────────────────

/**
 * DeliveriesPage lists customer order deliveries from GET /api/deliveries and lets
 * authorised staff complete them through a confirmation dialog.
 *
 * @returns The rendered Deliveries interface
 */
export default function DeliveriesPage(): React.JSX.Element {
  const { role, isLoading: authLoading } = useAuth();
  const canView = !!role && ALLOWED_ROLES.includes(role);

  // ── Filter state ──────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  /** Bumped to force a refetch (Retry button, after a completion). */
  const [refreshTick, setRefreshTick] = useState(0);

  // ── Data state ────────────────────────────────────────────────────────
  const [result, setResult] = useState<LoadResult | null>(null);

  // ── Interaction state ─────────────────────────────────────────────────
  /** Delivery currently open in the completion dialog, or null when closed. */
  const [dialogDelivery, setDialogDelivery] = useState<DeliveryItem | null>(null);
  /** Success toast text, or null when hidden. */
  const [toast, setToast] = useState<string | null>(null);

  /** Identifies the query this render wants; results for other keys are stale. */
  const queryKey = `${statusFilter}|${dateFrom}|${dateTo}|${refreshTick}`;

  /**
   * Fetches the delivery list whenever the filters, the refresh counter or the
   * session change. State is only set after the awaited fetch (never synchronously
   * in the effect body), and a `cancelled` flag drops responses that arrive after
   * the query has already changed or the page was left.
   */
  useEffect(() => {
    if (authLoading || !canView) return;

    let cancelled = false;

    /** Builds the URL from the filters, calls the API and stores the tagged result. */
    const load = async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const qs = params.toString();

      try {
        const res = await fetch(`/api/deliveries${qs ? `?${qs}` : ''}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message || `Couldn't load deliveries (${res.status}).`);
        }
        const data = await res.json();
        if (!cancelled) setResult({ key: queryKey, items: data.items ?? [], error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        setResult({ key: queryKey, items: [], error: message });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canView, statusFilter, dateFrom, dateTo, queryKey]);

  /** Hides the toast after its display time; cleared if the toast changes or the page unmounts. */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  /** True while the visible result is missing or answers an older query. */
  const loading = !result || result.key !== queryKey;
  const items = useMemo(() => (loading ? [] : result?.items ?? []), [loading, result]);
  const error = loading ? null : result?.error ?? null;

  /**
   * Called by the dialog after the server accepted the completion: closes the dialog,
   * shows the toast and refetches so the row reflects the stored values.
   */
  const handleCompleted = useCallback(() => {
    setDialogDelivery(null);
    setToast(SUCCESS_MESSAGE);
    setRefreshTick((t) => t + 1);
  }, []);

  // ── Guards ────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 className="w-6 h-6 text-[#4132C7] animate-spin" aria-hidden="true" />
        <span className="ml-3 text-[14px] text-[#474554]">Loading…</span>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="bg-white rounded-[16px] p-8 border border-[#C8C4D7]/40 shadow-[0_4px_20px_rgba(0,0,0,0.04)] max-w-lg mx-auto text-center mt-12">
        <AlertCircle className="w-10 h-10 text-[#F93C65] mx-auto mb-3" aria-hidden="true" />
        <p className="text-[14px] text-[#474554]">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Success toast ── */}
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 bg-[#00B69B] text-white px-5 py-3 rounded-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] flex items-center gap-2 text-[14px] font-medium"
          role="status"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
          {toast}
        </div>
      )}

      {/* ── Page header ── */}
      <div>
        <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.02em] text-[#121C2C]">
          Deliveries
        </h1>
        <p className="text-[14px] text-[#474554] mt-1">Track and complete last-mile deliveries</p>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Status pills */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value || 'all'}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                aria-pressed={statusFilter === opt.value}
                className={`px-4 h-10 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
                  statusFilter === opt.value
                    ? 'bg-[#4132C7] text-white shadow-sm'
                    : 'bg-[#F5F5FA] text-[#474554] hover:bg-[#ECEAF8]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Created-date range */}
          <div className="flex items-center gap-2 lg:ml-auto">
            <label className="sr-only" htmlFor="deliveries-date-from">From date</label>
            <input
              id="deliveries-date-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#C8C4D7] bg-white text-[13px] text-[#474554] focus:outline-none focus:border-[#4132C7] focus:ring-2 focus:ring-[#4132C7]/20"
            />
            <span className="text-[13px] text-[#777586]">to</span>
            <label className="sr-only" htmlFor="deliveries-date-to">To date</label>
            <input
              id="deliveries-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#C8C4D7] bg-white text-[13px] text-[#474554] focus:outline-none focus:border-[#4132C7] focus:ring-2 focus:ring-[#4132C7]/20"
            />
          </div>
        </div>
      </div>

      {/* ── Results card ── */}
      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 overflow-hidden">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16" role="status">
            <Loader2 className="w-6 h-6 text-[#4132C7] animate-spin" aria-hidden="true" />
            <span className="ml-3 text-[14px] text-[#474554]">Loading deliveries…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="py-12 px-6 text-center" role="alert">
            <AlertCircle className="w-10 h-10 text-[#F93C65] mx-auto mb-3" aria-hidden="true" />
            <p className="text-[14px] font-semibold text-[#121C2C]">Something went wrong.</p>
            <p className="text-[13px] text-[#777586] mt-1">{error}</p>
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              className="mt-4 h-10 px-6 rounded-full bg-[#4132C7] text-white text-[14px] font-medium hover:bg-[#3527A8] transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <div className="py-16 text-center">
            <Truck className="w-10 h-10 text-[#C8C4D7] mx-auto mb-3" aria-hidden="true" />
            <p className="text-[14px] text-[#474554]">No deliveries match this filter.</p>
          </div>
        )}

        {/* Desktop table */}
        {!loading && !error && items.length > 0 && (
          <>
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/40">
                    {['Order', 'Customer', 'Truck & driver', 'Status', 'Delivered on', 'Action'].map(
                      (col) => (
                        <th
                          key={col}
                          scope="col"
                          className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#777586]"
                        >
                          {col}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.delivery_id} className="border-b border-[#C8C4D7]/30 last:border-0 min-h-14">
                      <td className="px-6 py-4 text-[14px] font-semibold text-[#4132C7]">#{d.order_id}</td>
                      <td className="px-6 py-4">
                        <p className="text-[14px] font-semibold text-[#121C2C]">{d.customer_name}</p>
                        {d.notes && (
                          <p className="mt-1 flex items-start gap-1.5 text-[12px] text-[#777586]">
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                            {d.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[14px] text-[#121C2C]">{d.truck_plate}</p>
                        <p className="text-[12px] text-[#777586]">Driver: {d.driver_name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getDeliveryBadgeClass(d.status)}`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[14px] text-[#474554]">
                        {formatDeliveredAt(d.delivered_at)}
                      </td>
                      <td className="px-6 py-4">
                        {isCompletable(d.status) ? (
                          <button
                            type="button"
                            onClick={() => setDialogDelivery(d)}
                            className="h-10 px-5 rounded-full bg-[#4132C7] text-white text-[13px] font-medium hover:bg-[#3527A8] transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Mark complete
                          </button>
                        ) : (
                          <span className="text-[13px] text-[#777586]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card transformation (DESIGN.md §7 item 4) */}
            <ul className="xl:hidden divide-y divide-[#C8C4D7]/30">
              {items.map((d) => (
                <li key={d.delivery_id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold text-[#4132C7]">Order #{d.order_id}</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getDeliveryBadgeClass(d.status)}`}
                    >
                      {d.status}
                    </span>
                  </div>
                  <p className="text-[16px] font-semibold text-[#121C2C]">{d.customer_name}</p>
                  <p className="text-[13px] text-[#474554]">
                    {d.truck_plate} · Driver: {d.driver_name}
                  </p>
                  <p className="text-[13px] text-[#777586]">
                    Delivered on: {formatDeliveredAt(d.delivered_at)}
                  </p>
                  {d.notes && (
                    <p className="flex items-start gap-1.5 text-[12px] text-[#777586]">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      {d.notes}
                    </p>
                  )}
                  {isCompletable(d.status) && (
                    <button
                      type="button"
                      onClick={() => setDialogDelivery(d)}
                      className="w-full h-12 rounded-full bg-[#4132C7] text-white text-[14px] font-medium hover:bg-[#3527A8] transition-colors cursor-pointer"
                    >
                      Mark complete
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {/* Footer count (Docs/07 style: "Showing … of …") */}
            <p className="px-6 py-4 text-[13px] text-[#777586] border-t border-[#C8C4D7]/30">
              Showing {items.length} {items.length === 1 ? 'delivery' : 'deliveries'}
            </p>
          </>
        )}
      </div>

      {/* ── Completion dialog ── */}
      {dialogDelivery && (
        <CompleteDeliveryDialog
          delivery={dialogDelivery}
          onClose={() => setDialogDelivery(null)}
          onCompleted={handleCompleted}
        />
      )}
    </div>
  );
}

// ─── Completion dialog ──────────────────────────────────────────────────────

/** Props for CompleteDeliveryDialog. */
interface CompleteDeliveryDialogProps {
  /** The delivery being completed. */
  delivery: DeliveryItem;
  /** Closes the dialog without changes (also used by Cancel, Escape and the backdrop). */
  onClose: () => void;
  /** Called after the server accepted the completion. */
  onCompleted: () => void;
}

/**
 * Modal that confirms completing one delivery and collects optional notes
 * (Docs/07: "Complete delivery for Order #{order_id}?").
 *
 * Behaviour:
 *   - Focuses the notes field on open and returns focus to the previously focused
 *     control (the "Mark complete" button) on close.
 *   - Escape, Cancel, the close button and the backdrop dismiss it, except while the
 *     request is in flight so the user cannot lose track of a pending completion.
 *   - Confirm calls PATCH /api/deliveries/:id/complete. A rejection (400 business rule,
 *     409 already being completed, 403/401, network) is shown inside the dialog and the
 *     dialog stays open; nothing was changed because the server rolls back on failure.
 *
 * @param props - Delivery, close and completed callbacks
 * @returns The dialog markup
 */
function CompleteDeliveryDialog({
  delivery,
  onClose,
  onCompleted,
}: CompleteDeliveryDialogProps): React.JSX.Element {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  /** Closes unless a request is pending. */
  const requestClose = useCallback(() => {
    if (!submitting) onClose();
  }, [submitting, onClose]);

  /** Moves focus into the dialog on open and restores it on close. */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    notesRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  /** Closes the dialog on Escape. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  /**
   * Sends the completion request. On success notifies the page; on failure shows the
   * server's message (or a generic one) inside the dialog.
   */
  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const trimmed = notes.trim();
      const res = await fetch(`/api/deliveries/${delivery.delivery_id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmed ? { notes: trimmed } : {}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrorMessage(
          body?.error?.message || "Couldn't complete this delivery. Please try again."
        );
        return;
      }

      onCompleted();
    } catch {
      setErrorMessage("Couldn't complete this delivery. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-delivery-title"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" onClick={requestClose} aria-hidden="true" />

      {/* Surface */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#C8C4D7]/40">
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id="complete-delivery-title" className="text-[20px] font-semibold leading-7 text-[#121C2C]">
              Complete delivery for Order #{delivery.order_id}?
            </h2>
            <p className="text-[13px] text-[#474554] mt-1">
              {delivery.customer_name} · {delivery.truck_plate}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close dialog"
            className="p-1.5 rounded-full text-[#777586] hover:text-[#121C2C] hover:bg-[#F5F5FA] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Server or network error */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-[#FFF0F0] border border-[#F93C65]/30 text-[#F93C65] p-3 text-[13px]"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Optional notes — persistent label above the field (Docs/11_ui-rules.md §4) */}
          <div>
            <label htmlFor="complete-delivery-notes" className="block text-[12px] font-semibold text-[#474554] mb-1.5">
              Notes (optional)
            </label>
            <textarea
              id="complete-delivery-notes"
              ref={notesRef}
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              placeholder="e.g. Delivered to receptionist"
              className="w-full px-3 py-2.5 rounded-lg border border-[#C8C4D7] bg-white text-[14px] text-[#121C2C] placeholder-[#777586] focus:outline-none focus:border-[#4132C7] focus:ring-2 focus:ring-[#4132C7]/20 disabled:opacity-60 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="h-10 px-5 rounded-full border border-[#4132C7] text-[#4132C7] text-[14px] font-medium hover:bg-[#F5F5FA] disabled:opacity-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="h-10 px-6 rounded-full bg-[#4132C7] text-white text-[14px] font-medium hover:bg-[#3527A8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Completing…' : 'Confirm completion'}
          </button>
        </div>
      </div>
    </div>
  );
}
