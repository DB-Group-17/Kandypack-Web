'use client';

/**
 * @file app/(dashboard)/truck-schedule/ScheduleCreatedToast.tsx
 * @description Success toast shown on /truck-schedule after a schedule is created.
 * Owner: Member 3 (Fleet & Deliveries).
 *
 * Data flow:
 *   - /truck-schedule/new redirects here with `?placed=1&route_name={name}` on a 201,
 *     because a toast rendered on the form page would not survive the navigation.
 *   - On mount this component reads both params once, shows
 *     "Schedule created for {route_name}." (doc 07), and strips them from the URL with
 *     router.replace so a refresh or a filter change does not show the toast again.
 *     Any active filter params are kept.
 *
 * Mirrors the `?placed=1` toast on /orders/[orderId] (same styling and 4s auto-dismiss).
 * Must be rendered inside a Suspense boundary because it calls useSearchParams().
 */

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** How long the toast stays visible before dismissing itself. */
const TOAST_DURATION_MS = 4000;

/**
 * Reads the one-shot `placed` flag from the URL and renders the creation toast.
 *
 * @returns The toast element while visible, otherwise null
 */
export default function ScheduleCreatedToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Capture the flag and route name at first render only (lazy state init): once the
  // URL is cleaned below, searchParams no longer carries them, but the toast must stay up.
  const [initial] = useState(() => ({
    placed: searchParams.get('placed') === '1',
    routeName: searchParams.get('route_name'),
  }));

  // Toast text is derived from the captured params; null once dismissed.
  // Falls back to generic wording if the route name was not passed.
  const [message, setMessage] = useState<string | null>(() => {
    if (!initial.placed) return null;
    return initial.routeName ? `Schedule created for ${initial.routeName}.` : 'Schedule created.';
  });

  /**
   * One-shot side effects for a fresh redirect: strip the flag from the URL and
   * schedule auto-dismiss. Runs only when the page was reached with ?placed=1.
   */
  useEffect(() => {
    if (!initial.placed) return;

    // Remove only the toast params; keep filters (date_from, status, …) intact.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('placed');
    params.delete('route_name');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    const timer = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // Intentionally run once on mount; the captured initial params are the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 bg-[#121C2C] text-white px-5 py-3.5 rounded-xl shadow-lg flex items-center gap-3 text-sm font-medium"
    >
      <div
        className="w-5 h-5 rounded-full bg-[#00B69B] flex items-center justify-center text-white text-xs font-bold"
        aria-hidden="true"
      >
        ✓
      </div>
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setMessage(null)}
        className="ml-3 text-white/60 hover:text-white"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
