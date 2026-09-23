"use client";

/**
 * @file app/(dashboard)/orders/new/page.tsx
 * @description Place New Order page — the order-entry form used by clerks to place a customer
 * order on their behalf.
 *
 * Build status: STEP 3b of 8. Step 1 built the layout and Docs/07_content-copy.md copy, Step 2
 * the city and coverage-area dropdowns, Step 3 the customer search, and Step 3b the
 * "+ Add new customer" popup. The date, item lines and submit are still static (Steps 4-6).
 *
 * Page structure:
 * - Header: back affordance, "New Order" heading and subheading.
 * - Left column (8/12): "Customer" card, then "Delivery Details" card.
 * - Right rail (4/12, sticky on desktop): "Order Items" card holding the empty state and the
 *   summary panel (total value, total space required), followed by the Place Order / Cancel
 *   actions. The rail collapses beneath the form on narrow screens (Docs/11_ui-rules.md §8).
 *
 * Data flow:
 * - GET /api/cities?destination_only=true  destination city dropdown        (wired: Step 2)
 * - GET /api/routes?city_id=…     coverage areas for the chosen city         (wired: Step 2).
 *   The delivery area is a dropdown, never free text, because place_order matches it against
 *   these exact names; the flat, de-duplicated, alphabetised area list is built client-side.
 * - GET /api/customers?search=…   customer type-ahead, 300ms debounce         (wired: Step 3)
 * - GET /api/products             line-item picker with unit price and space rate (Step 5)
 * - POST /api/orders              submit; a 400 shows the procedure's message inline, a 201
 *   redirects to /orders/[orderId]                                             (Step 6)
 *
 * Loading model (Step 2): a lookup is "loading" while its data is still `null`, so no state is
 * set synchronously inside an effect (the react-hooks/set-state-in-effect rule). Each loader is
 * written inline in its effect and guarded by a `cancelled` flag so a slow response for an old
 * city can never overwrite the areas of the city the user has since chosen. Retry bumps a
 * counter that both effects depend on, so the fetch logic exists in exactly one place.
 *
 * Customer search (Step 3): typing waits 300ms after the last keystroke, then searches by name,
 * phone or email. A result list drops down under the box and is fully keyboard-operable
 * (Arrow keys, Enter, Escape) with combobox/listbox ARIA roles. Picking a customer replaces the
 * box with a summary chip (with a Change button) and PREFILLS the destination city and delivery
 * address from the customer's record. The prefill is a convenience only: both stay editable, and
 * the delivery area is deliberately left blank because the customer record has no area field and
 * parsing it out of address text would be guesswork. As in Step 2, "searching" and "no results"
 * are derived by comparing the loaded results' query with the current text, so a stale result
 * for older text can never flash on screen and nothing is set synchronously in an effect.
 *
 * Add new customer (Step 3b): a "+ Add new customer" link beside the Customer label opens a
 * modal popup (same overlay pattern as the Update Status dialog on the order detail page) holding
 * the Docs/07 form: name, type, phone, optional email, address, Save customer. The dialog closes
 * on Cancel, the X button, a click on the backdrop or Escape (all ignored while a save is in
 * flight), locks page scrolling while open, and returns focus to the link that opened it. It is a
 * separate component that owns its own field state and its own <form>, so this page must NOT be
 * wrapped in an outer <form> (nested forms are invalid HTML); Step 6 submits with a button handler.
 * On success the new customer is selected exactly as if it had been found by search. Doc 07's form
 * has no city field, so the customer is registered under the destination city already chosen on
 * this page, or left without a city if none is.
 *
 * Access: /orders/new is limited to order_entry_clerk and system_administrator. That is enforced
 * by proxy.ts / lib/rbac.ts before this page renders, so no role check is repeated here.
 *
 * Documented design resolution:
 * - UI/new_order shows fields the data model does not have (tax, shipping base, Save Draft,
 *   State/Region, Postal Code, Contact Person). Docs/07_content-copy.md is followed for all
 *   content, and the mockup only for layout, so those elements are intentionally omitted.
 *
 * Authority: Docs/03_architecture.md §8, Docs/05_api-and-pages.md §/orders/new,
 *   Docs/07_content-copy.md §/orders/new
 * Visual System: DESIGN.md, Docs/11_ui-rules.md, UI/new_order
 * Owner: Member 1 (Dineth)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

/** One destination city from `GET /api/cities`, reduced to what the dropdown needs. */
interface CityOption {
  city_id: number;
  city_name: string;
}

/** One coverage area inside a route, as returned by `GET /api/routes`. */
interface CoverageAreaDto {
  city_id: number;
  area_name: string;
}

/** The slice of a `GET /api/routes` item this page reads: only the coverage areas. */
interface RouteDto {
  coverage_areas: CoverageAreaDto[];
}

/** Coverage areas loaded for one specific city, remembering which city they belong to. */
interface AreasForCity {
  cityId: string;
  names: string[];
}

/** One customer from `GET /api/customers`, reduced to what the search and chip display. */
interface CustomerOption {
  customer_id: number;
  customer_name: string;
  customer_type: "retail" | "wholesale";
  phone: string;
  registered_city_id: number;
  registered_city_name: string;
  address_line: string;
}

/** Search results tagged with the exact query they answer, so stale results are recognisable. */
interface CustomerSearchResults {
  query: string;
  items: CustomerOption[];
}

/** Most result rows shown at once; the API has no limit, so longer lists are truncated here. */
const MAX_VISIBLE_RESULTS = 8;

/** How long typing must pause before a search request is sent. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Shared class list for text inputs, selects and date fields, following Docs/11_ui-rules.md §4:
 * 8px radius, 1px outline border, 48px minimum height, and a restrained primary focus ring.
 */
const FIELD_CLASS =
  "w-full min-h-12 px-4 rounded-lg border border-[#C8C4D7] bg-white text-sm text-[#121C2C] placeholder:text-[#474554]/60 focus:outline-none focus:border-[#4132C7] focus:ring-2 focus:ring-[#4132C7]/20 transition-colors";

/** Shared class list for the persistent label placed above every field (no floating labels). */
const LABEL_CLASS = "block text-sm font-semibold text-[#121C2C] mb-1.5";

/**
 * Card wrapper for one form section, matching the white 16px-radius card with a soft shadow
 * from Docs/11_ui-rules.md §3. Deliberately mirrors the local SectionCard in
 * orders/[orderId]/page.tsx; extract both into a shared component when a third page needs it.
 *
 * @param {string} title - Section heading, e.g. "Customer".
 * @param {React.ReactNode} icon - Decorative icon shown before the heading.
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
    <section
      className={`bg-white rounded-2xl border border-[#C8C4D7]/40 shadow-xs p-6 ${className}`}
    >
      <h2 className="text-base font-semibold text-[#121C2C] mb-5 flex items-center gap-2">
        {/* aria-hidden: the icon is decorative, the heading text already names the section */}
        <span className="text-[#4132C7]" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Email shape check: something@something.something, no spaces. Deliberately simple. */
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

/**
 * "Add new customer" popup (Docs/07_content-copy.md §/orders/new, Section 1).
 *
 * A modal dialog: a dimmed backdrop plus a centred card. Rendered only while open, so its state
 * starts fresh every time. Owns its own field, error and saving state so the page component
 * stays focused on the order.
 * Validation mirrors POST /api/customers (name and phone required); the server remains the
 * authority and its message is shown if it rejects the request.
 *
 * On success it hands the created customer to `onCreated` and the page selects it.
 *
 * @param {number | null} registeredCityId - City to register the customer under (the destination
 *   city already chosen on the page), or null to save the customer without a city.
 * @param {(customer: CustomerOption) => void} onCreated - Called with the saved customer.
 * @param {() => void} onCancel - Called when the user dismisses the dialog without saving.
 * @returns {JSX.Element} The rendered dialog.
 */
function AddCustomerDialog({
  registeredCityId,
  onCreated,
  onCancel,
}: {
  registeredCityId: number | null;
  onCreated: (customer: CustomerOption) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"retail" | "wholesale">("retail");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Put the cursor in the first field as soon as the dialog appears.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // While the dialog is open: Escape dismisses it, and the page behind it cannot scroll. Both are
  // ignored / kept while a save is in flight so the request cannot be abandoned half-way. The
  // cleanup removes the listener and restores scrolling when the dialog closes.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [saving, onCancel]);

  /**
   * Validates the fields and saves the customer via POST /api/customers.
   *
   * Rejects blank name / phone and a malformed optional email before any request is sent. A second
   * submit while one is in flight is ignored. A non-2xx answer shows the server's own message when
   * it sent one, otherwise a generic failure line.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - The form submit event.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // stop the browser navigating; this is handled entirely here
    if (saving) return;

    if (!name.trim()) return setError("Customer name is required.");
    if (!phone.trim()) return setError("Phone number is required.");
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      return setError("Enter a valid email address, or leave it blank.");
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_type: type,
          phone: phone.trim(),
          email: email.trim() || undefined,
          registered_city_id: registeredCityId ?? undefined,
          address_line: address.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? "Couldn't save this customer. Please try again.");
        return;
      }
      onCreated(data as CustomerOption); // the 201 body is the created customer itself
    } catch (err) {
      console.error("Failed to create customer:", err);
      setError("Couldn't save this customer. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-customer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop: clicking outside the card dismisses the dialog (unless a save is running) */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        onClick={() => {
          if (!saving) onCancel();
        }}
      />

      {/* max-h + overflow keep the card usable on short screens by scrolling inside itself */}
      <div className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl border border-[#C8C4D7]/50 p-6 z-10">
        <div className="flex items-start justify-between pb-4 border-b border-[#F0F3FF]">
          <h2 id="add-customer-title" className="text-lg font-bold text-[#121C2C]">
            Add new customer
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#474554] hover:bg-[#F0F3FF] transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-customer-name" className={LABEL_CLASS}>
                Customer name
              </label>
              <input
                ref={nameRef}
                id="new-customer-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label htmlFor="new-customer-type" className={LABEL_CLASS}>
                Customer type
              </label>
              <select
                id="new-customer-type"
                value={type}
                onChange={(event) => setType(event.target.value as "retail" | "wholesale")}
                className={FIELD_CLASS}
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </div>

            <div>
              <label htmlFor="new-customer-phone" className={LABEL_CLASS}>
                Phone
              </label>
              <input
                id="new-customer-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label htmlFor="new-customer-email" className={LABEL_CLASS}>
                Email (optional)
              </label>
              <input
                id="new-customer-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="new-customer-address" className={LABEL_CLASS}>
                Address
              </label>
              <input
                id="new-customer-address"
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          {/* role="alert" announces a validation or server error the moment it appears */}
          {error && (
            <p role="alert" className="text-sm text-[#F93C65]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center min-h-10 px-6 rounded-full bg-[#4132C7] text-white text-sm font-semibold hover:bg-[#3427A8] transition-colors disabled:bg-[#E7E7F2] disabled:text-[#474554]/60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save customer"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="inline-flex items-center justify-center min-h-10 px-6 rounded-full border border-[#4132C7] text-[#4132C7] text-sm font-semibold hover:bg-[#F0F3FF] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * NewOrderPage renders the Place New Order form.
 *
 * Step 2 adds the city and delivery-area lookups. The Place Order button stays disabled so the
 * partly wired form cannot be submitted; it is enabled when submit handling is added in Step 6.
 *
 * @returns {JSX.Element} The New Order page component.
 */
export default function NewOrderPage() {
  // Destination cities; `null` means "not loaded yet" and is what drives the loading label.
  const [cities, setCities] = useState<CityOption[] | null>(null);
  const [citiesError, setCitiesError] = useState(false);

  // The chosen city (a <select> value, so a string; "" = none) and the chosen coverage area.
  const [cityId, setCityId] = useState("");
  const [area, setArea] = useState("");

  // Areas for the most recently loaded city. Tagged with its city so a stale result for a city
  // the user has moved away from is recognisably not the current one.
  const [areaData, setAreaData] = useState<AreasForCity | null>(null);
  const [areasError, setAreasError] = useState(false);

  // Bumped by Retry; both loader effects depend on it so a retry re-runs whichever one failed.
  const [lookupToken, setLookupToken] = useState(0);

  // Delivery address text. Controlled (rather than static) so choosing a customer can prefill it.
  const [address, setAddress] = useState("");

  // Customer search: the chosen customer, the raw text, the debounced text, and the results.
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResults | null>(null);
  const [searchErrorFor, setSearchErrorFor] = useState<string | null>(null); // query that failed
  const [listOpen, setListOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Whether the "Add new customer" popup is open, and the link that opened it (focus returns there).
  const [addingCustomer, setAddingCustomer] = useState(false);
  const addCustomerLinkRef = useRef<HTMLButtonElement>(null);

  // Load the destination cities once (and again on Retry).
  useEffect(() => {
    let cancelled = false; // set by cleanup so an unmounted page ignores a late response

    const loadCities = async () => {
      try {
        const response = await fetch("/api/cities?destination_only=true", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Cities request failed (${response.status})`);
        const data = await response.json();
        if (cancelled) return;
        setCities(
          (data.items ?? []).map((c: CityOption) => ({
            city_id: c.city_id,
            city_name: c.city_name,
          }))
        );
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load destination cities:", err);
        setCitiesError(true);
      }
    };

    loadCities();
    return () => {
      cancelled = true;
    };
  }, [lookupToken]);

  // Load the coverage areas whenever a city is chosen. `GET /api/routes?city_id=` returns the
  // city's routes, each with its coverage areas; they are flattened into one sorted name list.
  useEffect(() => {
    if (!cityId) return; // nothing chosen yet, so nothing to load
    let cancelled = false; // a slow response for a previous city must not overwrite this one

    const loadAreas = async () => {
      try {
        const response = await fetch(`/api/routes?city_id=${encodeURIComponent(cityId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Routes request failed (${response.status})`);
        const data = await response.json();
        if (cancelled) return;

        // Keep only areas that belong to the chosen city, drop duplicates with a Set, then sort
        // alphabetically so the dropdown is easy to scan.
        const names = Array.from(
          new Set(
            ((data.items ?? []) as RouteDto[])
              .flatMap((route) => route.coverage_areas ?? [])
              .filter((a) => String(a.city_id) === cityId)
              .map((a) => a.area_name)
          )
        ).sort((a, b) => a.localeCompare(b));

        setAreaData({ cityId, names });
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load coverage areas:", err);
        setAreasError(true);
      }
    };

    loadAreas();
    return () => {
      cancelled = true;
    };
  }, [cityId, lookupToken]);

  // Debounce the search box: restart a 300ms timer on every keystroke so a request is only sent
  // once the user pauses. The cleanup cancels the previous timer, so only the last pause counts.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Search customers whenever the debounced text changes. Results are tagged with their query.
  useEffect(() => {
    if (!debouncedSearch) return; // empty box: nothing to search for
    let cancelled = false; // a slow answer for older text must not overwrite newer results

    const searchCustomers = async () => {
      try {
        const response = await fetch(
          `/api/customers?search=${encodeURIComponent(debouncedSearch)}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error(`Customer search failed (${response.status})`);
        const data = await response.json();
        if (cancelled) return;
        setSearchResults({
          query: debouncedSearch,
          items: (data.items ?? []).map((c: CustomerOption) => ({
            customer_id: c.customer_id,
            customer_name: c.customer_name,
            customer_type: c.customer_type,
            phone: c.phone,
            registered_city_id: c.registered_city_id,
            registered_city_name: c.registered_city_name,
            address_line: c.address_line,
          })),
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to search customers:", err);
        setSearchErrorFor(debouncedSearch);
      }
    };

    searchCustomers();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // Derived search state. Results only count once they answer exactly what is in the box now,
  // which is what stops stale results flashing while the user is still typing.
  const trimmedSearch = searchText.trim();
  const resultsAreCurrent = searchResults?.query === trimmedSearch;
  const searchFailed = searchErrorFor === trimmedSearch && trimmedSearch !== "";
  const searching = trimmedSearch !== "" && !resultsAreCurrent && !searchFailed;
  const allMatches = resultsAreCurrent ? searchResults.items : [];
  const visibleMatches = allMatches.slice(0, MAX_VISIBLE_RESULTS);
  const showList = listOpen && trimmedSearch !== "";
  // Keep the highlight inside the list even if the list shrinks under it.
  const activeIndex = Math.min(highlightIndex, Math.max(visibleMatches.length - 1, 0));

  // Derived, not stored: the areas are loading when a city is chosen but the loaded areas do
  // not yet belong to it, and nothing has failed.
  const areasLoading = cityId !== "" && areaData?.cityId !== cityId && !areasError;
  const areaOptions = areaData?.cityId === cityId ? areaData.names : [];

  /**
   * Handles typing in the customer search box: stores the text, opens the result list and puts the
   * highlight back on the first row. Done here, not in an effect, for the same lint-rule reason
   * as the city reset below.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} event - The input change event.
   */
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
    setListOpen(true);
    setHighlightIndex(0);
  };

  /**
   * Chooses a customer from the results.
   *
   * Prefills the destination city and delivery address from the customer's record, but only the
   * parts the record actually has: a customer saved without a city reports `registered_city_id`
   * 0, and one without an address reports an empty string, and neither may overwrite what the
   * clerk has already entered. The area is cleared only when the city really changes, because the
   * record has no area field and an area only makes sense for its own city. Both prefilled fields
   * stay editable afterwards.
   *
   * @param {CustomerOption} chosen - The customer the user picked.
   */
  const handleSelectCustomer = (chosen: CustomerOption) => {
    setCustomer(chosen);
    setSearchText("");
    setListOpen(false);

    if (chosen.registered_city_id > 0) {
      const chosenCity = String(chosen.registered_city_id);
      if (chosenCity !== cityId) {
        setCityId(chosenCity);
        setArea("");
        setAreasError(false);
      }
    }
    if (chosen.address_line) setAddress(chosen.address_line);
  };

  /**
   * Dismisses the "Add new customer" popup without saving and returns keyboard focus to the link
   * that opened it, so a keyboard user is not dropped back at the top of the page. Memoised so
   * the dialog's Escape-key effect is not torn down and re-attached on every keystroke.
   */
  const handleCloseAddCustomer = useCallback(() => {
    setAddingCustomer(false);
    requestAnimationFrame(() => addCustomerLinkRef.current?.focus());
  }, []);

  /**
   * Called when the popup has saved a new customer: closes it, drops the cached search results
   * (they were fetched before this customer existed, so a repeat search for the same text would
   * otherwise miss them), and selects the new customer exactly as a search pick would. Focus is
   * not returned to the link because the search box it lives beside is replaced by the chip.
   *
   * @param {CustomerOption} created - The customer returned by POST /api/customers.
   */
  const handleCustomerCreated = (created: CustomerOption) => {
    setAddingCustomer(false);
    setSearchResults(null);
    handleSelectCustomer(created);
  };

  /**
   * Clears the chosen customer so a different one can be searched for, then returns keyboard
   * focus to the search box once it has rendered. The prefilled city and address are kept.
   */
  const handleChangeCustomer = () => {
    setCustomer(null);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  /**
   * Keyboard support for the search combobox: ArrowDown/ArrowUp move the highlight (ArrowDown
   * also opens a closed list), Enter chooses the highlighted customer, Escape closes the list.
   *
   * @param {React.KeyboardEvent<HTMLInputElement>} event - The keydown event.
   */
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault(); // stop the caret jumping to the end of the text
      setListOpen(true);
      setHighlightIndex(Math.min(activeIndex + 1, Math.max(visibleMatches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && showList && visibleMatches[activeIndex]) {
      event.preventDefault(); // do not submit or reload; just choose the row
      handleSelectCustomer(visibleMatches[activeIndex]);
    } else if (event.key === "Escape") {
      setListOpen(false);
    }
  };

  /**
   * Handles a change of the destination city.
   *
   * The delivery area is cleared here, in the handler, rather than in an effect: an area only
   * makes sense for the city it was chosen under, and resetting derived state in an effect is
   * what the react-hooks/set-state-in-effect rule forbids.
   *
   * @param {React.ChangeEvent<HTMLSelectElement>} event - The select change event.
   */
  const handleCityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCityId(event.target.value);
    setArea("");
    setAreasError(false); // a failure for the previous city does not apply to the new one
  };

  /**
   * Retries the lookups after a failure by clearing the error flags and bumping the token, which
   * re-runs the city and area loaders.
   */
  const handleRetryLookups = () => {
    setCitiesError(false);
    setAreasError(false);
    setLookupToken((token) => token + 1);
  };

  return (
    <div className="space-y-6">
      {/* Page header: back affordance to the orders list, heading and subheading (doc 07) */}
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
              aria-hidden="true"
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
            New Order
          </h1>
        </div>
        <p className="text-sm text-[#474554] mt-1 ml-11">
          Enter order details on behalf of the customer
        </p>
      </div>

      {/* Lookup failure banner: shown when the city or area list could not be loaded. The copy is
          not in Docs/07_content-copy.md, so it is a plain, neutral message with a retry action. */}
      {(citiesError || areasError) && (
        <div
          role="alert"
          className="bg-[#FFF0F0] border border-[#F93C65]/30 text-[#121C2C] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <span>
            {citiesError
              ? "Couldn't load the destination cities. Please try again."
              : "Couldn't load the delivery areas for this city. Please try again."}
          </span>
          <button
            type="button"
            onClick={handleRetryLookups}
            className="px-4 py-1.5 rounded-full bg-[#4132C7] text-white text-xs font-semibold hover:bg-[#3427A8] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* 12-column grid: form cards take 8, the order-items rail takes 4 on desktop, and both
          stack in a single column on mobile (Docs/11_ui-rules.md §8) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN — form sections */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section 1 — Customer: a type-ahead search, or a summary chip once one is chosen. */}
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
            {customer ? (
              /* Chosen customer: who the order is for, at a glance, with a way to change it. */
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#C8C4D7]/60 bg-[#F9F9FF] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#121C2C]">
                      {customer.customer_name}
                    </span>
                    {/* Type is shown as text as well as colour, never colour alone */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        customer.customer_type === "wholesale"
                          ? "bg-[#EBE9FE] text-[#5B3CDD]"
                          : "bg-[#E0F2FF] text-[#0047CC]"
                      }`}
                    >
                      {customer.customer_type === "wholesale" ? "Wholesale" : "Retail"}
                    </span>
                  </div>
                  <p className="text-xs text-[#474554] mt-0.5">
                    {customer.phone} • {customer.registered_city_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleChangeCustomer}
                  className="px-4 py-1.5 rounded-full border border-[#4132C7] text-[#4132C7] text-xs font-semibold hover:bg-[#F0F3FF] transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <div
                className="relative"
                onBlur={(event) => {
                  // Close the list when focus leaves the whole widget (not when it merely moves
                  // between the input and a result row inside it).
                  if (!event.currentTarget.contains(event.relatedTarget)) setListOpen(false);
                }}
              >
                {/* Label on the left, "+ Add new customer" on the right (doc 07 wording) */}
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <label htmlFor="customer-search" className="text-sm font-semibold text-[#121C2C]">
                    Customer
                  </label>
                  <button
                    ref={addCustomerLinkRef}
                    type="button"
                    onClick={() => setAddingCustomer(true)}
                    className="text-xs font-semibold text-[#4132C7] hover:underline"
                  >
                    + Add new customer
                  </button>
                </div>
                <input
                  ref={searchInputRef}
                  id="customer-search"
                  type="text"
                  role="combobox"
                  aria-expanded={showList}
                  aria-controls="customer-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    showList && visibleMatches[activeIndex]
                      ? `customer-option-${visibleMatches[activeIndex].customer_id}`
                      : undefined
                  }
                  autoComplete="off"
                  value={searchText}
                  onChange={handleSearchChange}
                  onFocus={() => setListOpen(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search by name or phone…"
                  className={FIELD_CLASS}
                />

                {showList && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-[#C8C4D7]/60 shadow-lg overflow-hidden">
                    {visibleMatches.length > 0 ? (
                      <ul id="customer-listbox" role="listbox" aria-label="Matching customers">
                        {visibleMatches.map((match, index) => (
                          <li
                            key={match.customer_id}
                            id={`customer-option-${match.customer_id}`}
                            role="option"
                            aria-selected={index === activeIndex}
                            // mousedown would blur the input before click registers, closing the
                            // list first; preventing it lets the click land.
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectCustomer(match)}
                            onMouseEnter={() => setHighlightIndex(index)}
                            className={`px-4 py-3 cursor-pointer flex items-center justify-between gap-3 ${
                              index === activeIndex ? "bg-[#F0F3FF]" : "bg-white"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-[#121C2C] truncate">
                                {match.customer_name}
                              </span>
                              <span className="block text-xs text-[#474554]">
                                {match.phone} • {match.registered_city_name}
                              </span>
                            </span>
                            <span className="text-[11px] font-semibold text-[#474554] shrink-0">
                              {match.customer_type === "wholesale" ? "Wholesale" : "Retail"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      /* role="status" announces searching / empty / error to screen readers */
                      <p role="status" className="px-4 py-3 text-sm text-[#474554]">
                        {searchFailed
                          ? "Couldn't search customers. Please try again."
                          : searching
                            ? "Searching…"
                            : "No customers found."}
                      </p>
                    )}
                    {allMatches.length > MAX_VISIBLE_RESULTS && (
                      <p className="px-4 py-2 text-xs text-[#474554] border-t border-[#C8C4D7]/40">
                        Showing the first {MAX_VISIBLE_RESULTS} of {allMatches.length}. Keep typing
                        to narrow the list.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Section 2 — Delivery Details. Step 4 wires the city → area dependency and the
              7-day date limit. */}
          <SectionCard
            title="Delivery Details"
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
                  d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            }
          >
            {/* Related fields sit in a 2-column grid that collapses to one column on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="destination-city" className={LABEL_CLASS}>
                  Destination city
                </label>
                <select
                  id="destination-city"
                  value={cityId}
                  onChange={handleCityChange}
                  disabled={cities === null}
                  className={FIELD_CLASS}
                >
                  <option value="" disabled>
                    {cities === null && !citiesError ? "Loading cities…" : "Select city"}
                  </option>
                  {(cities ?? []).map((city) => (
                    <option key={city.city_id} value={String(city.city_id)}>
                      {city.city_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="delivery-area" className={LABEL_CLASS}>
                  Delivery area
                </label>
                {/* A dropdown, not free text: place_order matches the area against the seeded
                    coverage names exactly, so only those spellings may be chosen. Disabled until a
                    city is chosen and while its areas load. */}
                <select
                  id="delivery-area"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  disabled={cityId === "" || areasLoading}
                  className={FIELD_CLASS}
                >
                  <option value="" disabled>
                    {areasLoading ? "Loading areas…" : "e.g. Wellawatte, Colombo 6"}
                  </option>
                  {areaOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="delivery-address" className={LABEL_CLASS}>
                  Delivery address
                </label>
                <input
                  id="delivery-address"
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Full delivery address"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor="expected-delivery-date" className={LABEL_CLASS}>
                  Expected delivery date
                </label>
                <input
                  id="expected-delivery-date"
                  type="date"
                  aria-describedby="expected-delivery-date-help"
                  className={FIELD_CLASS}
                />
                {/* Helper text sits directly below its field (Docs/11_ui-rules.md §4) */}
                <p
                  id="expected-delivery-date-help"
                  className="text-xs text-[#474554] mt-1.5"
                >
                  Must be at least 7 days from today
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT RAIL — order items and summary. Sticky on desktop so the totals stay in view
            while a long form scrolls. */}
        <aside className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
          <SectionCard
            title="Order Items"
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
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            }
          >
            {/* Empty state (doc 07). Step 5 replaces this with the item table and "+ Add item". */}
            <p className="text-sm text-[#474554] text-center py-6">
              No items added yet. Add at least one product to continue.
            </p>

            {/* Summary panel: totals stay at zero until items exist (Step 5) */}
            <dl className="border-t border-[#C8C4D7]/50 pt-4 mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[#474554]">Total value</dt>
                <dd className="font-semibold text-[#121C2C]">Rs. 0.00</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#474554]">Total space required</dt>
                <dd className="font-semibold text-[#121C2C]">0.00 units</dd>
              </div>
            </dl>
          </SectionCard>

          {/* Primary and secondary actions (doc 07: Place Order / Cancel). Place Order stays
              disabled until submit handling exists (Step 6); Cancel simply returns to the list. */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-[#4132C7] text-white text-sm font-semibold shadow-sm disabled:bg-[#E7E7F2] disabled:text-[#474554]/60 disabled:shadow-none disabled:cursor-not-allowed"
            >
              Place Order
            </button>
            <Link
              href="/orders"
              className="inline-flex items-center justify-center min-h-12 px-6 rounded-full border border-[#4132C7] text-[#4132C7] text-sm font-semibold hover:bg-[#F0F3FF] transition-colors"
            >
              Cancel
            </Link>
          </div>
        </aside>
      </div>

      {/* "Add new customer" popup. Mounted only while open so its fields start empty every time. */}
      {addingCustomer && (
        <AddCustomerDialog
          registeredCityId={cityId ? Number(cityId) : null}
          onCreated={handleCustomerCreated}
          onCancel={handleCloseAddCustomer}
        />
      )}
    </div>
  );
}
