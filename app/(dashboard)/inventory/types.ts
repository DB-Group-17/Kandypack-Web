/**
 * @file types.ts
 * @description TypeScript type definitions and interfaces for the Store Inventory module (/inventory).
 * Covers stores, stock items, inventory transactions, receive goods workflows, API payloads, filters, and pagination.
 */

/**
 * Represents a physical warehouse/station store entity in the system.
 * Aligns with Docs/04_database-schema-v4.md table `stores` and GET /api/stores.
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
  /** Optional railway station name */
  railway_station_name?: string;
  /** Optional store contact telephone number */
  contact_phone?: string;
}

/**
 * Health status classification for product stock quantities.
 */
export type StockStatus = 'healthy' | 'low_stock' | 'critical';

/**
 * Represents an individual product line's stock level at a specific store.
 * Aligns with Docs/04_database-schema-v4.md table `store_inventory` and GET /api/stores/:id/inventory.
 */
export interface StockItem {
  /** Primary key of the product */
  product_id: number;
  /** Human-readable product name */
  product_name: string;
  /** Unique Stock Keeping Unit code (e.g., 'KP-FD-001') */
  sku: string;
  /** Product category grouping */
  category?: string;
  /** Unit of measurement (e.g., 'box', 'bottle', 'pack') */
  unit_of_measure?: string;
  /** Current quantity on hand at the active store */
  quantity_on_hand: number;
  /** Minimum threshold before a low-stock alert triggers */
  threshold?: number;
  /** Formatted timestamp or ISO string of the last stock change */
  updated_at: string;
  /** Calculated health status of the stock (optional when authoritative threshold is available) */
  status?: StockStatus;
}

/**
 * Permissible transaction types for inventory ledger entries.
 * Aligns with DB enum ('receive', 'dispatch', 'adjustment').
 */
export type TransactionType = 'receive' | 'dispatch' | 'adjustment';

/**
 * Represents an immutable inventory movement ledger record.
 * Aligns with Docs/04_database-schema-v4.md table `inventory_transactions` and GET /api/inventory/transactions.
 */
export interface InventoryTransaction {
  /** Unique primary key for the transaction */
  transaction_id: number;
  /** ID of the store where the transaction occurred */
  store_id: number;
  /** Name of the store for display */
  store_name?: string;
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
  /** Linked train booking ID foreign key (set for 'receive' records) */
  train_booking_id?: number | null;
  /** Linked delivery ID foreign key (set for 'dispatch' records) */
  delivery_id?: number | null;
  /** Reference document / trip / delivery code (e.g., 'TB-102', 'DEL-401') */
  reference_code: string;
  /** Date and time when the transaction was committed (ISO or formatted) */
  created_at: string;
}

/**
 * Raw item shape returned by GET /api/stores/:id/inventory.
 */
export interface ApiStoreInventoryItem {
  product_id: number;
  product_name: string;
  quantity_on_hand: number;
  updated_at: string;
}

/**
 * Response payload contract for GET /api/stores/:id/inventory.
 */
export interface ApiStoreInventoryResponse {
  items: ApiStoreInventoryItem[];
}

/**
 * Raw item shape returned by GET /api/inventory/transactions.
 */
export interface ApiInventoryTransactionItem {
  transaction_id: number;
  store_id: number;
  product_id: number;
  change_qty: number;
  transaction_type: TransactionType;
  train_booking_id: number | null;
  delivery_id: number | null;
  created_at: string;
}

/**
 * Response payload contract for GET /api/inventory/transactions.
 */
export interface ApiInventoryTransactionsResponse {
  items: ApiInventoryTransactionItem[];
}

/**
 * Response payload contract for POST /api/stores/:id/receive-goods.
 */
export interface ApiReceiveGoodsResponse {
  updated_products: number;
}

/**
 * Product catalog item metadata retrieved from GET /api/products.
 */
export interface ProductCatalogItem {
  product_id: number;
  sku: string;
  product_name: string;
  category?: string;
  unit_of_measure?: string;
  unit_price: number;
  space_rate: number;
}

/**
 * Item specification for a train booking ready for goods receipt.
 */
export interface TrainBookingItem {
  booking_item_id?: number;
  product_id: number;
  product_name: string;
  sku: string;
  expected_quantity: number;
}

/**
 * Represents an arrived train trip booking available for receiving at the store.
 */
export interface ArrivedTrainBooking {
  booking_id: number;
  train_booking_id?: number;
  trip_id?: number;
  order_id?: number;
  trip_code?: string;
  origin_city?: string;
  destination_city?: string;
  arrival_datetime: string;
  items: TrainBookingItem[];
}

/**
 * API response contract for GET /api/stores/:id/arrived-bookings.
 */
export interface ApiArrivedBookingsResponse {
  items: ArrivedTrainBooking[];
}

/**
 * Form line-item for the Receive Goods modal (legacy / UI compatibility).
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
