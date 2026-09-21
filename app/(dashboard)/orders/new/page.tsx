"use client";

/**
 * @file app/(dashboard)/orders/new/page.tsx
 * @description Place New Order page — the order-entry form used by clerks to place a customer
 * order on their behalf.
 *
 * Build status: STEP 1 of 8 — the static page shell only. Nothing on this page is wired to data
 * yet. It establishes the layout, the Docs/07_content-copy.md copy and the shared card / field
 * styling that the later steps fill in.
 *
 * Page structure:
 * - Header: back affordance, "New Order" heading and subheading.
 * - Left column (8/12): "Customer" card, then "Delivery Details" card.
 * - Right rail (4/12, sticky on desktop): "Order Items" card holding the empty state and the
 *   summary panel (total value, total space required), followed by the Place Order / Cancel
 *   actions. The rail collapses beneath the form on narrow screens (Docs/11_ui-rules.md §8).
 *
 * Planned data flow (added step by step, not present yet):
 * - GET /api/customers?search=…   customer type-ahead (300ms debounce)
 * - GET /api/cities?destination_only=true  destination city dropdown
 * - GET /api/routes?city_id=…     coverage areas for the chosen city (exact spellings — the
 *   delivery area must be a dropdown because place_order matches it against these names)
 * - GET /api/products             line-item product picker with unit price and space rate
 * - POST /api/orders              submit; a 400 shows the procedure's message inline, a 201
 *   redirects to /orders/[orderId]
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

import React from "react";
import Link from "next/link";

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

/**
 * NewOrderPage renders the static shell of the Place New Order form.
 *
 * No state, effects or handlers exist yet (Step 1). The Place Order button is disabled so the
 * unwired form cannot be submitted; it is enabled when submit handling is added in Step 6.
 *
 * @returns {JSX.Element} The New Order page component.
 */
export default function NewOrderPage() {
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

      {/* 12-column grid: form cards take 8, the order-items rail takes 4 on desktop, and both
          stack in a single column on mobile (Docs/11_ui-rules.md §8) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN — form sections */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section 1 — Customer. Step 3 turns this into a type-ahead search. */}
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
            <label htmlFor="customer-search" className={LABEL_CLASS}>
              Customer
            </label>
            <input
              id="customer-search"
              type="text"
              placeholder="Search by name or phone…"
              className={FIELD_CLASS}
            />
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
                  defaultValue=""
                  className={FIELD_CLASS}
                >
                  <option value="" disabled>
                    Select city
                  </option>
                </select>
              </div>

              <div>
                <label htmlFor="delivery-area" className={LABEL_CLASS}>
                  Delivery area
                </label>
                <select
                  id="delivery-area"
                  defaultValue=""
                  className={FIELD_CLASS}
                >
                  <option value="" disabled>
                    e.g. Wellawatte, Colombo 6
                  </option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="delivery-address" className={LABEL_CLASS}>
                  Delivery address
                </label>
                <input
                  id="delivery-address"
                  type="text"
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
    </div>
  );
}
