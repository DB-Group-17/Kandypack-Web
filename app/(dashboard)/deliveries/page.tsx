'use client';

/**
 * @file page.tsx
 * @description Static frontend shell for the Deliveries management page (/deliveries).
 * Owned by Member 3 (Fleet & Deliveries). Aligns with Docs/05_api-and-pages.md §A8 and DESIGN.md.
 */

import React, { useState } from 'react';
import { CheckCircle2, MessageSquare, Truck } from 'lucide-react';
import type { DeliveryItem, DeliveryStatus } from '@/types/fleet';

/**
 * Initial mock deliveries aligned with seed data and API DTO contract.
 */
const initialDeliveries: DeliveryItem[] = [
  {
    delivery_id: 1,
    order_id: 100234,
    customer_name: 'Keells Super - Union Place',
    truck_plate: 'WP-LC-1234',
    driver_name: 'Nimal Perera',
    status: 'In Progress',
    delivered_at: null,
    delivery_address: 'Keells Super, Union Place, Colombo 02',
    notes: 'Fragile items - handle with care',
  },
  {
    delivery_id: 2,
    order_id: 100235,
    customer_name: 'Cargills Food City - Staples St',
    truck_plate: 'WP-LC-1234',
    driver_name: 'Nimal Perera',
    status: 'Completed',
    delivered_at: '2026-09-02 11:30:00',
    delivery_address: 'Cargills Food City, Staples St, Colombo 02',
    notes: 'Delivered to back entrance receiving dock',
  },
  {
    delivery_id: 3,
    order_id: 100236,
    customer_name: 'Arpico Supercentre - Hyde Park',
    truck_plate: 'WP-LC-5678',
    driver_name: 'Sunil Jayawardena',
    status: 'Scheduled',
    delivered_at: null,
    delivery_address: 'Arpico Supercentre, Hyde Park Corner, Colombo 02',
  },
];

/**
 * Returns semantic badge classes for DeliveryStatus.
 *
 * @param {DeliveryStatus} status - The current status of the delivery.
 * @returns {string} Tailwind CSS class list.
 */
function getDeliveryBadgeClass(status: DeliveryStatus): string {
  switch (status) {
    case 'Completed':
      return 'bg-[#E6F6F4] text-[#00B69B]';
    case 'In Progress':
      return 'bg-[#FFF9E6] text-[#FFB800]';
    case 'Scheduled':
      return 'bg-[#E0F2FF] text-[#0047CC]';
    case 'Failed':
    case 'Cancelled':
      return 'bg-[#FFF0F0] text-[#F93C65]';
    default:
      return 'bg-[#F1F1F5] text-[#474554]';
  }
}

/**
 * DeliveriesPage renders the list of active last-mile customer deliveries.
 *
 * @returns {JSX.Element} The rendered Deliveries interface.
 */
export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>(initialDeliveries);
  const [deliveryNotes, setDeliveryNotes] = useState<Record<number, string>>({});

  /**
   * Marks an in-progress delivery as Completed.
   *
   * @param {number} deliveryId - Primary key of the delivery to complete.
   */
  const markComplete = (deliveryId: number) => {
    const customNote = deliveryNotes[deliveryId];
    setDeliveries((prev) =>
      prev.map((d) =>
        d.delivery_id === deliveryId
          ? {
              ...d,
              status: 'Completed',
              delivered_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
              notes: customNote || d.notes,
            }
          : d
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.02em] text-[#121C2C]">
            Active Deliveries
          </h1>
          <p className="text-sm text-[#474554] mt-1">
            Track and complete store-to-customer order deliveries
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {deliveries.map((delivery) => (
          <div
            key={delivery.delivery_id}
            className="bg-white p-6 rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 hover:border-[#C8C4D7] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-[#474554] bg-[#F5F5FA] px-2.5 py-1 rounded font-semibold">
                  ORD-{delivery.order_id}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getDeliveryBadgeClass(delivery.status)}`}>
                  {delivery.status}
                </span>
                <span className="text-xs text-[#777586] flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-[#474554]" />
                  {delivery.truck_plate} ({delivery.driver_name})
                </span>
              </div>
              <h3 className="text-[16px] text-[#121C2C] font-semibold mt-1">
                {delivery.customer_name}
              </h3>
              <p className="text-[14px] text-[#474554]">
                {delivery.delivery_address}
              </p>
              {delivery.notes && (
                <div className="flex items-start gap-2 mt-2 text-[#777586]">
                  <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[13px]">{delivery.notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {(delivery.status === 'In Progress' || delivery.status === 'Scheduled') && (
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input 
                    type="text" 
                    placeholder="Add delivery notes..." 
                    value={deliveryNotes[delivery.delivery_id] || ''}
                    onChange={(e) =>
                      setDeliveryNotes({
                        ...deliveryNotes,
                        [delivery.delivery_id]: e.target.value,
                      })
                    }
                    className="flex-1 md:w-52 h-10 px-3 rounded-lg border border-[#C8C4D7] text-[14px] outline-none focus:border-[#4132C7]"
                  />
                  <button 
                    onClick={() => markComplete(delivery.delivery_id)}
                    className="bg-[#00B69B] hover:bg-[#00a38b] text-white px-5 h-10 rounded-full font-medium transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
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
