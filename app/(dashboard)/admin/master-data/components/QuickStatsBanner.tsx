'use client';

/**
 * @file QuickStatsBanner.tsx
 * @description Bento grid displaying 3 dynamic KPI stat cards above the Master Data table.
 * Changes metrics and icon highlights adaptively based on the active tab selection.
 */

import React from 'react';
import { TabStatsConfig, MasterDataStatItem } from '../types';

interface QuickStatsBannerProps {
  /** Stats configuration for the active tab */
  stats: TabStatsConfig;
}

/**
 * Helper to render appropriate SVG icon based on semantic icon key.
 *
 * @param icon The semantic icon identifier
 * @returns JSX Element for SVG icon
 */
const renderStatIcon = (icon: string): React.JSX.Element => {
  switch (icon) {
    case 'inventory':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      );
    case 'check_circle':
    case 'verified':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'category':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      );
    case 'alt_route':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      );
    case 'store':
    case 'warehouse':
    case 'storefront':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      );
    case 'location_city':
    case 'domain':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
          />
        </svg>
      );
    case 'train':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
          />
        </svg>
      );
    case 'group':
    case 'badge':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      );
    case 'local_shipping':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
          />
        </svg>
      );
    case 'shopping_bag':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
      );
    default:
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
  }
};

/**
 * Resolves container color styling for the theme.
 *
 * @param theme The color theme
 * @returns CSS class strings for background and text
 */
const getThemeClasses = (theme: 'purple' | 'green' | 'blue' | 'amber') => {
  switch (theme) {
    case 'purple':
      return {
        bg: 'bg-[#EBE9FE]',
        text: 'text-[#4132C7]',
      };
    case 'green':
      return {
        bg: 'bg-[#E6F6F4]',
        text: 'text-[#00B69B]',
      };
    case 'blue':
      return {
        bg: 'bg-[#E0F2FF]',
        text: 'text-[#0047CC]',
      };
    case 'amber':
      return {
        bg: 'bg-[#FFF9E6]',
        text: 'text-[#FFB800]',
      };
  }
};

/**
 * Single Stat Card Subcomponent
 */
const StatCard: React.FC<{ item: MasterDataStatItem }> = ({ item }) => {
  const themeClasses = getThemeClasses(item.theme);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#C8C4D7]/30 flex items-center gap-4 transition-all duration-150 hover:shadow-sm">
      <div
        className={`w-12 h-12 rounded-xl ${themeClasses.bg} ${themeClasses.text} flex items-center justify-center shrink-0 shadow-inner`}
      >
        {renderStatIcon(item.icon)}
      </div>
      <div>
        <p className="text-[11px] font-bold text-[#474554] tracking-wider uppercase">
          {item.title}
        </p>
        <p className="text-[26px] font-bold text-[#121C2C] leading-none mt-1">
          {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
        </p>
        {item.subtitle && (
          <p className="text-[12px] text-[#474554] mt-0.5">{item.subtitle}</p>
        )}
      </div>
    </div>
  );
};

/**
 * QuickStatsBanner Component
 */
export const QuickStatsBanner: React.FC<QuickStatsBannerProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard item={stats.stat1} />
      <StatCard item={stats.stat2} />
      <StatCard item={stats.stat3} />
    </div>
  );
};
