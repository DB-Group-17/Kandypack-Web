"use client";

/**
 * @file app/(dashboard)/orders/[orderId]/page.tsx
 * @description Order Detail page — the full composite view of a single customer order.
 *
 * Page Architecture & Data Flow:
 * - Reads the `orderId` dynamic route segment via `useParams()`.
 * - Loads the entire order in ONE call to `GET /api/orders/:id`, which returns a composite
 *   payload: order header + customer + destination + route + items[] + train_bookings[]
 *   (each with its nested trip and shipped items) + delivery|null + status_history[].
 * - Re-fetching is driven by a `refreshToken` counter rather than a separately memoized
 *   fetch function, so the fetch logic exists in exactly one place and the Retry button
 *   and post-update refresh both simply bump the token.
 * - Role-gated status updates: only roles holding `orders:update_status`
 *   (system_administrator, logistics_manager) see the "Update Status" control at all.
 *   Other permitted roles see the identical page, read-only.
 * - The status dropdown offers only the legal next statuses for the order's current state.
 *   This mirrors the server's finite state machine purely as a UX affordance — the server
 *   in app/api/orders/[id]/status/route.ts remains the sole authority and its rejection
 *   message is surfaced inline if the two ever diverge (e.g. concurrent edits).
 * - Per Docs/05_api-and-pages.md §347, a successful PATCH triggers a full refetch rather
 *   than an optimistic merge: the PATCH response carries neither the new status-history
 *   row nor the cascaded delivery cancellation.
 *
 * Documented design resolution:
 * - Docs/07_content-copy.md specifies Status History as a five-column table, while
 *   UI/order_detail renders it as a vertical timeline. Resolved in favour of the timeline,
 *   with every one of the five specified fields (From → To, Changed By, Date, Notes)
 *   carried inside each timeline entry so no specified content is lost.
 *
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §5,
 *   Docs/05_api-and-pages.md §A4 & §/orders/[orderId], Docs/07_content-copy.md §/orders/[orderId]
 * Visual System: DESIGN.md, Docs/11_ui-rules.md, UI/order_detail
 * Owner: Member 1 (Dineth)
 */

import React, { useState, useEffect, useId } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { hasPermission } from "@/lib/rbac";

/**
 * Canonical order status values, matching the `orders.status` enum in the database
 * and the badge copy in Docs/07_content-copy.md.
 */
type OrderStatus =
  | "Pending"
  | "In Transit"
  | "At Store"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled";

/**
 * Client-side mirror of the server's finite state machine in
 * app/api/orders/[id]/status/route.ts. Used ONLY to populate the dropdown with
 * plausible options — the server re-validates every transition and is authoritative.
 * Terminal states map to an empty array, which also hides the update control entirely.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ["In Transit", "Cancelled"],
  "In Transit": ["At Store", "Cancelled"],
  "At Store": ["Out for Delivery", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};

/** A single order line item joined with its product. */
interface OrderDetailItem {
  order_item_id: number;
  product_id: number;
  sku: string;
  product_name: string;
  category: string | null;
  unit_of_measure: string | null;
  quantity: number;
  unit_price_at_order: string;
  space_rate_at_order: string;
  line_space: string;
  line_value: string;
}

/** One product's allocation onto a specific train booking. */
interface TrainBookingItem {
  booking_item_id: number;
  order_item_id: number;
  product_name: string;
  sku: string;
  quantity_shipped: number;
  space_consumed: number;
}

/**
 * A reservation of cargo space on one train trip. An order with more than one of
 * these was split across trips because a single trip lacked the free capacity.
 */
interface TrainBooking {
  booking_id: number;
  trip_id: number;
  space_booked: string;
  booked_at: string | null;
  trip: {
    trip_id: number;
    departure_datetime: string | null;
    arrival_datetime: string | null;
    total_capacity: string;
    booked_space: string;
    status: string;
    destination_city: string;
  };
  items: TrainBookingItem[];
}

/** The final-mile truck delivery leg; null until a fleet supervisor schedules one. */
interface DeliveryInfo {
  delivery_id: number;
  truck_schedule_id: number;
  status: string;
  delivered_at: string | null;
  notes: string | null;
  exception_reason: string | null;
  schedule: {
    start_time: string | null;
    end_time: string | null;
    truck_plate: string;
    driver_name: string;
    driver_phone: string | null;
    assistant_name: string;
    assistant_phone: string | null;
  };
}

/** One entry in the trigger-written order lifecycle audit trail. */
interface StatusHistoryEntry {
  history_id: number;
  old_status: string | null;
  new_status: string;
  changed_at: string | null;
  changed_by: string | null;
  changed_by_name: string;
  notes: string | null;
}

/** The full composite order payload returned by `GET /api/orders/:id`. */
interface OrderDetail {
  order_id: number;
  status: OrderStatus;
  order_placed_at: string | null;
  expected_delivery_date: string;
  total_value: string;
  total_space_required: string;
  customer: {
    customer_id: number;
    customer_name: string;
    customer_type: "retail" | "wholesale";
    phone: string;
    email: string | null;
    address: string | null;
  };
  destination: {
    city_id: number;
    city_name: string;
    delivery_address: string;
    delivery_area: string;
  };
  route: {
    route_id: number;
    route_name: string | null;
    max_delivery_time_hours: number | null;
  } | null;
  created_by: {
    user_id: string | null;
    display_name: string;
  };
  created_at: string | null;
  updated_at: string | null;
  items: OrderDetailItem[];
  train_bookings: TrainBooking[];
  delivery: DeliveryInfo | null;
  status_history: StatusHistoryEntry[];
}

/**
 * The single message shown for both 404 and 403 responses. The API deliberately
 * returns 404 rather than 403 when a store manager requests an order outside their
 * city, so that order IDs in other regions cannot be probed — showing one shared
 * message here preserves that non-disclosure.
 * Copy source: Docs/07_content-copy.md §/orders/[orderId].
 */
const INACCESSIBLE_MESSAGE =
  "This order doesn't exist or you don't have access to it.";

/**
 * Formats an ISO datetime string as a short calendar date, e.g. "Oct 24, 2023".
 * Returns an em dash for missing values and the raw string if parsing fails, so
 * malformed data degrades gracefully rather than crashing the card.
 *
 * @param {string | null} value - ISO date or datetime string from the API.
 * @returns {string} Formatted calendar date.
 */
function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Formats an ISO datetime string as date plus time, e.g. "Oct 24, 2023, 09:15 AM".
 *
 * @param {string | null} value - ISO datetime string from the API.
 * @returns {string} Formatted date and time.
 */
function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formats a decimal string as Sri Lankan Rupees. DECIMAL columns arrive as strings
 * from the API to avoid floating-point rounding, so the conversion happens here.
 *
 * @param {string} value - Decimal string amount.
 * @param {boolean} [withDecimals=false] - Whether to keep two decimal places.
 * @returns {string} Formatted currency string.
 */
function formatCurrency(value: string, withDecimals: boolean = false): string {
  const numeric = Number(value);
  if (isNaN(numeric)) return `Rs. ${value}`;
  return `Rs. ${numeric.toLocaleString("en-US", {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  })}`;
}

/**
 * Derives 1-2 letter avatar initials from a customer or person name.
 *
 * @param {string} name - Full display name.
 * @returns {string} Uppercase initials.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

/**
 * Semantic pill badge for an order status, matching DESIGN.md's status color
 * language and the badge copy in Docs/07_content-copy.md.
 *
 * Note: intentionally duplicated from the Orders list page rather than extracted
 * to a shared module, per the agreed build plan. If a third page needs this pill,
 * that is the point to extract it into a shared component.
 *
 * @param {OrderStatus} status - The order's current status.
 * @returns {JSX.Element} The rendered status badge.
 */
function StatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    Pending: "bg-[#E0F2FF] text-[#0047CC]",
    "In Transit": "bg-[#EBE9FE] text-[#5B3CDD]",
    "At Store": "bg-[#FFF9E6] text-[#FFB800]",
    "Out for Delivery": "bg-[#F0F3FF] text-[#474554]",
    Delivered: "bg-[#E6F6F4] text-[#00B69B]",
    Cancelled: "bg-[#FFF0F0] text-[#F93C65]",
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/**
 * Card shell shared by every section of the detail layout, providing the standard
 * white surface, 16px radius, ambient shadow and icon-prefixed heading required by
 * Docs/11_ui-rules.md §3.
 *
 * @param {string} title - Section heading text.
 * @param {React.ReactNode} icon - Leading icon element.
 * @param {React.ReactNode} children - Card body content.
 * @param {string} [className] - Optional extra classes for layout control.
 * @returns {JSX.Element} The rendered section card.
 */
function SectionCard({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-[#C8C4D7]/40 shadow-xs p-6 ${className}`}
    >
      <h2 className="text-base font-semibold text-[#121C2C] mb-4 flex items-center gap-2">
        <span className="text-[#4132C7]">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

/**
 * OrderDetailPage renders the complete view of one customer order and, for
 * authorized roles, the status transition workflow.
 *
 * @returns {JSX.Element} The Order Detail page component.
 */
export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const { role } = useAuth();

  const orderId = params?.orderId ?? "";

  // --- Data & Async States ---
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  /** Set when the API returns 404/403 — renders the shared non-disclosure message. */
  const [isInaccessible, setIsInaccessible] = useState<boolean>(false);
  /** Set for unexpected/transport failures — renders the retryable error state. */
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * Bumping this counter re-runs the load effect. Retry and post-update refresh both
   * use it, which keeps the fetch implementation in exactly one place.
   */
  const [refreshToken, setRefreshToken] = useState<number>(0);

  // --- Status Update Modal States ---
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  /** Second step of the modal: the "this cannot be undone" confirmation. */
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- Accessible Form Element IDs ---
  const statusSelectId = useId();
  const notesInputId = useId();

  // Load the composite order record. Re-runs when the route param changes or when
  // `refreshToken` is bumped by Retry / a successful status update.
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      setIsInaccessible(false);

      // Guard against a malformed route segment before spending a request on it.
      const numericId = Number(orderId);
      if (!orderId || !Number.isInteger(numericId) || numericId <= 0) {
        if (!ignore) {
          setIsInaccessible(true);
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/orders/${numericId}`, {
          method: "GET",
          cache: "no-store",
        });

        // 404 and 403 share one message so cross-city order existence stays hidden.
        if (response.status === 404 || response.status === 403) {
          if (!ignore) setIsInaccessible(true);
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message ||
              "Couldn't load this order. Please try again."
          );
        }

        const data = await response.json();
        if (!ignore) setOrder(data.order);
      } catch (err: unknown) {
        console.error("Failed to load order detail:", err);
        if (!ignore) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Couldn't load this order. Please try again."
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [orderId, refreshToken]);

  /**
   * Legal next statuses for the loaded order, from the client-side FSM mirror.
   * Empty for terminal states (Delivered / Cancelled).
   */
  const nextStatuses: OrderStatus[] = order
    ? ALLOWED_TRANSITIONS[order.status] ?? []
    : [];

  /**
   * Whether to render the status control at all: requires both the RBAC capability
   * and an order that still has somewhere legal to go.
   */
  const canUpdateStatus =
    !!role &&
    hasPermission(role, "orders", "update_status") &&
    nextStatuses.length > 0;

  /** Opens the status modal with a clean first step. */
  const handleOpenStatusModal = (): void => {
    setTargetStatus(nextStatuses[0] ?? "");
    setNotes("");
    setIsConfirming(false);
    setUpdateError(null);
    setIsModalOpen(true);
  };

  /** Closes the modal unless a submission is already in flight. */
  const handleCloseStatusModal = (): void => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setIsConfirming(false);
    setUpdateError(null);
  };

  /**
   * Advances the modal from the input step to the confirmation step.
   * The irreversible action is never one click away from the form.
   */
  const handleRequestConfirmation = (e: React.FormEvent): void => {
    e.preventDefault();
    setUpdateError(null);

    if (!targetStatus) {
      setUpdateError("Please choose a status to change this order to.");
      return;
    }

    setIsConfirming(true);
  };

  /**
   * Submits the confirmed status transition to `PATCH /api/orders/:id/status`.
   * On success closes the modal, shows a toast, and refetches the whole order so
   * the new history entry and any cascaded delivery cancellation are reflected.
   * Server rejections (illegal transition, terminal state, concurrent edit) are
   * surfaced verbatim, since the server message names the actual rule that failed.
   */
  const handleConfirmStatusUpdate = async (): Promise<void> => {
    if (!order) return;

    setIsSubmitting(true);
    setUpdateError(null);

    try {
      const response = await fetch(`/api/orders/${order.order_id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error?.message || "Couldn't update this order's status."
        );
      }

      setIsModalOpen(false);
      setIsConfirming(false);
      setToastMessage(`Order #${order.order_id} is now ${targetStatus}.`);
      setTimeout(() => setToastMessage(null), 4000);

      // Refetch rather than merge: the PATCH response carries neither the new
      // status_history row nor the cascaded delivery cancellation.
      setRefreshToken((token) => token + 1);
    } catch (err: unknown) {
      console.error("Failed to update order status:", err);
      setUpdateError(
        err instanceof Error
          ? err.message
          : "Couldn't update this order's status."
      );
      // Drop back to the input step so the choice can be corrected.
      setIsConfirming(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 p-12 text-center shadow-xs">
        <div className="inline-block w-8 h-8 border-3 border-[#4132C7]/30 border-t-[#4132C7] rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#121C2C]">
          Loading order details…
        </p>
      </div>
    );
  }

  // --- Not Found / Forbidden State (shared message, see INACCESSIBLE_MESSAGE) ---
  if (isInaccessible) {
    return (
      <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#F93C65] mx-auto flex items-center justify-center mb-3 text-lg font-bold">
          !
        </div>
        <h1 className="text-base font-semibold text-[#121C2C]">
          {INACCESSIBLE_MESSAGE}
        </h1>
        <Link
          href="/orders"
          className="inline-block mt-5 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all"
        >
          Back to orders
        </Link>
      </div>
    );
  }

  // --- Retryable Error State ---
  if (loadError || !order) {
    return (
      <div className="bg-white rounded-2xl border border-[#F93C65]/30 p-10 text-center shadow-xs">
        <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#F93C65] mx-auto flex items-center justify-center mb-3 text-lg font-bold">
          ⚠
        </div>
        <h1 className="text-base font-semibold text-[#121C2C]">
          {loadError || "Couldn't load this order. Please try again."}
        </h1>
        <button
          type="button"
          onClick={() => setRefreshToken((token) => token + 1)}
          className="mt-4 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-xs"
        >
          Retry
        </button>
      </div>
    );
  }

  // More than one booking means the order overflowed a trip's free capacity and
  // place_order spread it across consecutive trips — the Phase 1 gate scenario.
  const isSplitAcrossTrips = order.train_bookings.length > 1;

  return (
    <div className="space-y-6">
      {/* Success Toast (auto-dismisses after 4s) */}
      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-50 bg-[#121C2C] text-white px-5 py-3.5 rounded-xl shadow-lg flex items-center gap-3 text-sm font-medium"
        >
          <div className="w-5 h-5 rounded-full bg-[#00B69B] flex items-center justify-center text-white text-xs font-bold">
            ✓
          </div>
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-3 text-white/60 hover:text-white"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Page Header: back affordance, order number, live status, key dates */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/orders"
              aria-label="Back to orders"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-[#C8C4D7]/50 text-[#474554] hover:bg-[#F0F3FF] transition-colors shadow-xs"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#121C2C]">
              Order #ORD-{order.order_id}
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-sm text-[#474554] mt-1 ml-11">
            Placed on {formatDate(order.order_placed_at)} • Expected delivery:{" "}
            {formatDate(order.expected_delivery_date)}
          </p>
        </div>

        {/* Status control — absent (not disabled) for roles without the capability,
            and absent for terminal-state orders that have no legal next status. */}
        {canUpdateStatus && (
          <button
            type="button"
            onClick={handleOpenStatusModal}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-sm font-semibold hover:bg-[#3427A8] transition-all shadow-sm hover:shadow-md active:scale-95 shrink-0"
          >
            Update Status
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Bento Grid: 8-column operational detail | 4-column context rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ---------- LEFT COLUMN ---------- */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Order Items — columns per Docs/07_content-copy.md, with SKU surfaced
              beneath the product name as in UI/order_detail. */}
          <SectionCard
            title="Order items"
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-center">Quantity</th>
                    <th className="px-4 py-3 text-right">Unit price</th>
                    <th className="px-4 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3FF] text-xs">
                  {order.items.map((item) => (
                    <tr key={item.order_item_id}>
                      <td className="px-4 py-4">
                        <div className="font-medium text-[#121C2C]">
                          {item.product_name}
                        </div>
                        <div className="text-[11px] text-[#474554] font-mono">
                          {item.sku}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-[#121C2C]">
                        {item.quantity}
                        {item.unit_of_measure ? ` ${item.unit_of_measure}` : ""}
                      </td>
                      <td className="px-4 py-4 text-right text-[#474554]">
                        {formatCurrency(item.unit_price_at_order, true)}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-[#121C2C]">
                        {formatCurrency(item.line_value, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Footer totals row per Docs/07_content-copy.md */}
                <tfoot>
                  <tr className="border-t-2 border-[#C8C4D7]/50 bg-[#F9F9FF]">
                    <td
                      colSpan={2}
                      className="px-4 py-4 text-xs font-semibold text-[#474554]"
                    >
                      Space required: {order.total_space_required} units
                    </td>
                    <td className="px-4 py-4 text-right text-xs font-semibold text-[#474554]">
                      Total
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-bold text-[#121C2C]">
                      {formatCurrency(order.total_value, true)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>

          {/* Rail Transport — one sub-card per train booking */}
          <SectionCard
            title="Rail transport"
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                />
              </svg>
            }
          >
            {/* Capacity-overflow notice per Docs/07_content-copy.md */}
            {isSplitAcrossTrips && (
              <div className="mb-4 p-3 rounded-xl bg-[#FFF9E6] border border-[#FFB800]/30 text-[#835400] text-xs font-medium flex items-start gap-2">
                <span aria-hidden="true">ℹ</span>
                <span>
                  This order was split across {order.train_bookings.length} train
                  trips due to capacity.
                </span>
              </div>
            )}

            {order.train_bookings.length === 0 ? (
              <p className="text-xs text-[#474554]">
                Not yet booked on a train trip.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {order.train_bookings.map((booking) => (
                  <div
                    key={booking.booking_id}
                    className="p-4 rounded-xl border border-[#C8C4D7]/40 bg-[#F9F9FF]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#4132C7]">
                        Trip #{booking.trip.trip_id}
                      </span>
                      <span className="text-[11px] font-semibold text-[#474554]">
                        {booking.trip.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#121C2C] mb-2">
                      Kandy → {booking.trip.destination_city}
                    </p>
                    <div className="space-y-1 text-[11px] text-[#474554]">
                      <div className="flex justify-between gap-2">
                        <span>Departs:</span>
                        <span className="font-medium text-[#121C2C]">
                          {formatDateTime(booking.trip.departure_datetime)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>Arrives:</span>
                        <span className="font-medium text-[#121C2C]">
                          {formatDateTime(booking.trip.arrival_datetime)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 pt-1 border-t border-[#C8C4D7]/30 mt-2">
                        <span>Space booked:</span>
                        <span className="font-semibold text-[#121C2C]">
                          {booking.space_booked} units
                        </span>
                      </div>
                    </div>

                    {/* Which products travelled on this specific trip — the useful
                        detail when an order was split across several trips. */}
                    {booking.items.length > 0 && (
                      <ul className="mt-3 pt-3 border-t border-[#C8C4D7]/30 space-y-1">
                        {booking.items.map((bookingItem) => (
                          <li
                            key={bookingItem.booking_item_id}
                            className="flex justify-between gap-2 text-[11px] text-[#474554]"
                          >
                            <span className="truncate">
                              {bookingItem.product_name}
                            </span>
                            <span className="font-medium text-[#121C2C] shrink-0">
                              ×{bookingItem.quantity_shipped}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ---------- RIGHT COLUMN ---------- */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Customer */}
          <SectionCard
            title="Customer"
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            }
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#F0F3FF] text-[#4132C7] flex items-center justify-center font-semibold">
                {getInitials(order.customer.customer_name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#121C2C] truncate">
                  {order.customer.customer_name}
                </p>
                <p className="text-xs text-[#474554] capitalize">
                  {order.customer.customer_type}
                </p>
              </div>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-[#474554]">Phone</dt>
                <dd className="font-medium text-[#121C2C]">
                  {order.customer.phone}
                </dd>
              </div>
              {order.customer.email && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#474554]">Email</dt>
                  <dd className="font-medium text-[#121C2C] truncate">
                    {order.customer.email}
                  </dd>
                </div>
              )}
            </dl>
          </SectionCard>

          {/* Delivery destination */}
          <SectionCard
            title="Delivery destination"
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            }
          >
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-[#474554]">City</dt>
                <dd className="font-medium text-[#121C2C]">
                  {order.destination.city_name}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#474554]">Area</dt>
                <dd className="font-medium text-[#121C2C] text-right">
                  {order.destination.delivery_area}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#474554] shrink-0">Route</dt>
                <dd className="font-medium text-[#121C2C] text-right">
                  {order.route?.route_name ?? "Not assigned"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 pt-3 border-t border-[#F0F3FF] text-xs text-[#121C2C]">
              {order.destination.delivery_address}
            </p>
          </SectionCard>

          {/* Final-mile delivery status */}
          <SectionCard
            title="Delivery status"
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1h4l3 3v4a1 1 0 01-1 1h-2"
                />
              </svg>
            }
          >
            {!order.delivery ? (
              <p className="text-xs text-[#474554]">
                Not yet scheduled for delivery.
              </p>
            ) : (
              <>
                <div className="mb-3">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#F0F3FF] text-[#4132C7]">
                    {order.delivery.status}
                  </span>
                </div>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#474554]">Truck</dt>
                    <dd className="font-medium text-[#121C2C] font-mono">
                      {order.delivery.schedule.truck_plate}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#474554]">Driver</dt>
                    <dd className="font-medium text-[#121C2C] text-right">
                      {order.delivery.schedule.driver_name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#474554]">Assistant</dt>
                    <dd className="font-medium text-[#121C2C] text-right">
                      {order.delivery.schedule.assistant_name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#474554] shrink-0">Scheduled</dt>
                    <dd className="font-medium text-[#121C2C] text-right">
                      {formatDateTime(order.delivery.schedule.start_time)} –{" "}
                      {formatDateTime(order.delivery.schedule.end_time)}
                    </dd>
                  </div>
                  {order.delivery.delivered_at && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#474554]">Delivered</dt>
                      <dd className="font-medium text-[#00B69B] text-right">
                        {formatDateTime(order.delivery.delivered_at)}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Surface any exception recorded by the fleet team */}
                {order.delivery.exception_reason && (
                  <p className="mt-3 p-2.5 rounded-lg bg-[#FFF0F0] text-[#F93C65] text-[11px] font-medium">
                    {order.delivery.exception_reason}
                  </p>
                )}
              </>
            )}
          </SectionCard>

          {/* Status History — rendered as a timeline carrying all five fields that
              Docs/07_content-copy.md specifies for its table form. See the design
              resolution noted in this file's header block. */}
          <SectionCard
            title="Status history"
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
            className="flex-1"
          >
            {order.status_history.length === 0 ? (
              <p className="text-xs text-[#474554]">No status changes yet.</p>
            ) : (
              <ol className="relative pl-6 space-y-5 before:absolute before:inset-y-1 before:left-[7px] before:w-px before:bg-[#C8C4D7]/50">
                {order.status_history.map((entry, index) => {
                  // The newest entry is the order's live status, so it gets the
                  // filled marker; earlier entries read as completed steps.
                  const isCurrent = index === order.status_history.length - 1;

                  return (
                    <li key={entry.history_id} className="relative">
                      <span
                        aria-hidden="true"
                        className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          isCurrent ? "bg-[#4132C7]" : "bg-[#C8C4D7]"
                        }`}
                      />
                      <p className="text-xs font-semibold text-[#121C2C]">
                        {/* From → To (doc 07's first two columns) */}
                        {entry.old_status
                          ? `${entry.old_status} → ${entry.new_status}`
                          : entry.new_status}
                      </p>
                      <p className="text-[11px] text-[#474554] mt-0.5">
                        {formatDateTime(entry.changed_at)} •{" "}
                        {entry.changed_by_name}
                      </p>
                      {entry.notes && (
                        <p className="text-[11px] text-[#474554] mt-1 italic">
                          {entry.notes}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Update Status Modal — two steps in one surface: choose, then confirm */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={handleCloseStatusModal}
          />

          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-[#C8C4D7]/50 p-6 z-10">
            <div className="flex items-start justify-between pb-4 border-b border-[#F0F3FF]">
              <div>
                <h2
                  id="status-modal-title"
                  className="text-lg font-bold text-[#121C2C]"
                >
                  Update status
                </h2>
                <p className="text-xs text-[#474554] mt-0.5">
                  Order #ORD-{order.order_id} — currently {order.status}
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCloseStatusModal}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#474554] hover:bg-[#F0F3FF] transition-colors disabled:opacity-50"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Server-side rejections surface here verbatim — the message names the
                specific rule that failed (illegal transition, terminal state, etc). */}
            {updateError && (
              <div
                role="alert"
                className="mt-4 p-3 rounded-xl bg-[#FFF0F0] border border-[#F93C65]/30 text-[#F93C65] text-xs font-medium"
              >
                {updateError}
              </div>
            )}

            {!isConfirming ? (
              /* Step 1 — choose the target status and optional notes */
              <form onSubmit={handleRequestConfirmation} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor={statusSelectId}
                    className="block text-xs font-semibold text-[#121C2C] mb-1.5"
                  >
                    Change status to
                  </label>
                  <select
                    id={statusSelectId}
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value)}
                    className="w-full text-sm bg-white border border-[#C8C4D7] rounded-lg px-3.5 py-2.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
                    required
                  >
                    {nextStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={notesInputId}
                    className="block text-xs font-semibold text-[#121C2C] mb-1.5"
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    id={notesInputId}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Add context for this status change…"
                    className="w-full text-sm bg-white border border-[#C8C4D7] rounded-lg px-3.5 py-2.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7] resize-none"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#F0F3FF]">
                  <button
                    type="button"
                    onClick={handleCloseStatusModal}
                    className="px-5 py-2.5 rounded-full text-xs font-semibold text-[#474554] hover:bg-[#F0F3FF] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-sm active:scale-95"
                  >
                    Update Status
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2 — explicit confirmation of an irreversible change */
              <div className="mt-4">
                <div className="p-4 rounded-xl bg-[#FFF9E6] border border-[#FFB800]/30">
                  <p className="text-sm font-semibold text-[#121C2C]">
                    Change order status to {targetStatus}?
                  </p>
                  <p className="text-xs text-[#835400] mt-1">
                    This cannot be undone.
                  </p>
                </div>

                <div className="pt-4 mt-4 flex items-center justify-end gap-3 border-t border-[#F0F3FF]">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsConfirming(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-semibold text-[#474554] hover:bg-[#F0F3FF] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleConfirmStatusUpdate}
                    className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    <span>{isSubmitting ? "Updating…" : "Confirm"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
