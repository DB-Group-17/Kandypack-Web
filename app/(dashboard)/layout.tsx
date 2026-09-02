"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation item structure for the dashboard sidebar.
 */
interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  section?: string;
  badge?: string;
}

/**
 * DashboardLayoutProps defines the children passed into the layout.
 */
interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * DashboardLayout provides the core application shell for all authenticated pages.
 * It renders:
 * 1. A deep violet fixed/sticky desktop sidebar (260px width, #5A4FE0 container) with pill active items.
 * 2. A responsive mobile drawer navigation.
 * 3. A top app bar with search, role context, and sign-out controls.
 * 4. The main fluid content canvas with standard #F5F5FA background and 24-32px gutters.
 *
 * @param {DashboardLayoutProps} props - The layout properties containing child route components.
 * @returns {JSX.Element} The rendered dashboard layout shell.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Sidebar navigation configuration mapping to the system's operational modules
  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      section: "Main",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      label: "Orders",
      href: "/orders",
      section: "Main",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      label: "Train Schedule",
      href: "/train-schedule",
      section: "Operations",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      ),
    },
    {
      label: "Truck Schedule",
      href: "/truck-schedule",
      section: "Operations",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1h4l3 3v4a1 1 0 01-1 1h-2" />
        </svg>
      ),
    },
    {
      label: "Deliveries",
      href: "/deliveries",
      section: "Operations",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    {
      label: "Inventory",
      href: "/inventory",
      section: "Operations",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: "Reports",
      href: "/reports",
      section: "Analytics",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: "Admin",
      href: "/admin/master-data",
      section: "Administration",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  /**
   * Evaluates whether a given navigation item is currently active.
   * Matches root paths or subpaths.
   */
  const isItemActive = (href: string): boolean => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[#F5F5FA] flex flex-col antialiased text-[#121C2C]">
      {/* Desktop Fixed Left Sidebar */}
      <aside
        aria-label="Application navigation"
        className="hidden md:flex flex-col w-[260px] fixed top-0 left-0 bottom-0 bg-[#5A4FE0] text-white z-30 shadow-md select-none"
      >
        {/* Brand & Logo Header */}
        <div className="px-6 py-6 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white text-[#5A4FE0] flex items-center justify-center font-bold text-xl shadow-sm">
            K
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight block text-white">Kandypack</span>
            <span className="text-xs text-white/70 tracking-wide font-medium">Logistics Workspace</span>
          </div>
        </div>

        {/* Navigation Items List grouped by operational domain */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {navItems.map((item, index) => {
            const active = isItemActive(item.href);
            const showSectionHeading =
              index === 0 || item.section !== navItems[index - 1].section;

            return (
              <React.Fragment key={item.href}>
                {showSectionHeading && item.section && (
                  <div className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    {item.section}
                  </div>
                )}
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-all duration-150 ${
                    active
                      ? "bg-white text-[#4132C7] shadow-sm font-semibold translate-x-1"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className={active ? "text-[#4132C7]" : "text-white/80"}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Sidebar Footer User Scope Preview */}
        <div className="p-4 border-t border-white/10 bg-black/5">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold text-white">
              LM
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Linari</p>
              <p className="text-[11px] text-white/70 truncate">Logistics Manager</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame (offset for 260px fixed desktop sidebar) */}
      <div className="flex-1 flex flex-col md:pl-[260px] min-h-screen">
        {/* Top App Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-[#C8C4D7]/50 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-xs">
          {/* Mobile hamburger menu toggle button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-[#474554] hover:bg-[#F0F3FF] focus:outline-hidden"
              aria-label="Toggle navigation menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#474554]">
              <span className="w-2 h-2 rounded-full bg-[#00B69B]" />
              <span className="font-medium">System Online</span>
              <span className="text-[#C8C4D7]">|</span>
              <span>Sri Lanka Rail & Road Logistics</span>
            </div>
          </div>

          {/* User Profile & Global Utility Menu */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-right">
              <div>
                <p className="text-xs md:text-sm font-semibold text-[#121C2C]">Linari</p>
                <p className="text-[11px] text-[#474554] capitalize">Logistics Manager</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#E0F2FF] text-[#0047CC] flex items-center justify-center font-bold text-xs">
                L
              </div>
            </div>

            <div className="h-6 w-px bg-[#C8C4D7]" />

            <Link
              href="/login"
              className="text-xs font-medium text-[#474554] hover:text-[#F93C65] transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-[#FFF0F0]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </Link>
          </div>
        </header>

        {/* Mobile Navigation Drawer Overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer Content */}
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#5A4FE0] text-white p-5 shadow-xl">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white text-[#5A4FE0] flex items-center justify-center font-bold text-base">
                    K
                  </div>
                  <span className="font-bold text-base text-white">Kandypack</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-white/80 hover:text-white"
                  aria-label="Close menu"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav className="mt-4 flex-1 overflow-y-auto space-y-1">
                {navItems.map((item) => {
                  const active = isItemActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
                        active
                          ? "bg-white text-[#4132C7] font-semibold"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Page Content Canvas */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
