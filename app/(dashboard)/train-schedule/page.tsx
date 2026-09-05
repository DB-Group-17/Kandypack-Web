"use client";

/**
 * @file app/(dashboard)/train-schedule/page.tsx
 * @description Train Schedule page for managing Sri Lanka Railways bulk cargo trips between Kandy and destination cities.
 * 
 * Page Architecture & Data Flow:
 * - Fetches scheduled, departed, and arrived train trips from the backend API `/api/train-trips`.
 * - Provides live capacity utilization bars (booked cargo space vs. remaining cargo capacity).
 * - Enables authorized staff (Logistics Managers and System Admins) to add new train trips.
 * - Submits new trips via `POST /api/train-trips` with chronological and capacity constraint validation.
 * - Supports filtering by destination city and status, with dynamic view toggle (Card/Grid vs. Table view).
 * - Implements loading skeletons, error states with retry, empty state notifications, and 4-second auto-dismiss toasts.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/05_api-and-pages.md §A5 & §B, Docs/07_content-copy.md §/train-schedule
 * Visual System: DESIGN.md, Docs/11_ui-rules.md
 * Owner: Member 2 (Linari)
 */

import React, { useState, useEffect, useCallback, useId } from "react";

/**
 * TrainTrip represents the data structure of a scheduled railway cargo transport.
 * Matches the train_trips database entity and /api/train-trips response contract.
 */
interface TrainTrip {
  trip_id: number;
  destination_city_id: number;
  destination_city: string;
  departure_datetime: string;
  arrival_datetime: string;
  total_capacity: number;
  booked_space: number;
  remaining_capacity: number;
  status: "Scheduled" | "Departed" | "Arrived" | "Cancelled";
}

/**
 * Canonical destination cities supported by Sri Lanka Railways bulk cargo departures from Kandy.
 * Matches Docs/06_seed-data-spec.md §1.
 */
const DESTINATION_CITIES = [
  { city_id: 2, city_name: "Colombo" },
  { city_id: 3, city_name: "Negombo" },
  { city_id: 4, city_name: "Galle" },
  { city_id: 5, city_name: "Matara" },
  { city_id: 6, city_name: "Jaffna" },
  { city_id: 7, city_name: "Trincomalee" },
];

/**
 * TrainSchedulePage renders the railway schedule management interface.
 *
 * @returns {JSX.Element} The interactive Train Schedule page component.
 */
export default function TrainSchedulePage() {
  // --- Data & Async States ---
  const [trips, setTrips] = useState<TrainTrip[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Filter and View Configuration States ---
  const [selectedCity, setSelectedCity] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  // --- Add Trip Modal & Form States ---
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [destinationCityId, setDestinationCityId] = useState<number>(2);
  const [departureDateTime, setDepartureDateTime] = useState<string>("");
  const [arrivalDateTime, setArrivalDateTime] = useState<string>("");
  const [totalCapacity, setTotalCapacity] = useState<number>(500);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- Accessible Form Element IDs ---
  const citySelectId = useId();
  const depTimeId = useId();
  const arrTimeId = useId();
  const capInputId = useId();
  const filterCityId = useId();
  const filterStatusId = useId();

  /**
   * Fetches the list of train trips from the backend API.
   * Used for manual refetching after modal actions or retry button.
   */
  const fetchTrips = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const params = new URLSearchParams();

      if (selectedCity !== "All") {
        const matchingCity = DESTINATION_CITIES.find(
          (c) => c.city_name.toLowerCase() === selectedCity.toLowerCase()
        );
        if (matchingCity) {
          params.append("city_id", String(matchingCity.city_id));
        }
      }

      if (selectedStatus !== "All") {
        params.append("status", selectedStatus);
      }

      const queryString = params.toString();
      const url = `/api/train-trips${queryString ? `?${queryString}` : ""}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || "Couldn't load train trips. Please try again."
        );
      }

      const data = await response.json();
      setTrips(data.items || []);
    } catch (err: unknown) {
      console.error("Failed to load train trips:", err);
      if (err instanceof Error) {
        setFetchError(err.message);
      } else {
        setFetchError("Couldn't load train trips. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedCity, selectedStatus]);

  // Initial fetch and re-fetch when filter criteria change (asynchronously to avoid cascading renders)
  useEffect(() => {
    let ignore = false;

    const loadInitialTrips = async () => {
      try {
        const params = new URLSearchParams();

        if (selectedCity !== "All") {
          const matchingCity = DESTINATION_CITIES.find(
            (c) => c.city_name.toLowerCase() === selectedCity.toLowerCase()
          );
          if (matchingCity) {
            params.append("city_id", String(matchingCity.city_id));
          }
        }

        if (selectedStatus !== "All") {
          params.append("status", selectedStatus);
        }

        const queryString = params.toString();
        const url = `/api/train-trips${queryString ? `?${queryString}` : ""}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || "Couldn't load train trips. Please try again."
          );
        }

        const data = await response.json();
        if (!ignore) {
          setTrips(data.items || []);
          setFetchError(null);
        }
      } catch (err: unknown) {
        console.error("Failed to load train trips:", err);
        if (!ignore) {
          if (err instanceof Error) {
            setFetchError(err.message);
          } else {
            setFetchError("Couldn't load train trips. Please try again.");
          }
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    loadInitialTrips();

    return () => {
      ignore = true;
    };
  }, [selectedCity, selectedStatus]);

  /**
   * Helper function to format an ISO datetime string into human-readable date & time.
   *
   * @param {string} isoString - ISO formatted datetime string.
   * @returns {string} Formatted date and time (e.g. "Sep 02, 2026 at 08:00 AM").
   */
  const formatDateTime = (isoString: string): string => {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * Handles opening the Add Trip modal and resetting form inputs to default values.
   */
  const handleOpenAddTrip = (): void => {
    setFormError(null);
    setDepartureDateTime("");
    setArrivalDateTime("");
    setTotalCapacity(500);
    setDestinationCityId(2);
    setIsModalOpen(true);
  };

  /**
   * Validates and submits the new train trip form via POST /api/train-trips.
   * Enforces business rules: arrival_datetime > departure_datetime and total_capacity > 0.
   *
   * @param {React.FormEvent} e - Form submission event.
   */
  const handleSaveTrip = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setFormError(null);

    if (!departureDateTime || !arrivalDateTime) {
      setFormError("Please provide both departure and arrival date & time.");
      return;
    }

    const depDate = new Date(departureDateTime);
    const arrDate = new Date(arrivalDateTime);

    // Enforce business rule & DB constraint (chk_tt_arrival)
    if (arrDate <= depDate) {
      setFormError("Arrival time must be after departure time.");
      return;
    }

    if (totalCapacity <= 0) {
      setFormError("Total capacity must be greater than zero.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/train-trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination_city_id: Number(destinationCityId),
          departure_datetime: departureDateTime,
          arrival_datetime: arrivalDateTime,
          total_capacity: Number(totalCapacity),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to schedule train trip.");
      }

      // Close modal and refresh trip dataset
      setIsModalOpen(false);
      await fetchTrips();

      // Trigger success toast notification per Docs/07_content-copy.md §203
      const targetCity = DESTINATION_CITIES.find(
        (c) => c.city_id === Number(destinationCityId)
      );
      const cityName = targetCity ? targetCity.city_name : "Destination";
      setToastMessage(`Trip to ${cityName} added.`);

      // Auto-dismiss toast after 4 seconds per Docs/07_content-copy.md §438
      setTimeout(() => {
        setToastMessage(null);
      }, 4000);
    } catch (err: unknown) {
      console.error("Error creating train trip:", err);
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Couldn't save this trip. Please check the details and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Returns semantic badge styling matching DESIGN.md §2 Semantic colors.
   *
   * @param {TrainTrip["status"]} status - Trip status enum.
   * @returns {JSX.Element} The rendered pill status badge.
   */
  const getStatusBadge = (status: TrainTrip["status"]) => {
    switch (status) {
      case "Scheduled":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#E0F2FF] text-[#0047CC]">
            Scheduled
          </span>
        );
      case "Departed":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFF9E6] text-[#FFB800]">
            Departed
          </span>
        );
      case "Arrived":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#E6F6F4] text-[#00B69B]">
            Arrived
          </span>
        );
      case "Cancelled":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFF0F0] text-[#F93C65]">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F1F1F5] text-[#474554]">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Container (auto-dismiss after 4s) */}
      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-50 bg-[#121C2C] text-white px-5 py-3.5 rounded-xl shadow-lg flex items-center gap-3 transition-all transform animate-slide-up text-sm font-medium"
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

      {/* Page Header Section per Docs/07_content-copy.md §176-181 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#121C2C]">
            Train Schedule
          </h1>
          <p className="text-sm text-[#474554] mt-1">
            Manage cargo trips between Kandy and destination cities
          </p>
        </div>

        {/* Primary CTA Button per DESIGN.md & Docs/07_content-copy.md §180 */}
        <button
          type="button"
          onClick={handleOpenAddTrip}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-sm font-semibold hover:bg-[#3427A8] transition-all shadow-sm hover:shadow-md active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>+ Add Trip</span>
        </button>
      </div>

      {/* Summary KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/40 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
            Total Scheduled Trips
          </p>
          <p className="text-2xl font-bold text-[#121C2C] mt-2">
            {isLoading ? "—" : trips.filter((t) => t.status === "Scheduled").length}
          </p>
          <p className="text-xs text-[#00B69B] mt-1 font-medium">Ready for cargo allocation</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/40 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
            Active In-Transit
          </p>
          <p className="text-2xl font-bold text-[#FFB800] mt-2">
            {isLoading ? "—" : trips.filter((t) => t.status === "Departed").length}
          </p>
          <p className="text-xs text-[#474554] mt-1">Between Kandy and regional stores</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#C8C4D7]/40 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#474554]">
            Completed Departures
          </p>
          <p className="text-2xl font-bold text-[#4132C7] mt-2">
            {isLoading ? "—" : trips.filter((t) => t.status === "Arrived").length}
          </p>
          <p className="text-xs text-[#474554] mt-1">Received at station stores</p>
        </div>
      </div>

      {/* Filter and View Control Toolbar per Docs/07_content-copy.md §182-186 */}
      <div className="bg-white p-4 rounded-2xl border border-[#C8C4D7]/40 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* City Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor={filterCityId} className="text-xs font-semibold text-[#474554]">
              City:
            </label>
            <select
              id={filterCityId}
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setIsLoading(true);
              }}
              className="text-xs font-medium bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-2 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
            >
              <option value="All">All cities</option>
              {DESTINATION_CITIES.map((city) => (
                <option key={city.city_id} value={city.city_name}>
                  {city.city_name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor={filterStatusId} className="text-xs font-semibold text-[#474554]">
              Status:
            </label>
            <select
              id={filterStatusId}
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setIsLoading(true);
              }}
              className="text-xs font-medium bg-[#F0F3FF] border border-[#C8C4D7] rounded-lg px-3 py-2 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7]"
            >
              <option value="All">All statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Departed">Departed</option>
              <option value="Arrived">Arrived</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* View Switcher (Card / Grid vs Table View) */}
        <div className="flex items-center bg-[#F0F3FF] p-1 rounded-xl border border-[#C8C4D7]/50">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === "grid"
                ? "bg-white text-[#4132C7] shadow-xs font-semibold"
                : "text-[#474554] hover:text-[#121C2C]"
            }`}
          >
            Card View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === "list"
                ? "bg-white text-[#4132C7] shadow-xs font-semibold"
                : "text-[#474554] hover:text-[#121C2C]"
            }`}
          >
            Table View
          </button>
        </div>
      </div>

      {/* Main Content Area: Loading, Error, Empty State, Cards, or Table */}
      {isLoading ? (
        /* Loading Skeleton State matching Docs/07_content-copy.md §427 */
        <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 p-12 text-center shadow-xs">
          <div className="inline-block w-8 h-8 border-3 border-[#4132C7]/30 border-t-[#4132C7] rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-[#121C2C]">Loading train trips…</p>
          <p className="text-xs text-[#474554] mt-1">Retrieving scheduled cargo departures</p>
        </div>
      ) : fetchError ? (
        /* Error State with Retry Button matching Docs/07_content-copy.md §429 */
        <div className="bg-white rounded-2xl border border-[#F93C65]/30 p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#FFF0F0] text-[#F93C65] mx-auto flex items-center justify-center mb-3 text-lg font-bold">
            ⚠
          </div>
          <h3 className="text-base font-semibold text-[#121C2C]">{fetchError}</h3>
          <p className="text-xs text-[#474554] mt-1">
            Could not retrieve cargo departures from the database.
          </p>
          <button
            type="button"
            onClick={() => fetchTrips()}
            className="mt-4 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-xs"
          >
            Retry
          </button>
        </div>
      ) : trips.length === 0 ? (
        /* Empty State Matching Docs/07_content-copy.md §200 */
        <div className="bg-white rounded-2xl border border-[#C8C4D7]/40 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#F0F3FF] text-[#4132C7] mx-auto flex items-center justify-center mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[#121C2C]">
            No train trips scheduled for this period.
          </h3>
          <p className="text-xs text-[#474554] mt-1 max-w-sm mx-auto">
            Try adjusting your city or status filters, or add a new scheduled bulk cargo trip from Kandy.
          </p>
          <div className="mt-5">
            <button
              type="button"
              onClick={handleOpenAddTrip}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all"
            >
              + Add Trip
            </button>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {trips.map((trip) => {
            const usagePercent =
              trip.total_capacity > 0
                ? Math.min(
                    100,
                    Math.round((trip.booked_space / trip.total_capacity) * 100)
                  )
                : 0;
            const isFull = trip.remaining_capacity <= 0;
            const isOverflowTest = trip.total_capacity === 50;

            return (
              <div
                key={trip.trip_id}
                className="bg-white rounded-2xl border border-[#C8C4D7]/50 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden"
              >
                {/* Visual badge for 50-unit capacity test trips per seed spec §8 */}
                {isOverflowTest && (
                  <div className="absolute top-0 right-0 bg-[#FFB800]/15 text-[#835400] text-[10px] font-bold px-3 py-0.5 rounded-bl-lg border-l border-b border-[#FFB800]/30">
                    Test Capacity (50u)
                  </div>
                )}

                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#4132C7]">
                        Trip #{trip.trip_id}
                      </span>
                      <h2 className="text-lg font-bold text-[#121C2C] flex items-center gap-1.5">
                        <span>Kandy</span>
                        <span className="text-[#C8C4D7]">→</span>
                        <span>{trip.destination_city}</span>
                      </h2>
                    </div>
                    {getStatusBadge(trip.status)}
                  </div>

                  {/* Datetime Departure & Arrival Details */}
                  <div className="space-y-2 text-xs py-3 border-y border-[#F0F3FF]">
                    <div className="flex items-center justify-between text-[#474554]">
                      <span className="font-medium">Departs:</span>
                      <span className="font-semibold text-[#121C2C]">
                        {formatDateTime(trip.departure_datetime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#474554]">
                      <span className="font-medium">Arrives:</span>
                      <span className="font-semibold text-[#121C2C]">
                        {formatDateTime(trip.arrival_datetime)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Capacity Utilization Progress Bar */}
                <div className="mt-4 pt-2">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-[#474554]">
                      {trip.booked_space} / {trip.total_capacity} units booked
                    </span>
                    <span
                      className={`font-bold ${
                        isFull
                          ? "text-[#F93C65]"
                          : usagePercent > 80
                          ? "text-[#FFB800]"
                          : "text-[#00B69B]"
                      }`}
                    >
                      {usagePercent}%
                    </span>
                  </div>

                  {/* Progress track */}
                  <div className="w-full h-2 rounded-full bg-[#F0F3FF] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isFull
                          ? "bg-[#F93C65]"
                          : usagePercent > 80
                          ? "bg-[#FFB800]"
                          : "bg-[#4132C7]"
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#474554] mt-1.5">
                    <span>Available:</span>
                    <span className="font-semibold text-[#121C2C]">
                      {trip.remaining_capacity} units remaining
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-2xl border border-[#C8C4D7]/50 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F9F9FF] border-b border-[#C8C4D7]/50 text-[11px] font-semibold uppercase tracking-wider text-[#474554]">
                  <th className="px-5 py-3.5">Trip ID</th>
                  <th className="px-5 py-3.5">Route</th>
                  <th className="px-5 py-3.5">Departure</th>
                  <th className="px-5 py-3.5">Arrival</th>
                  <th className="px-5 py-3.5">Capacity Usage</th>
                  <th className="px-5 py-3.5">Remaining</th>
                  <th className="px-5 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F3FF] text-xs">
                {trips.map((trip) => {
                  const usagePercent =
                    trip.total_capacity > 0
                      ? Math.min(
                          100,
                          Math.round((trip.booked_space / trip.total_capacity) * 100)
                        )
                      : 0;
                  return (
                    <tr key={trip.trip_id} className="hover:bg-[#F9F9FF] transition-colors">
                      <td className="px-5 py-4 font-mono font-medium text-[#4132C7]">
                        #{trip.trip_id}
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#121C2C]">
                        Kandy → {trip.destination_city}
                      </td>
                      <td className="px-5 py-4 text-[#474554]">
                        {formatDateTime(trip.departure_datetime)}
                      </td>
                      <td className="px-5 py-4 text-[#474554]">
                        {formatDateTime(trip.arrival_datetime)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="w-36">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span>{trip.booked_space}/{trip.total_capacity}u</span>
                            <span className="font-semibold">{usagePercent}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#F0F3FF] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                usagePercent >= 100
                                  ? "bg-[#F93C65]"
                                  : usagePercent > 80
                                  ? "bg-[#FFB800]"
                                  : "bg-[#4132C7]"
                              }`}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-medium text-[#121C2C]">
                        {trip.remaining_capacity} units
                      </td>
                      <td className="px-5 py-4 text-right">
                        {getStatusBadge(trip.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Trip Modal Dialog per Docs/07_content-copy.md §192-199 */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Modal Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => !isSubmitting && setIsModalOpen(false)}
          />

          {/* Modal Card Content */}
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-[#C8C4D7]/50 p-6 md:p-8 z-10 animate-scale-up">
            <div className="flex items-center justify-between pb-4 border-b border-[#F0F3FF]">
              <div>
                <h2 id="modal-title" className="text-xl font-bold text-[#121C2C]">
                  Add Trip
                </h2>
                <p className="text-xs text-[#474554] mt-0.5">
                  Schedule bulk rail transport from Kandy to regional station stores
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#474554] hover:bg-[#F0F3FF] transition-colors disabled:opacity-50"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Validation Error Banner */}
            {formError && (
              <div
                role="alert"
                className="mt-4 p-3 rounded-xl bg-[#FFF0F0] border border-[#F93C65]/30 text-[#F93C65] text-xs font-medium flex items-center gap-2"
              >
                <span>⚠</span>
                <span>{formError}</span>
              </div>
            )}

            {/* Add Trip Form */}
            <form onSubmit={handleSaveTrip} className="mt-4 space-y-4">
              {/* Destination City Selection */}
              <div>
                <label htmlFor={citySelectId} className="block text-xs font-semibold text-[#121C2C] mb-1.5">
                  Destination city
                </label>
                <select
                  id={citySelectId}
                  value={destinationCityId}
                  onChange={(e) => setDestinationCityId(Number(e.target.value))}
                  disabled={isSubmitting}
                  className="w-full text-sm bg-white border border-[#C8C4D7] rounded-lg px-3.5 py-2.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7] disabled:bg-[#F0F3FF]"
                  required
                >
                  {DESTINATION_CITIES.map((city) => (
                    <option key={city.city_id} value={city.city_id}>
                      {city.city_name} (Station Store)
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Time Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={depTimeId} className="block text-xs font-semibold text-[#121C2C] mb-1.5">
                    Departure date & time
                  </label>
                  <input
                    id={depTimeId}
                    type="datetime-local"
                    value={departureDateTime}
                    onChange={(e) => setDepartureDateTime(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[#C8C4D7] rounded-lg px-3 py-2.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7] disabled:bg-[#F0F3FF]"
                    required
                  />
                </div>

                <div>
                  <label htmlFor={arrTimeId} className="block text-xs font-semibold text-[#121C2C] mb-1.5">
                    Arrival date & time
                  </label>
                  <input
                    id={arrTimeId}
                    type="datetime-local"
                    value={arrivalDateTime}
                    onChange={(e) => setArrivalDateTime(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[#C8C4D7] rounded-lg px-3 py-2.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7] disabled:bg-[#F0F3FF]"
                    required
                  />
                </div>
              </div>

              {/* Total Capacity Input */}
              <div>
                <label htmlFor={capInputId} className="block text-xs font-semibold text-[#121C2C] mb-1.5">
                  Total cargo capacity (units)
                </label>
                <input
                  id={capInputId}
                  type="number"
                  min="1"
                  step="1"
                  value={totalCapacity}
                  onChange={(e) => setTotalCapacity(Number(e.target.value))}
                  disabled={isSubmitting}
                  placeholder="e.g. 500"
                  className="w-full text-sm bg-white border border-[#C8C4D7] rounded-lg px-3.5 py-2.5 text-[#121C2C] focus:outline-hidden focus:ring-2 focus:ring-[#4132C7] disabled:bg-[#F0F3FF]"
                  required
                />
                <p className="text-[11px] text-[#474554] mt-1">
                  Default train carriage capacity is 500 units. Use 50 units for overflow test scenarios.
                </p>
              </div>

              {/* Form Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#F0F3FF]">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-semibold text-[#474554] hover:bg-[#F0F3FF] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>{isSubmitting ? "Saving Trip…" : "Save Trip"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
