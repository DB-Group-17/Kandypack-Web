'use client';

/**
 * @file app/(dashboard)/truck-schedule/new/page.tsx
 * @description /truck-schedule/new — New Truck Schedule form (Member 3, Phase 1 Part 3 rewire).
 *
 * Structure & Data Flow:
 * 1. On mount, fetches four reference lists in parallel:
 *    - GET /api/trucks    → Truck dropdown (plate + capacity)
 *    - GET /api/drivers   → Driver dropdown (name + live roster hours)
 *    - GET /api/assistants → Assistant dropdown (name + live roster hours)
 *    - GET /api/routes    → Route dropdown (name + max delivery hours)
 *    Each has its own loading flag; dropdowns render a "Loading…" option while pending.
 *
 * 2. All five form fields (truck_id, driver_id, assistant_id, route_id, start_time) are
 *    controlled. The Submit button is disabled until every field has a value.
 *
 * 3. Debounced conflict pre-check (600 ms):
 *    - Fires whenever any form field changes, provided all 5 fields are filled.
 *    - Calls GET /api/truck-schedules/conflicts?truck_id=&driver_id=&assistant_id=&route_id=&start_time=
 *    - Response { has_conflict: boolean, reasons: string[] } drives the warning banner.
 *    - The check is cancelled and reset when any field is cleared.
 *
 * 4. Form submit → POST /api/truck-schedules
 *    - 201: redirects to /truck-schedule (schedule created successfully).
 *    - 400: shows the business-rule violation message inline below the form.
 *    - 423: shows a "system busy, please retry" message (Redis lock not acquired).
 *    - Network error: shows a generic inline error.
 *
 * 5. Roster hour inline display:
 *    - Each driver/assistant option shows "Name (Xh / 40h limit)" from live API data.
 *    - Yellow dot: hours_remaining ≤ 4 (approaching driver weekly limit BR-006).
 *    - Red dot: hours_remaining === 0 (assistant limit exceeded BR-007).
 *
 * Page-specific logic notes:
 * - The conflicts endpoint derives end_time from route.max_delivery_time_hours server-side;
 *   the client does not compute or send end_time.
 * - If GET /api/routes is unavailable (Member 4 not yet merged), the dropdown shows a
 *   "No routes available" option and the conflict pre-check simply does not fire.
 * - Styling is preserved exactly from the static shell (same colours, radii, spacing).
 *
 * Conforms to Docs/05_api-and-pages.md §A7, Docs/07_content-copy.md §/truck-schedule/new,
 * Docs/08_workload-division.md §Member3.
 *
 * Doc 07 behaviour implemented here:
 *  - Submit button is disabled while a conflict warning is active (conflict?.has_conflict).
 *  - On 201 success, redirects to /truck-schedule?placed=1&route_name={name} so the list
 *    page can show the "Schedule created for {route_name}." toast via ScheduleCreatedToast.
 *  - On 400 server rejection, shows the exact doc 07 error wording:
 *    "This schedule conflicts with an existing booking. Please refresh and try again."
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import type { TruckItem, DriverItem, AssistantItem, RouteItem } from '@/types/fleet';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Internal conflict pre-check state used to drive the warning banner.
 */
interface ConflictState {
  /** True when a conflict or business-rule violation was detected. */
  has_conflict: boolean;
  /** Human-readable reasons returned by the API. */
  reasons: string[];
}

/**
 * Controlled form field state for the five schedule creation fields.
 */
interface FormFields {
  truck_id: number | '';
  driver_id: number | '';
  assistant_id: number | '';
  route_id: number | '';
  start_time: string; // 'YYYY-MM-DDTHH:mm' (datetime-local input native format)
}

/** Debounce delay in milliseconds before the conflict pre-check fires. */
const CONFLICT_DEBOUNCE_MS = 600;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a datetime-local input value ('YYYY-MM-DDTHH:mm') to the
 * 'YYYY-MM-DD HH:MM:SS' format expected by the conflicts endpoint.
 *
 * @param value - Native datetime-local string (e.g. '2026-09-23T08:00')
 * @returns MySQL-compatible datetime string (e.g. '2026-09-23 08:00:00')
 */
function toMysqlDatetime(value: string): string {
  return value.replace('T', ' ') + ':00';
}

/**
 * Returns a 'YYYY-MM-DDTHH:mm' string for the next whole hour in the
 * browser's LOCAL timezone, for use as the datetime-local input's `min`.
 *
 * Why not toISOString(): that method always returns UTC. In Sri Lanka
 * (+5:30) the UTC string is 5 h 30 m behind local time, so the min value
 * would fall in the past and the browser would accept already-elapsed slots.
 *
 * Fix: build the string from local getters (getFullYear, getMonth, getDate,
 * getHours) so the value reflects wall-clock time in the user's timezone.
 *
 * @returns 'YYYY-MM-DDTHH:mm' string for the next full local hour
 */
function getTodayMinDatetime(): string {
  const now = new Date();
  // Advance to the next whole hour in local time
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  // Build the string from local getters, not toISOString() (which is UTC)
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0'); // getMonth() is 0-based
  const dd   = String(now.getDate()).padStart(2, '0');
  const hh   = String(now.getHours()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:00`;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * NewTruckSchedulePage
 *
 * Fully wired form for creating a new truck delivery schedule.
 * Fetches reference data on mount, shows live conflict warnings as the user
 * fills in the form, and submits to POST /api/truck-schedules.
 *
 * @returns {JSX.Element} The rendered schedule creation form.
 */
export default function NewTruckSchedulePage(): React.JSX.Element {
  const router = useRouter();

  // ─── Reference Data State ─────────────────────────────────────────────────

  const [trucks, setTrucks] = useState<TruckItem[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(true);

  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);

  const [assistants, setAssistants] = useState<AssistantItem[]>([]);
  const [assistantsLoading, setAssistantsLoading] = useState(true);

  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);

  // ─── Form State ───────────────────────────────────────────────────────────

  const [fields, setFields] = useState<FormFields>({
    truck_id: '',
    driver_id: '',
    assistant_id: '',
    route_id: '',
    start_time: '',
  });

  // ─── Conflict Pre-Check State ──────────────────────────────────────────────

  /** True while the debounced conflict request is in-flight. */
  const [conflictChecking, setConflictChecking] = useState(false);
  /** Latest result from the conflict pre-check endpoint. Null = no check run yet. */
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  // ─── Submit State ─────────────────────────────────────────────────────────

  /** True while the POST /api/truck-schedules request is in-flight. */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Inline error message shown below the form on 400/423/network errors. */
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Ref for debounce timer ───────────────────────────────────────────────
  const conflictTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Data Fetchers ────────────────────────────────────────────────────────

  /**
   * Fetches trucks, drivers, assistants, and routes in parallel on mount.
   * Each list has its own loading state; failures result in an empty list
   * (dropdown shows "No X available") rather than crashing the page.
   */
  useEffect(() => {
    const load = async () => {
      await Promise.all([
        // Trucks
        fetch('/api/trucks')
          .then((r) => r.json() as Promise<{ items: TruckItem[] }>)
          .then((d) => setTrucks(d.items ?? []))
          .catch(() => setTrucks([]))
          .finally(() => setTrucksLoading(false)),

        // Drivers
        fetch('/api/drivers')
          .then((r) => r.json() as Promise<{ items: DriverItem[] }>)
          .then((d) => setDrivers(d.items ?? []))
          .catch(() => setDrivers([]))
          .finally(() => setDriversLoading(false)),

        // Assistants
        fetch('/api/assistants')
          .then((r) => r.json() as Promise<{ items: AssistantItem[] }>)
          .then((d) => setAssistants(d.items ?? []))
          .catch(() => setAssistants([]))
          .finally(() => setAssistantsLoading(false)),

        // Routes — Member 4's endpoint; graceful empty state if not yet merged
        fetch('/api/routes')
          .then((r) => r.json() as Promise<{ items: RouteItem[] }>)
          .then((d) => setRoutes(d.items ?? []))
          .catch(() => setRoutes([]))
          .finally(() => setRoutesLoading(false)),
      ]);
    };
    void load();
  }, []); // runs once on mount

  // ─── Debounced Conflict Pre-Check ─────────────────────────────────────────

  /**
   * Runs the conflict pre-check against GET /api/truck-schedules/conflicts.
   * Called by the debounced effect below once all 5 fields have values.
   *
   * @param truck_id - Selected truck ID
   * @param driver_id - Selected driver ID
   * @param assistant_id - Selected assistant ID
   * @param route_id - Selected route ID
   * @param start_time - datetime-local string from the input
   */
  const runConflictCheck = useCallback(
    async (
      truck_id: number,
      driver_id: number,
      assistant_id: number,
      route_id: number,
      start_time: string
    ) => {
      setConflictChecking(true);
      try {
        const params = new URLSearchParams({
          truck_id: String(truck_id),
          driver_id: String(driver_id),
          assistant_id: String(assistant_id),
          route_id: String(route_id),
          start_time: toMysqlDatetime(start_time),
        });
        const res = await fetch(`/api/truck-schedules/conflicts?${params.toString()}`);
        if (!res.ok) {
          // On auth/permission errors, clear conflict state silently
          setConflict(null);
          return;
        }
        const data = (await res.json()) as ConflictState;
        setConflict(data);
      } catch {
        // Network failure during pre-check — don't block form submission
        setConflict(null);
      } finally {
        setConflictChecking(false);
      }
    },
    []
  );

  /**
   * Debounced effect: fires the conflict pre-check 600 ms after any field change,
   * provided all 5 fields are filled. Clears the conflict state immediately when
   * any field is cleared (so stale warnings don't persist).
   */
  useEffect(() => {
    const { truck_id, driver_id, assistant_id, route_id, start_time } = fields;

    // Clear timer from previous render
    if (conflictTimerRef.current) {
      clearTimeout(conflictTimerRef.current);
    }

    const clearConflictState = () => {
      setConflict(null);
      setConflictChecking(false);
    };

    // All 5 fields must be filled to run the check
    if (!truck_id || !driver_id || !assistant_id || !route_id || !start_time) {
      clearConflictState();
      return;
    }

    // Debounce: schedule the check 600 ms from now
    conflictTimerRef.current = setTimeout(() => {
      void runConflictCheck(
        truck_id as number,
        driver_id as number,
        assistant_id as number,
        route_id as number,
        start_time
      );
    }, CONFLICT_DEBOUNCE_MS);

    // Cleanup: cancel pending timer if effect re-runs or component unmounts
    return () => {
      if (conflictTimerRef.current) {
        clearTimeout(conflictTimerRef.current);
      }
    };
  }, [fields, runConflictCheck]);

  // ─── Field Change Handler ─────────────────────────────────────────────────

  /**
   * Generic change handler for all form fields.
   * Numeric fields are coerced from string (select value) to number.
   *
   * @param name - Field name key from FormFields
   * @param value - Raw string from the input/select element
   */
  const handleFieldChange = useCallback(
    (name: keyof FormFields, value: string) => {
      // Numeric fields: coerce to number, or '' if empty
      const numericFields: (keyof FormFields)[] = [
        'truck_id',
        'driver_id',
        'assistant_id',
        'route_id',
      ];

      setSubmitError(null); // clear any previous submit error on user interaction

      if (numericFields.includes(name)) {
        setFields((prev) => ({
          ...prev,
          [name]: value !== '' ? Number(value) : '',
        }));
      } else {
        setFields((prev) => ({ ...prev, [name]: value }));
      }
    },
    []
  );

  // ─── Derived UI State ─────────────────────────────────────────────────────

  /** Selected driver object for the roster warning badge. */
  const selectedDriver = drivers.find((d) => d.driver_id === fields.driver_id);
  /** Selected assistant object for the roster warning badge. */
  const selectedAssistant = assistants.find((a) => a.assistant_id === fields.assistant_id);

  /** Whether all 5 form fields are filled (enables Submit). */
  const isFormComplete =
    fields.truck_id !== '' &&
    fields.driver_id !== '' &&
    fields.assistant_id !== '' &&
    fields.route_id !== '' &&
    fields.start_time !== '';

  /** Whether to show the conflict/roster warning banner. */
  const showWarning =
    (conflict?.has_conflict ?? false) ||
    (selectedDriver !== undefined && selectedDriver.hours_remaining <= 4) ||
    (selectedAssistant !== undefined && selectedAssistant.hours_remaining === 0);

  /** Aggregated warning reasons for the banner. */
  const warningReasons: string[] = [];
  if (conflict?.reasons?.length) {
    warningReasons.push(...conflict.reasons);
  }
  if (
    selectedDriver &&
    selectedDriver.hours_remaining <= 4 &&
    selectedDriver.hours_remaining > 0
  ) {
    warningReasons.push(
      `Driver ${selectedDriver.full_name} is approaching their weekly limit (${selectedDriver.current_week_hours}h / ${selectedDriver.weekly_limit}h).`
    );
  }
  if (selectedAssistant && selectedAssistant.hours_remaining === 0) {
    warningReasons.push(
      `Assistant ${selectedAssistant.full_name} has exceeded their weekly threshold (${selectedAssistant.current_week_hours}h / ${selectedAssistant.weekly_limit}h).`
    );
  }

  // ─── Submit Handler ───────────────────────────────────────────────────────

  /**
   * Submits the new truck schedule to POST /api/truck-schedules.
   * - On 201: redirects to /truck-schedule (schedule created).
   * - On 400: shows the business-rule violation message inline.
   * - On 423: shows "system busy, please retry" message.
   * - On network error: shows a generic inline message.
   *
   * @param e - React form submit event
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormComplete || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/truck-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_id: fields.truck_id,
          driver_id: fields.driver_id,
          assistant_id: fields.assistant_id,
          route_id: fields.route_id,
          // Send in MySQL DATETIME format; API will validate and call the procedure
          start_time: toMysqlDatetime(fields.start_time),
        }),
      });

      if (res.status === 201) {
        // Success — redirect to the schedule list with ?placed=1 so ScheduleCreatedToast can fire.
        // Encode the route name for the toast message ("Schedule created for {route_name}.").
        // The route name comes from the already-loaded routes reference data.
        const selectedRoute = routes.find((r) => r.route_id === fields.route_id);
        const routeNameParam = selectedRoute?.route_name
          ? `&route_name=${encodeURIComponent(selectedRoute.route_name)}`
          : '';
        router.push(`/truck-schedule?placed=1${routeNameParam}`);
        return;
      }

      const errData = (await res.json()) as { error?: { message?: string } };

      if (res.status === 423) {
        // Redis lock conflict — another concurrent schedule creation is in progress
        setSubmitError(
          'The system is processing another schedule request. Please wait a moment and try again.'
        );
      } else if (res.status === 400) {
        // Business-rule violation from the DB trigger / procedure.
        // Doc 07: show the exact wording for server-side conflict rejection.
        setSubmitError(
          errData.error?.message ??
          'This schedule conflicts with an existing booking. Please refresh and try again.'
        );
      } else {
        setSubmitError(errData.error?.message ?? 'An unexpected error occurred. Please try again.');
      }
    } catch {
      setSubmitError('Network error — could not create the schedule. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header with back nav */}
      <div className="flex items-center gap-4">
        <Link
          href="/truck-schedule"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
          aria-label="Back to truck schedule list"
        >
          <ArrowLeft className="w-5 h-5 text-[#474554]" />
        </Link>
        <div>
          <h1 className="text-[24px] font-semibold text-[#121C2C]">New truck schedule</h1>
          <p className="text-sm text-[#474554]">
            Assign truck, driver, and assistant for a daily delivery route
          </p>
        </div>
      </div>

      {/* Live Conflict / Roster Warning Banner
          Shown when: conflict pre-check detects overlaps, OR driver near limit,
          OR assistant has exceeded limit. Aggregates all reasons into one banner. */}
      {showWarning && (
        <div
          className="bg-[#FFF9E6] border border-[#FFB800]/20 p-4 rounded-xl flex items-start gap-3"
          role="alert"
          aria-live="polite"
        >
          <AlertTriangle className="w-5 h-5 text-[#FFB800] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-[#FFB800]">Live conflict warning</h3>
            <ul className="mt-1 space-y-0.5">
              {warningReasons.map((reason, i) => (
                <li key={i} className="text-sm text-[#474554]">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Schedule Creation Form Card */}
      <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-8 border border-[#C8C4D7]/40">
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-6" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* ── Route ── */}
            <div className="space-y-2">
              <label
                htmlFor="route_id"
                className="text-[12px] font-semibold text-[#474554] tracking-wide block"
              >
                Select Route
              </label>
              <select
                id="route_id"
                value={fields.route_id}
                onChange={(e) => handleFieldChange('route_id', e.target.value)}
                disabled={routesLoading || isSubmitting}
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white disabled:bg-[#F5F5FA] disabled:text-[#777586]"
              >
                {routesLoading ? (
                  <option value="">Loading routes…</option>
                ) : routes.length === 0 ? (
                  <option value="">No routes available</option>
                ) : (
                  <>
                    <option value="">Choose a route…</option>
                    {routes.map((r) => (
                      <option key={r.route_id} value={r.route_id}>
                        {r.route_name} ({r.max_delivery_time_hours}h max)
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* ── Scheduled Date/Time ── */}
            <div className="space-y-2">
              <label
                htmlFor="start_time"
                className="text-[12px] font-semibold text-[#474554] tracking-wide block"
              >
                Scheduled Date &amp; Time
              </label>
              <input
                id="start_time"
                type="datetime-local"
                value={fields.start_time}
                min={getTodayMinDatetime()}
                onChange={(e) => handleFieldChange('start_time', e.target.value)}
                disabled={isSubmitting}
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] disabled:bg-[#F5F5FA] disabled:text-[#777586]"
              />
            </div>

            {/* ── Select Truck ── */}
            <div className="space-y-2">
              <label
                htmlFor="truck_id"
                className="text-[12px] font-semibold text-[#474554] tracking-wide block"
              >
                Select Truck
              </label>
              <select
                id="truck_id"
                value={fields.truck_id}
                onChange={(e) => handleFieldChange('truck_id', e.target.value)}
                disabled={trucksLoading || isSubmitting}
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white disabled:bg-[#F5F5FA] disabled:text-[#777586]"
              >
                {trucksLoading ? (
                  <option value="">Loading trucks…</option>
                ) : trucks.length === 0 ? (
                  <option value="">No trucks available</option>
                ) : (
                  <>
                    <option value="">Choose a truck…</option>
                    {trucks.map((t) => (
                      <option key={t.truck_id} value={t.truck_id}>
                        {t.plate_number} ({t.capacity_kg.toLocaleString()}kg capacity)
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* ── Assign Driver ── */}
            <div className="space-y-2">
              <label
                htmlFor="driver_id"
                className="text-[12px] font-semibold text-[#474554] tracking-wide block"
              >
                Assign Driver
              </label>
              <select
                id="driver_id"
                value={fields.driver_id}
                onChange={(e) => handleFieldChange('driver_id', e.target.value)}
                disabled={driversLoading || isSubmitting}
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white disabled:bg-[#F5F5FA] disabled:text-[#777586]"
              >
                {driversLoading ? (
                  <option value="">Loading drivers…</option>
                ) : drivers.length === 0 ? (
                  <option value="">No drivers available</option>
                ) : (
                  <>
                    <option value="">Choose a driver…</option>
                    {drivers.map((d) => (
                      <option key={d.driver_id} value={d.driver_id}>
                        {d.full_name} — {d.current_week_hours}h / {d.weekly_limit}h
                        {d.hours_remaining <= 4 ? ' ⚠' : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {/* Inline roster badge for the currently selected driver */}
              {selectedDriver && (
                <p
                  className={`text-[11px] font-medium mt-1 ${selectedDriver.hours_remaining <= 4
                      ? 'text-[#FFB800]'
                      : 'text-[#474554]'
                    }`}
                >
                  {selectedDriver.hours_remaining <= 4
                    ? `⚠ ${selectedDriver.hours_remaining}h remaining this week (limit: ${selectedDriver.weekly_limit}h)`
                    : `${selectedDriver.hours_remaining}h remaining this week`}
                </p>
              )}
            </div>

            {/* ── Assign Assistant ── */}
            <div className="space-y-2">
              <label
                htmlFor="assistant_id"
                className="text-[12px] font-semibold text-[#474554] tracking-wide block"
              >
                Assign Assistant
              </label>
              <select
                id="assistant_id"
                value={fields.assistant_id}
                onChange={(e) => handleFieldChange('assistant_id', e.target.value)}
                disabled={assistantsLoading || isSubmitting}
                className="w-full h-12 px-4 rounded-lg border border-[#C8C4D7] focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7] outline-none text-[14px] bg-white disabled:bg-[#F5F5FA] disabled:text-[#777586]"
              >
                {assistantsLoading ? (
                  <option value="">Loading assistants…</option>
                ) : assistants.length === 0 ? (
                  <option value="">No assistants available</option>
                ) : (
                  <>
                    <option value="">Choose an assistant…</option>
                    {assistants.map((a) => (
                      <option key={a.assistant_id} value={a.assistant_id}>
                        {a.full_name} — {a.current_week_hours}h / {a.weekly_limit}h
                        {a.hours_remaining === 0 ? ' ✕' : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {/* Inline roster badge for the currently selected assistant */}
              {selectedAssistant && (
                <p
                  className={`text-[11px] font-medium mt-1 ${selectedAssistant.hours_remaining === 0
                      ? 'text-[#F93C65]'
                      : 'text-[#474554]'
                    }`}
                >
                  {selectedAssistant.hours_remaining === 0
                    ? `✕ Weekly limit reached (${selectedAssistant.current_week_hours}h / ${selectedAssistant.weekly_limit}h)`
                    : `${selectedAssistant.hours_remaining}h remaining this week`}
                </p>
              )}
            </div>
          </div>

          {/* Conflict checking indicator — subtle spinner under the fields */}
          {conflictChecking && (
            <p className="text-[12px] text-[#777586] flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Checking for conflicts…
            </p>
          )}

          {/* Inline submit error — shown on 400/423/network failure */}
          {submitError && (
            <div
              className="px-4 py-3 bg-[#FFF0F0] border border-[#F93C65]/20 rounded-xl flex items-start gap-3 text-[#F93C65] text-[13px]"
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-6 mt-6 border-t border-[#C8C4D7] flex justify-end gap-3">
            <Link
              href="/truck-schedule"
              className="px-6 flex items-center h-12 rounded-full border border-[#C8C4D7] text-[#474554] font-medium hover:bg-[#F0F3FF] transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              id="btn-create-truck-schedule"
              disabled={!isFormComplete || isSubmitting || (conflict?.has_conflict ?? false)}
              aria-disabled={!isFormComplete || isSubmitting || (conflict?.has_conflict ?? false)}
              title={conflict?.has_conflict ? 'Resolve the conflict warnings before submitting.' : undefined}
              className="bg-[#4132C7] hover:bg-[#5A4FE0] disabled:bg-[#C8C4D7] disabled:cursor-not-allowed text-white px-8 h-12 rounded-full font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              {isSubmitting && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {isSubmitting ? 'Creating…' : 'Create schedule'}
            </button>
          </div>
        </form>
      </div>

      {/* Submitting overlay — prevents interaction during POST */}
      {isSubmitting && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          aria-busy="true"
          aria-label="Saving schedule…"
        />
      )}
    </div>
  );
}
