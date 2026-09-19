'use client';

/**
 * @file UserStatsBento.tsx
 * @description 4-card Bento KPI overview for the User Accounts interface.
 * Displays Total Users, Active Users, Deactivated Users, and System Administrators
 * with semantic icon containers and subtle elevation matching DESIGN.md.
 */

import React from 'react';
import { UserStats } from '../types';

interface UserStatsBentoProps {
  /** Aggregated KPI metrics */
  stats: UserStats;
  /** Optional filter trigger when clicking on a card */
  onSelectFilter?: (status: 'ALL' | 'ACTIVE' | 'DEACTIVATED' | 'ADMIN') => void;
  /** Currently active filter context */
  activeStatusFilter?: 'ALL' | 'ACTIVE' | 'DEACTIVATED';
  activeRoleFilter?: string;
}

/**
 * UserStatsBento Component
 *
 * Renders the responsive 4-column KPI overview grid for user accounts.
 *
 * @param props Component properties containing stats and filter callbacks
 * @returns Bento grid element
 */
export const UserStatsBento: React.FC<UserStatsBentoProps> = ({
  stats,
  onSelectFilter,
  activeStatusFilter = 'ALL',
  activeRoleFilter = 'ALL',
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Total Users */}
      <div
        onClick={() => onSelectFilter?.('ALL')}
        className={`bg-white rounded-2xl p-5 border shadow-xs transition-all duration-200 cursor-pointer ${
          activeStatusFilter === 'ALL' && activeRoleFilter === 'ALL'
            ? 'border-[#4132C7] ring-2 ring-[#4132C7]/15 shadow-sm'
            : 'border-[#C8C4D7]/40 hover:border-[#4132C7]/50 hover:shadow-md'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#EDE9FE] text-[#4132C7] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#474554] uppercase tracking-wider">
              Total Users
            </p>
            <p className="text-[26px] font-bold text-[#121C2C] tracking-tight leading-tight mt-0.5">
              {stats.totalUsers.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Card 2: Active Accounts */}
      <div
        onClick={() => onSelectFilter?.('ACTIVE')}
        className={`bg-white rounded-2xl p-5 border shadow-xs transition-all duration-200 cursor-pointer ${
          activeStatusFilter === 'ACTIVE'
            ? 'border-[#00B69B] ring-2 ring-[#00B69B]/15 shadow-sm'
            : 'border-[#C8C4D7]/40 hover:border-[#00B69B]/50 hover:shadow-md'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#E6F6F4] text-[#00B69B] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#474554] uppercase tracking-wider">
              Active Now
            </p>
            <p className="text-[26px] font-bold text-[#121C2C] tracking-tight leading-tight mt-0.5">
              {stats.activeUsers.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Card 3: Deactivated Accounts */}
      <div
        onClick={() => onSelectFilter?.('DEACTIVATED')}
        className={`bg-white rounded-2xl p-5 border shadow-xs transition-all duration-200 cursor-pointer ${
          activeStatusFilter === 'DEACTIVATED'
            ? 'border-[#F93C65] ring-2 ring-[#F93C65]/15 shadow-sm'
            : 'border-[#C8C4D7]/40 hover:border-[#F93C65]/50 hover:shadow-md'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#FFF0F0] text-[#F93C65] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#474554] uppercase tracking-wider">
              Deactivated
            </p>
            <p className="text-[26px] font-bold text-[#121C2C] tracking-tight leading-tight mt-0.5">
              {stats.deactivatedUsers.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Card 4: System Administrators */}
      <div
        onClick={() => onSelectFilter?.('ADMIN')}
        className={`bg-white rounded-2xl p-5 border shadow-xs transition-all duration-200 cursor-pointer ${
          activeRoleFilter === 'system_administrator'
            ? 'border-[#5A4FE0] ring-2 ring-[#5A4FE0]/15 shadow-sm'
            : 'border-[#C8C4D7]/40 hover:border-[#5A4FE0]/50 hover:shadow-md'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#F0F3FF] text-[#5A4FE0] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#474554] uppercase tracking-wider">
              Admins
            </p>
            <p className="text-[26px] font-bold text-[#121C2C] tracking-tight leading-tight mt-0.5">
              {stats.adminUsers.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
