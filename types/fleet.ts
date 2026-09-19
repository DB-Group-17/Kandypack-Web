/**
 * @file types/fleet.ts
 * @description Canonical TypeScript types and API DTO interfaces for Fleet & Deliveries (Member 3).
 * Follows system architecture rules from Docs/03_architecture.md §2.1 and Docs/05_api-and-pages.md §A7, §A8.
 */

/**
 * Canonical lifecycle status for truck scheduling.
 * Aligns with chk_ts_status in db/migrations/08_fleet.sql.
 */
export type TruckScheduleStatus =
  | 'Scheduled'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled';

/**
 * Canonical lifecycle status for customer order deliveries.
 * Aligns with chk_del_status in db/migrations/20_delivery_status_cancelled.sql.
 */
export type DeliveryStatus =
  | 'Scheduled'
  | 'In Progress'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

/**
 * Represents a truck vehicle record.
 * Aligns with GET /api/trucks response DTO.
 */
export interface TruckItem {
  truck_id: number;
  plate_number: string;
  capacity_kg: number;
  home_store_id: number;
}

/**
 * Represents a driver record with live roster hour calculations.
 * Aligns with GET /api/drivers response DTO.
 */
export interface DriverItem {
  driver_id: number;
  full_name: string;
  current_week_hours: number;
  weekly_limit: number;
  hours_remaining: number;
}

/**
 * Represents an assistant record with live roster hour calculations.
 * Aligns with GET /api/assistants response DTO.
 */
export interface AssistantItem {
  assistant_id: number;
  full_name: string;
  current_week_hours: number;
  weekly_limit: number;
  hours_remaining: number;
}

/**
 * Represents a truck delivery schedule record.
 * Aligns with GET /api/truck-schedules response DTO.
 */
export interface TruckScheduleItem {
  schedule_id: number;
  truck_plate: string;
  driver_name: string;
  assistant_name: string;
  route_name: string;
  start_time: string;
  end_time: string;
  status: TruckScheduleStatus;
}

/**
 * Request payload for pre-checking truck schedule conflicts.
 * Aligns with GET /api/truck-schedules/:id/conflicts pre-check.
 */
export interface ConflictPreCheckRequest {
  truck_id: number;
  driver_id: number;
  assistant_id: number;
  start_time: string;
  end_time: string;
}

/**
 * Response returned by schedule conflict pre-check.
 */
export interface ConflictPreCheckResponse {
  has_conflict: boolean;
  reasons: string[];
}

/**
 * Request payload for creating a new truck schedule.
 * Aligns with POST /api/truck-schedules.
 */
export interface CreateTruckSchedulePayload {
  truck_id: number;
  driver_id: number;
  assistant_id: number;
  route_id: number;
  start_time: string;
  end_time: string;
}

/**
 * Represents an individual customer delivery record.
 * Aligns with GET /api/deliveries response DTO.
 */
export interface DeliveryItem {
  delivery_id: number;
  order_id: number;
  customer_name: string;
  truck_plate: string;
  driver_name: string;
  status: DeliveryStatus;
  delivered_at: string | null;
  notes?: string;
  delivery_address?: string;
}
