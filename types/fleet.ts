export interface Truck {
  id: string;
  plate_number: string;
  capacity_kg: number;
  status: 'available' | 'maintenance' | 'in_transit';
}

export interface Employee {
  id: string;
  user_id: string; // FK to users
  name: string;
  role: 'driver' | 'assistant';
  current_weekly_hours: number;
}

export interface TruckSchedule {
  id: string;
  truck_id: string;
  driver_id: string;
  assistant_id: string;
  scheduled_date: string;
  status: 'scheduled' | 'in_progress' | 'completed';
}

export interface ConflictWarning {
  has_conflict: boolean;
  warnings: string[];
}

export interface Delivery {
  id: string;
  order_id: string;
  truck_schedule_id: string;
  status: 'pending' | 'delivered' | 'failed';
  notes?: string;
}
