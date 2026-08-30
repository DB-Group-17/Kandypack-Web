import React from 'react';
import Link from 'next/link';
import { Truck, Package, Calendar } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#F5F5FA]">
      {/* 260px Sidebar as per Docs/11_ui-rules.md */}
      <aside className="w-[260px] flex-shrink-0 bg-[#4132C7] text-white flex flex-col fixed inset-y-0 left-0">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight">Kandypack</h1>
        </div>
        
        <nav className="flex-1 px-3 space-y-1 mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60 px-3 mb-2">
            Fleet & Deliveries
          </div>
          
          <Link 
            href="/truck-schedule" 
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium"
          >
            <Calendar className="w-4 h-4" />
            Truck Schedules
          </Link>
          
          <Link 
            href="/deliveries" 
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium"
          >
            <Package className="w-4 h-4" />
            Deliveries
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-[260px] flex flex-col min-h-screen">
        <header className="h-[72px] bg-[#F9F9FF] border-b border-[#C8C4D7] flex items-center px-8 sticky top-0 z-10">
          <div className="flex-1"></div>
          <div className="flex items-center gap-4">
            {/* Topbar placeholder */}
            <div className="w-8 h-8 rounded-full bg-[#E0F2FF] text-[#0047CC] flex items-center justify-center text-sm font-semibold">
              M3
            </div>
          </div>
        </header>
        
        <div className="p-8 flex-1 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
