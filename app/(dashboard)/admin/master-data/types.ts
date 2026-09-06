/**
 * @file types.ts
 * @description Type definitions for the /admin/master-data module.
 * Defines interfaces for reference data entities (Products, Routes, Cities, Employees, Customers),
 * dynamic statistics, filter states, pagination, and modal creation payloads.
 * Conforms to Docs/04_database-schema-v4.md and Docs/05_api-and-pages.md §384.
 */

/**
 * Identifier union representing active sub-tab sections within the Master Data screen.
 */
export type MasterDataTab = 'products' | 'routes' | 'cities' | 'employees' | 'customers';

/**
 * Product catalog item conforming to the `products` table schema.
 */
export interface ProductItem {
  /** Unique primary key identifier */
  product_id: number;
  /** Stock Keeping Unit code (unique) */
  sku: string;
  /** Name of the commercial product */
  product_name: string;
  /** High-level product category (e.g., 'Food', 'Household', 'Personal Care') */
  category: string;
  /** Packaging unit identifier (e.g., 'box', 'bottle', 'pack', 'crate') */
  unit_of_measure: string;
  /** Unit price in LKR */
  unit_price: number;
  /** Cargo space consumption rate in cubic meters (m³) or standardized space units */
  space_rate: number;
  /** Operational status badge state */
  status: 'Active' | 'Low Stock' | 'Inactive';
  /** Creation timestamp */
  created_at?: string;
  /** Last update timestamp */
  updated_at?: string;
}

/**
 * Coverage area assignment for a specific delivery route.
 */
export interface RouteCoverageArea {
  /** Primary identifier for coverage record */
  coverage_id: number;
  /** Associated route ID */
  route_id: number;
  /** Target city ID */
  city_id: number;
  /** City name for display */
  city_name: string;
  /** Specific municipal or suburb area name covered */
  area_name: string;
}

/**
 * Route entity conforming to the `routes` table schema.
 */
export interface RouteItem {
  /** Unique route ID */
  route_id: number;
  /** ID of the store station this route originates from */
  store_id: number;
  /** Human-readable store station name */
  store_name: string;
  /** Display name of the route (e.g., 'Colombo North Route') */
  route_name: string;
  /** Optional descriptive note regarding coverage boundary */
  coverage_description?: string;
  /** Maximum turnaround/delivery time in hours */
  max_delivery_time_hours: number;
  /** Array of specific sub-areas covered by this route */
  coverage_areas: RouteCoverageArea[];
  /** Operational route status */
  status: 'Active' | 'Inactive';
  /** Creation timestamp */
  created_at?: string;
}

/**
 * City entity conforming to the `cities` table schema (Read-only master reference).
 */
export interface CityItem {
  /** Unique city ID */
  city_id: number;
  /** Name of the Sri Lankan city */
  city_name: string;
  /** Whether the city is an origin hub (Kandy) */
  is_origin: boolean;
  /** Whether the city is a destination store terminal */
  is_destination: boolean;
  /** Name of the station store located in this city if applicable */
  store_name?: string;
  /** Operational status */
  status: 'Active' | 'Inactive';
  /** Creation timestamp */
  created_at?: string;
}

/**
 * Valid employee roles matching the check constraint in Docs/04_database-schema-v4.md §2.3.
 */
export type EmployeeRole =
  | 'system_administrator'
  | 'logistics_manager'
  | 'order_entry_clerk'
  | 'store_manager'
  | 'fleet_supervisor'
  | 'driver'
  | 'assistant';

/**
 * Employee record conforming to the `employees` table schema.
 */
export interface EmployeeItem {
  /** Unique employee ID */
  employee_id: number;
  /** Full legal name of the employee */
  full_name: string;
  /** National Identity Card (NIC) number */
  nic_number: string;
  /** Contact phone number */
  phone: string;
  /** Corporate or contact email address (optional) */
  email?: string;
  /** Formal business role */
  employee_type: EmployeeRole;
  /** Formatted role display label */
  employee_type_label: string;
  /** Assigned store station ID (null for corporate central roles) */
  home_store_id?: number | null;
  /** Assigned store station name */
  home_store_name?: string;
  /** Driver license number if employee_type is 'driver' */
  license_number?: string;
  /** Driver license expiry date (YYYY-MM-DD) if applicable */
  license_expiry?: string;
  /** Employment status */
  status: 'Active' | 'On Leave' | 'Inactive';
  /** Date hired */
  hire_date?: string;
}

/**
 * Customer account conforming to the `customers` table schema.
 */
export interface CustomerItem {
  /** Unique customer ID */
  customer_id: number;
  /** Individual or business customer name */
  customer_name: string;
  /** Customer category */
  customer_type: 'retail' | 'wholesale';
  /** Primary contact phone */
  phone: string;
  /** Email address (optional) */
  email?: string;
  /** Registered destination city ID */
  registered_city_id: number;
  /** Registered destination city name */
  registered_city_name: string;
  /** Physical delivery street address */
  address_line: string;
  /** Account status */
  status: 'Active' | 'Inactive';
  /** Account creation timestamp */
  created_at?: string;
}

/**
 * Single KPI metric displayed in the dynamic 3-card bento banner above the active tab table.
 */
export interface MasterDataStatItem {
  /** Metric label (uppercase label-caps) */
  title: string;
  /** Main stat value */
  value: string | number;
  /** Optional secondary subtitle or detail */
  subtitle?: string;
  /** Visual theme for the icon badge */
  theme: 'purple' | 'green' | 'blue' | 'amber';
  /** Semantic Material Symbol icon identifier */
  icon: string;
}

/**
 * Set of 3 stats corresponding to an active tab.
 */
export interface TabStatsConfig {
  /** Stat card 1 configuration */
  stat1: MasterDataStatItem;
  /** Stat card 2 configuration */
  stat2: MasterDataStatItem;
  /** Stat card 3 configuration */
  stat3: MasterDataStatItem;
}

/**
 * Pagination state interface.
 */
export interface PaginationState {
  /** Current active 1-indexed page number */
  currentPage: number;
  /** Total number of items per page */
  pageSize: number;
  /** Total count of matching records */
  totalCount: number;
}

/**
 * Payload interface for adding a new product.
 */
export interface NewProductPayload {
  sku: string;
  product_name: string;
  category: string;
  unit_of_measure: string;
  unit_price: number;
  space_rate: number;
}

/**
 * Payload interface for adding a new route.
 */
export interface NewRoutePayload {
  route_name: string;
  store_id: number;
  max_delivery_time_hours: number;
  coverage_description?: string;
  coverage_areas: Array<{ city_id: number; area_name: string }>;
}

/**
 * Payload interface for adding a new employee.
 */
export interface NewEmployeePayload {
  full_name: string;
  nic_number: string;
  phone: string;
  email?: string;
  employee_type: EmployeeRole;
  home_store_id?: number | null;
  license_number?: string;
  license_expiry?: string;
}

/**
 * Payload interface for adding a new customer.
 */
export interface NewCustomerPayload {
  customer_name: string;
  customer_type: 'retail' | 'wholesale';
  phone: string;
  email?: string;
  registered_city_id: number;
  address_line: string;
}
