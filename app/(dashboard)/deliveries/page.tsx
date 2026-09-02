'use client';

import React, { useState } from 'react';
import { CheckCircle2, MessageSquare } from 'lucide-react';
import type { Delivery } from '@/types/fleet';

// Dummy data for Phase 0
const initialDeliveries: (Delivery & { order_ref: string, address: string })[] = [
  {
    id: 'del-1',
    order_id: 'ord-123',
    truck_schedule_id: 'ts-1',
    status: 'pending',
    order_ref: 'ORD-100234',
    address: 'Keells Super, Union Place, Colombo 02'
  },
  {
    id: 'del-2',
    order_id: 'ord-124',
    truck_schedule_id: 'ts-1',
    status: 'delivered',
    order_ref: 'ORD-100235',
    address: 'Cargills Food City, Staples St, Colombo 02',
    notes: 'Delivered to back entrance'
  }
];

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState(initialDeliveries);

  const markComplete = (id: string) => {
    setDeliveries(deliveries.map(d => 
      d.id === id ? { ...d, status: 'delivered' } : d
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.02em] text-[#121C2C]">
          Active Deliveries
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {deliveries.map((delivery) => (
          <div 
            key={delivery.id} 
            className="bg-white p-6 rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-transparent hover:border-[#C8C4D7] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-[#474554] bg-[#F5F5FA] px-2 py-0.5 rounded">
                  {delivery.order_ref}
                </span>
                {delivery.status === 'delivered' ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E6F6F4] text-[#00B69B]">
                    Delivered
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF9E6] text-[#FFB800]">
                    In Transit
                  </span>
                )}
              </div>
              <p className="text-[16px] text-[#121C2C] font-medium mt-1">
                {delivery.address}
              </p>
              {delivery.notes && (
                <div className="flex items-start gap-2 mt-2 text-[#777586]">
                  <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[14px]">{delivery.notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {delivery.status === 'pending' && (
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input 
                    type="text" 
                    placeholder="Add delivery notes..." 
                    className="flex-1 md:w-48 h-10 px-3 rounded-lg border border-[#C8C4D7] text-[14px] outline-none focus:border-[#4132C7]"
                  />
                  <button 
                    onClick={() => markComplete(delivery.id)}
                    className="bg-[#00B69B] hover:bg-[#00a38b] text-white px-5 h-10 rounded-full font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Complete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
