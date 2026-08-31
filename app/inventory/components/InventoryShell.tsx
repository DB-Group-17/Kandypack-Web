'use client';

/**
 * @file InventoryShell.tsx
 * @description Layout shell for Store Inventory matching UI/store_inventory/screen.png and code.html.
 * Fixed 260px deep-violet sidebar, transparent top app bar with search & operator profile,
 * and fluid content workspace.
 */

import React, { useState } from 'react';
import Link from 'next/link';

interface InventoryShellProps {
  /** Main page content */
  children: React.ReactNode;
  /** Optional search query value bound to top search bar */
  searchQuery?: string;
  /** Optional callback when top search bar changes */
  onSearchChange?: (val: string) => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  isActive?: boolean;
}

/**
 * InventoryShell Component
 */
export const InventoryShell: React.FC<InventoryShellProps> = ({
  children,
  searchQuery = '',
  onSearchChange,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mainNavItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      label: 'Orders',
      href: '/orders',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      label: 'Train Schedule',
      href: '/train-schedule',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      ),
    },
    {
      label: 'Truck Schedule',
      href: '/truck-schedule',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      label: 'Deliveries',
      href: '/deliveries',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: 'Inventory',
      href: '/inventory',
      isActive: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const adminNavItems: NavItem[] = [
    {
      label: 'Users',
      href: '/admin/users',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      label: 'Master Data',
      href: '/admin/master-data',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
    },
    {
      label: 'Audit Log',
      href: '/admin/audit-log',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="bg-[#f9f9ff] text-[#121c2c] min-h-screen font-sans antialiased">
      {/* Fixed Left Sidebar (260px) */}
      <aside className="w-[260px] h-screen fixed left-0 top-0 bg-[#5a4fe0] text-[#e5e1ff] flex flex-col py-6 z-20 shadow-none">
        {/* Brand Header */}
        <div className="px-8 mb-8">
          <Link href="/dashboard" className="block">
            <h1 className="text-[24px] font-bold text-white tracking-tight leading-tight">
              Kandypack
            </h1>
            <p className="text-[12px] opacity-80 mt-1 text-[#e5e1ff]">
              Logistics Management
            </p>
          </Link>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 overflow-y-auto px-4 space-y-2 custom-scrollbar">
          {mainNavItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`px-4 py-2 flex items-center gap-3 rounded-full text-[14px] transition-colors cursor-pointer ${
                item.isActive
                  ? 'bg-[#6c61e8] text-white font-semibold shadow-md'
                  : 'text-white/70 font-medium hover:bg-[#6c61e8]/50 hover:text-white'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Admin Section */}
          <div className="mt-8 mb-2 px-4">
            <span className="text-[12px] font-semibold uppercase tracking-wider opacity-60 text-white">
              Admin
            </span>
          </div>

          {adminNavItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`px-4 py-2 flex items-center gap-3 rounded-full text-[14px] transition-colors cursor-pointer ${
                item.isActive
                  ? 'bg-[#6c61e8] text-white font-semibold shadow-md'
                  : 'text-white/70 font-medium hover:bg-[#6c61e8]/50 hover:text-white'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom Logout Link */}
        <div className="mt-auto px-4 pt-4">
          <Link
            href="/login"
            className="text-white/70 font-medium px-4 py-2 flex items-center gap-3 hover:bg-[#6c61e8]/50 hover:text-white transition-colors rounded-full cursor-pointer text-[14px]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </Link>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex flex-col w-[260px] max-w-[80%] bg-[#5a4fe0] text-[#e5e1ff] h-full z-10 py-6">
            <div className="px-6 mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-[20px] font-bold text-white tracking-tight leading-tight">
                  Kandypack
                </h1>
                <p className="text-[11px] opacity-80 text-[#e5e1ff]">Logistics Management</p>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:bg-white/10"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 space-y-1.5 custom-scrollbar">
              {mainNavItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-2 flex items-center gap-3 rounded-full text-[14px] transition-colors ${
                    item.isActive
                      ? 'bg-[#6c61e8] text-white font-semibold shadow-md'
                      : 'text-white/70 font-medium hover:bg-[#6c61e8]/50 hover:text-white'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
              <div className="mt-6 mb-2 px-4">
                <span className="text-[12px] font-semibold uppercase tracking-wider opacity-60 text-white">
                  Admin
                </span>
              </div>
              {adminNavItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-2 flex items-center gap-3 rounded-full text-[14px] transition-colors ${
                    item.isActive
                      ? 'bg-[#6c61e8] text-white font-semibold shadow-md'
                      : 'text-white/70 font-medium hover:bg-[#6c61e8]/50 hover:text-white'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Top App Bar */}
      <header className="h-20 lg:ml-[260px] top-0 right-0 fixed left-0 z-10 bg-[#f9f9ff] text-[#4132c7] flex items-center justify-between px-4 sm:px-8 w-auto bg-opacity-95 backdrop-blur-sm border-none">
        <div className="flex items-center gap-3">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-lg text-[#474554] hover:bg-[#f0f3ff] transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Search Bar matching screen.png */}
          <div className="flex items-center w-60 sm:w-96 bg-white rounded-full border border-[#c8c4d7] px-4 py-2 shadow-xs focus-within:ring-2 focus-within:ring-[#4132c7] focus-within:border-[#4132c7] transition-all">
            <svg className="w-5 h-5 text-[#474554] mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search inventory..."
              className="w-full bg-transparent border-none focus:ring-0 text-[14px] outline-none text-[#121c2c] placeholder-[#777586]"
            />
          </div>
        </div>

        {/* Trailing Actions: Notifications, Help, Operator Profile */}
        <div className="flex items-center gap-6">
          <button
            className="text-[#474554] hover:bg-[#f0f3ff] p-2 rounded-full transition-all cursor-pointer"
            aria-label="Notifications"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>

          <button
            className="text-[#474554] hover:bg-[#f0f3ff] p-2 rounded-full transition-all cursor-pointer"
            aria-label="Help"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Profile Card */}
          <div className="flex items-center gap-3 pl-4 border-l border-[#c8c4d7]">
            <div className="w-10 h-10 rounded-full bg-[#5a4fe0] text-white font-bold flex items-center justify-center text-sm shadow-xs">
              JD
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-semibold text-[#121c2c] leading-tight">
                Operator John Doe
              </span>
              <Link
                href="/login"
                className="text-[12px] text-[#474554] cursor-pointer hover:text-[#4132c7] transition-colors"
              >
                Sign Out
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="ml-[260px] mt-20 p-8 min-h-[calc(100vh-80px)]">
        {children}
      </main>
    </div>
  );
};
