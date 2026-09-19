/**
 * @file types.ts
 * @description TypeScript type definitions and interfaces for the Store Inventory module (/inventory).
 * Covers stores, stock items, inventory transactions, receive goods workflows, filters, and pagination.
 */

/**
 * Represents a physical warehouse/station store entity in the system.
 * Aligns with Docs/04_database-schema-v4.md table `stores`.
 */
export interface Store {
  /** Unique primary key identifier for the store */
  store_id: number;
  /** Display name of the store (e.g., 'Colombo Station Store') */
  store_name: string;
  /** Associated city ID foreign key */
  city_id: number;
  /** City name for display and filtering */
  city_name: string;
}

/**
 * Health status classification for product stock quantities.
 */
export type StockStatus = 'healthy' | 'low_stock' | 'critical';

/**
 * Represents an individual product line's stock level at a specific store.
 * Aligns with Docs/04_database-schema-v4.md table `store_inventory`.
 */
export interface StockItem {
  /** Primary key of the product */
  product_id: number;
  /** Human-readable product name */
  product_name: string;
  /** Unique Stock Keeping Unit code (e.g., 'CHOC-PR-100') */
  sku: string;
  /** Product category grouping */
  category: string;
  /** Unit of measurement (e.g., 'box', 'bottle', 'pack') */
  unit_of_measure: string;
  /** Current quantity on hand at the active store */
  quantity_on_hand: number;
  /** Minimum threshold before a low-stock alert triggers */
  threshold: number;
  /** Formatted timestamp of the last stock change */
  updated_at: string;
  /** Calculated health status of the stock */
  status: StockStatus;
}

/**
 * Permissible transaction types for inventory ledger entries.
 * Aligns with DB enum ('receive', 'dispatch', 'adjustment').
 */
export type TransactionType = 'receive' | 'dispatch' | 'adjustment';

/**
 * Represents an immutable inventory movement ledger record.
 * Aligns with Docs/04_database-schema-v4.md table `inventory_transactions`.
 */
export interface InventoryTransaction {
  /** Unique primary key for the transaction */
  transaction_id: number;
  /** ID of the store where the transaction occurred */
  store_id: number;
  /** Name of the store for quick display */
  store_name: string;
  /** ID of the affected product */
  product_id: number;
  /** Product name */
  product_name: string;
  /** Product SKU */
  sku: string;
  /** Net quantity change (positive for receive, negative for dispatch) */
  change_qty: number;
  /** Categorized transaction type */
  transaction_type: TransactionType;
  /** Reference document / trip / delivery code (e.g., 'TB-102', 'DEL-401') */
  reference_code: string;
  /** Date and time when the transaction was committed */
  created_at: string;
  /** Full name of the operator or driver who recorded the action */
  created_by_name: string;
  /** Optional memo or note explaining discrepancies or special handling */
  notes?: string;
}

/**
 * Item specification for a train booking ready for goods receipt.
 */
export interface TrainBookingItem {
  /** Product identifier */
  product_id: number;
  /** Product name */
  product_name: string;
  /** SKU code */
  sku: string;
  /** Expected quantity dispatched from Kandy Central */
  expected_quantity: number;
}

/**
 * Represents an arrived train trip booking available for receiving at the store.
 */
export interface ArrivedTrainBooking {
  /** Unique train booking identifier */
  train_booking_id: number;
  /** Human-readable trip code (e.g., 'TRIP-2026-102') */
  trip_code: string;
  /** Train departure origin city */
  origin_city: string;
  /** Destination city (must match the active store) */
  destination_city: string;
  /** Arrival timestamp */
  arrival_datetime: string;
  /** List of products and expected units contained in this booking */
  items: TrainBookingItem[];
}

/**
 * Form line-item for the Receive Goods modal.
 */
export interface ReceiveGoodsItemInput {
  product_id: number;
  product_name: string;
  sku: string;
  expected_quantity: number;
  received_quantity: number;
}

/**
 * Filter parameters for the Stock Levels view.
 */
export interface StockFilters {
  /** Free-text search query matching product name or SKU */
  searchQuery: string;
  /** Status filter: 'all' or specific stock level */
  statusFilter: 'all' | 'healthy' | 'low_stock' | 'critical';
}

/**
 * Filter parameters for the Transaction History view.
 */
export interface TransactionFilters {
  /** Free-text search matching product name, SKU, or reference code */
  searchQuery: string;
  /** Type filter */
  typeFilter: 'all' | TransactionType;
  /** Optional starting ISO date string (YYYY-MM-DD) */
  dateFrom: string;
  /** Optional ending ISO date string (YYYY-MM-DD) */
  dateTo: string;
}

/**
 * Pagination state descriptor.
 */
export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalCount: number;
}
