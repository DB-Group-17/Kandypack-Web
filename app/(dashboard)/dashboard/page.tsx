'use client';

/**
 * @file app/(dashboard)/dashboard/page.tsx
 * @description Dashboard page (/dashboard) — the landing page for every staff role.
 * Owner: Member 5 (Desandu).
 *
 * Page structure (top to bottom):
 *   1. Header      — "Dashboard" title and "Welcome back, {display_name}".
 *   2. KPI cards   — Pending orders, Today's departures, Active truck schedules, Low stock
 *                    alerts. Each card links to its module ("View all →").
 *   3. Lists       — Today's departures and Low stock alerts, side by side on desktop and
 *                    stacked on mobile (12-column pattern from Docs/11_ui-rules.md §8).
 *   4. States      — loading ("Loading your dashboard…") and error ("Couldn't load dashboard
 *                    data." with Retry) replace the cards and lists.
 *
 * Data flow:
 *   - GET /api/dashboard/summary returns the four aggregates, already scoped to the user's role
 *     (store managers only receive their own store's data) and cached in Redis for ~30 s.
 *   - Fetching waits for the session (useAuth) so the request is never sent before the role
 *     is known.
 *   - The page refetches every 60 s and whenever the browser window regains focus. Background
 *     refreshes keep the last good data on screen: the loading state shows only before the
 *     first response, and the error state shows only when there is no data to fall back on.
 *
 * User interactions:
 *   - Clicking a KPI card navigates to its module (orders filtered to Pending, train schedule,
 *     truck schedule, inventory).
 *   - "Retry" in the error state clears the error and fetches again.
 *
 * Page-specific logic:
 *   - A zero count swaps the card's value label for its empty-state copy (Docs/07).
 *   - The page shows no trend figures or invented actions; it renders exactly the values the
 *     API returns.
 *
 * References:
 *   - Docs/05_api-and-pages.md §A2 and Part B "/dashboard"
 *   - Docs/07_content-copy.md "/dashboard"
 *   - DESIGN.md §2 colours, §3 typography, §5 shape; Docs/11_ui-rules.md §3 cards, §8 layout
 *   - UI/dashboard (layout reference only)
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ClipboardList, Loader2, MapPin, Package, TrainFront, Truck, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessRoute } from '@/lib/rbac';
import type { DashboardSummary } from '@/app/api/dashboard/summary/route';
import { formatTime } from '@/lib/format';

// ─── Constants ──────────────────────────────────────────────────────────────

/** How often the summary is refetched while the page stays open (Docs/05 Part B: ~60 s). */
const REFRESH_INTERVAL_MS = 60_000;

/** Maximum rows shown in each list; the module pages hold the full data behind "View all →". */
const LIST_ROW_LIMIT = 6;

/** Definition of one KPI card; the value and label are derived from the API response. */
interface KpiCardConfig {
  /** Stable id used for the React key and test hooks. */
  id: string;
  /** Card title from Docs/07. */
  title: string;
  /** Module the card links to. */
  href: string;
  /** Icon shown in the tinted container. */
  icon: React.ReactNode;
  /** Tailwind classes for the icon container (DESIGN.md §2 semantic pairs). */
  iconClass: string;
  /** Number shown in large type. */
  value: number;
  /** Copy used when the value is greater than zero. */
  label: string;
  /** Copy used when the value is zero. */
  emptyLabel: string;
}

// ─── Components ─────────────────────────────────────────────────────────────

/**
 * Renders one KPI card. When the signed-in role can open the card's module it is a link with a
 * "View all →" hint; otherwise it is a plain, non-interactive box showing the same numbers.
 *
 * @param props.card    - Card definition with the derived value and copy
 * @param props.canOpen - Whether the current role may open `card.href` (from `canAccessRoute`)
 * @returns A focusable link card, or a static card with no link when the role has no access
 */
function KpiCard({ card, canOpen }: { card: KpiCardConfig; canOpen: boolean }): React.JSX.Element {
  const isEmpty = card.value === 0;
  const baseClass = 'flex flex-col rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]';

  const content = (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.iconClass}`} aria-hidden="true">
          {card.icon}
        </span>
        <h2 className="text-sm font-semibold text-[#474554]">{card.title}</h2>
      </div>
      <p className="text-[32px] font-semibold leading-10 text-[#121C2C]">{card.value}</p>
      <p className="mt-2 text-xs font-medium text-[#474554]">{isEmpty ? card.emptyLabel : card.label}</p>
      {canOpen && (
        <span className="mt-4 text-xs font-semibold text-[#4132C7] group-hover:underline">View all →</span>
      )}
    </>
  );

  // No access: render a static box so there is no link, hover lift or pointer cursor
  if (!canOpen) {
    return (
      <div id={`dashboard-card-${card.id}`} className={baseClass}>
        {content}
      </div>
    );
  }

  return (
    <Link
      id={`dashboard-card-${card.id}`}
      href={card.href}
      className={`group ${baseClass} transition-all duration-150 hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4132C7]`}
    >
      {content}
    </Link>
  );
}

/**
 * DashboardPage — fetches and renders the role-scoped operational summary.
 *
 * @returns The dashboard page content (rendered inside app/(dashboard)/layout.tsx)
 */
export default function DashboardPage(): React.JSX.Element {
  const { user, isLoading: isAuthLoading } = useAuth();

  // Latest successful response; stays on screen during background refreshes
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  // Message from the most recent failed request, cleared by the next success or Retry
  const [error, setError] = useState<string | null>(null);
  // Incremented to trigger a refetch (interval, window focus, Retry)
  const [refreshTick, setRefreshTick] = useState<number>(0);

  /**
   * Requests a fresh summary by bumping the refresh counter that the fetch effect depends on.
   * Used by the interval, the focus listener and the Retry button.
   */
  const requestRefresh = useCallback((): void => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  /**
   * Fetches GET /api/dashboard/summary whenever the session is ready or a refresh is requested.
   * A cancelled flag drops responses that arrive after the effect re-ran or the page unmounted.
   */
  useEffect(() => {
    if (isAuthLoading || !user) return;
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const response = await fetch('/api/dashboard/summary', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const body = (await response.json()) as DashboardSummary;
        if (cancelled) return;
        setSummary(body);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[Dashboard] Failed to load summary:', err);
        setError("Couldn't load dashboard data.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, user, refreshTick]);

  /** Sets up the 60-second poll and the refetch-on-focus listener; both are removed on unmount. */
  useEffect(() => {
    const intervalId = window.setInterval(requestRefresh, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', requestRefresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', requestRefresh);
    };
  }, [requestRefresh]);

  /**
   * Retry handler for the error state: clears the error so the loading state shows,
   * then fetches again.
   */
  const handleRetry = (): void => {
    setError(null);
    requestRefresh();
  };

  /**
   * Tells whether the signed-in role may open a module page, so "View all →" is only offered
   * where the destination is reachable. Uses the same rules as the sidebar and the Proxy
   * (`canAccessRoute`); a query string such as `?status=Pending` is ignored for the check.
   *
   * @param href - Destination path, optionally with a query string
   * @returns True when a role is known and may open the page
   */
  const canOpen = (href: string): boolean =>
    user?.role ? canAccessRoute(user.role, href.split('?')[0]) : false;

  // Loading until the first response; error only when there is no earlier data to show
  const showLoading = !summary && !error;
  const showError = !summary && Boolean(error);

  // Card definitions are derived from the response so the markup stays declarative
  const cards: KpiCardConfig[] = summary
    ? [
        {
          id: 'pending-orders',
          title: 'Pending orders',
          href: '/orders?status=Pending',
          icon: <ClipboardList className="h-5 w-5" />,
          iconClass: 'bg-[#E0F2FF] text-[#0047CC]',
          value: summary.pending_orders,
          label: `${summary.pending_orders} orders awaiting processing`,
          emptyLabel: 'No pending orders',
        },
        {
          id: 'todays-departures',
          title: "Today's departures",
          href: '/train-schedule',
          icon: <TrainFront className="h-5 w-5" />,
          iconClass: 'bg-[#FFF9E6] text-[#FFB800]',
          value: summary.todays_departures.length,
          label: `${summary.todays_departures.length} trains departing today`,
          emptyLabel: 'No departures scheduled today',
        },
        {
          id: 'active-truck-schedules',
          title: 'Active truck schedules',
          href: '/truck-schedule',
          icon: <Truck className="h-5 w-5" />,
          iconClass: 'bg-[#E6F6F4] text-[#00B69B]',
          value: summary.active_truck_schedules,
          label: `${summary.active_truck_schedules} deliveries in progress`,
          emptyLabel: 'No active schedules',
        },
        {
          id: 'low-stock-alerts',
          title: 'Low stock alerts',
          href: '/inventory',
          icon: <TriangleAlert className="h-5 w-5" />,
          iconClass: 'bg-[#FFF0F0] text-[#F93C65]',
          value: summary.low_stock_alerts.length,
          label: `${summary.low_stock_alerts.length} products running low`,
          emptyLabel: 'All stock levels healthy',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <header>
        <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.02em] text-[#121C2C]">Dashboard</h1>
        <p className="mt-1 text-base text-[#474554]">
          Welcome back{user?.display_name ? `, ${user.display_name}` : ''}
        </p>
      </header>

      {/* 4. Loading state */}
      {showLoading && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-2xl bg-white p-12 text-sm font-medium text-[#474554] shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
        >
          <Loader2 className="h-5 w-5 animate-spin text-[#4132C7]" aria-hidden="true" />
          Loading your dashboard…
        </div>
      )}

      {/* 4. Error state */}
      {showError && (
        <div
          role="alert"
          className="flex flex-col items-center gap-4 rounded-2xl bg-white p-12 text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF0F0] text-[#F93C65]">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-[#121C2C]">{error}</p>
          <button
            id="dashboard-retry"
            type="button"
            onClick={handleRetry}
            className="h-10 cursor-pointer rounded-full bg-[#4132C7] px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#3527A8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4132C7] focus-visible:ring-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {summary && (
        <>
          {/* 2. KPI cards: 4 equal columns on desktop, 2 on tablet, 1 on mobile */}
          <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <KpiCard key={card.id} card={card} canOpen={canOpen(card.href)} />
            ))}
          </section>

          {/* 3. Lists: 6/6 split on desktop */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section
              aria-labelledby="dashboard-departures-heading"
              className="rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="dashboard-departures-heading" className="text-xl font-semibold text-[#121C2C]">
                  Today&apos;s departures
                </h2>
                {canOpen('/train-schedule') && (
                  <Link href="/train-schedule" className="text-xs font-semibold text-[#4132C7] hover:underline">
                    View all →
                  </Link>
                )}
              </div>
              {summary.todays_departures.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#474554]">No departures scheduled today</p>
              ) : (
                <ul className="divide-y divide-[#C8C4D7]/40">
                  {summary.todays_departures.slice(0, LIST_ROW_LIMIT).map((trip) => (
                    <li key={trip.trip_id} className="flex items-center gap-3 py-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0F3FF] text-[#4132C7]"
                        aria-hidden="true"
                      >
                        <MapPin className="h-5 w-5" />
                      </span>
                      <p className="text-sm font-semibold text-[#121C2C]">
                        {trip.destination_city} — departs {formatTime(trip.departure_datetime)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="dashboard-low-stock-heading"
              className="rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="dashboard-low-stock-heading" className="text-xl font-semibold text-[#121C2C]">
                  Low stock alerts
                </h2>
                {canOpen('/inventory') && (
                  <Link href="/inventory" className="text-xs font-semibold text-[#4132C7] hover:underline">
                    View all →
                  </Link>
                )}
              </div>
              {summary.low_stock_alerts.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#474554]">All stock levels healthy</p>
              ) : (
                <ul className="divide-y divide-[#C8C4D7]/40">
                  {summary.low_stock_alerts.slice(0, LIST_ROW_LIMIT).map((alert) => (
                    <li
                      key={`${alert.store_id}-${alert.product_name}`}
                      className="flex items-center gap-3 py-3"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF0F0] text-[#F93C65]"
                        aria-hidden="true"
                      >
                        <Package className="h-5 w-5" />
                      </span>
                      <p className="text-sm font-semibold text-[#121C2C]">
                        {alert.product_name} at {alert.store_name} — {alert.quantity_on_hand} units left
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
