/**
 * @file lib/business-rules.ts
 * @description Core business logic and calculation helpers for Kandypack.
 *
 * Implements pure functions corresponding to system business rules:
 * - BR-001: 7-day minimum advance order lead time.
 * - BR-003: Cargo space calculation and train capacity enforcement.
 * - BR-004 / BR-005: Driver and assistant weekly roster hour limit (40 hours max per week, Mon–Sun).
 *
 * Owned by Member 5 (Desandu). Follows Docs/03_architecture.md §16.
 */

// =========================================================================
// 1. Constants
// =========================================================================

/** Minimum advance order lead time in calendar days (BR-001) */
export const MIN_ORDER_LEAD_DAYS = 7;

/** Maximum allowable working hours per week for drivers & assistants (BR-004) */
export const MAX_WEEKLY_ROSTER_HOURS = 40.0;

/** Default cargo space capacity for a single train trip in units */
export const DEFAULT_TRAIN_CAPACITY = 500.0;

/** Maximum consecutive work days allowed before a mandatory rest day */
export const MAX_CONSECUTIVE_WORK_DAYS = 6;

// =========================================================================
// 2. 7-Day Lead-Time Validation (BR-001)
// =========================================================================

/**
 * Result of a lead-time validation check.
 */
export interface LeadTimeValidationResult {
  /** True if the delivery date meets or exceeds the required lead time */
  valid: boolean;
  /** Calendar days difference between order placement date and expected delivery */
  daysDifference: number;
  /** User-friendly error message if invalid, matching Docs/07_content-copy.md */
  message?: string;
}

/**
 * Validates whether an expected delivery date satisfies the 7-day advance notice rule.
 *
 * Compares whole calendar days between the order placement date and expected delivery date.
 * Both dates can be provided as `Date` objects or `YYYY-MM-DD` strings.
 *
 * @param {Date | string} orderDate - Date the order is submitted
 * @param {Date | string} expectedDeliveryDate - Target delivery date requested by customer
 * @param {number} [minLeadDays=MIN_ORDER_LEAD_DAYS] - Minimum required lead days (default: 7)
 * @returns {LeadTimeValidationResult} Validation result including day difference and message
 */
export function validateLeadTime(
  orderDate: Date | string,
  expectedDeliveryDate: Date | string,
  minLeadDays: number = MIN_ORDER_LEAD_DAYS
): LeadTimeValidationResult {
  // Parse order date to calendar day boundaries (midnight)
  const oDate = typeof orderDate === 'string'
    ? parseDateParts(orderDate)
    : new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());

  // Parse expected delivery date to calendar day boundaries (midnight)
  const dDate = typeof expectedDeliveryDate === 'string'
    ? parseDateParts(expectedDeliveryDate)
    : new Date(expectedDeliveryDate.getFullYear(), expectedDeliveryDate.getMonth(), expectedDeliveryDate.getDate());

  if (isNaN(oDate.getTime()) || isNaN(dDate.getTime())) {
    return {
      valid: false,
      daysDifference: 0,
      message: 'Invalid date format provided.',
    };
  }

  // Calculate whole calendar day difference
  const diffMs = dDate.getTime() - oDate.getTime();
  const daysDifference = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const valid = daysDifference >= minLeadDays;

  return {
    valid,
    daysDifference,
    ...(valid ? {} : { message: `Delivery date must be at least ${minLeadDays} days from today.` }),
  };
}

/**
 * Parses a YYYY-MM-DD string into a local Date at midnight.
 *
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} Parsed date at local midnight
 */
function parseDateParts(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return new Date(NaN);
  const [year, month, day] = parts.map(Number);
  return new Date(year, month - 1, day);
}

// =========================================================================
// 3. Train Space & Capacity Calculations (BR-003)
// =========================================================================

/**
 * Line item input for cargo space calculations.
 */
export interface SpaceCalcItem {
  /** Quantity of product units */
  quantity: number;
  /** Space rate per unit (cubic capacity rate) */
  spaceRate: number;
}

/**
 * Computes the total cargo space required for a set of order items.
 *
 * Space formula: sum(quantity * space_rate), rounded to 2 decimal places
 * to match MySQL's `DECIMAL(10,2)` behavior in `calculate_order_space`.
 *
 * @param {SpaceCalcItem[]} items - Array of items with quantity and space rate
 * @returns {number} Total space required, rounded to 2 decimal places
 */
export function calculateOrderSpace(items: SpaceCalcItem[]): number {
  if (!items || items.length === 0) return 0;

  const total = items.reduce((sum, item) => {
    const qty = Math.max(0, item.quantity);
    const rate = Math.max(0, item.spaceRate);
    return sum + (qty * rate);
  }, 0);

  // Round to 2 decimal places (equivalent to MySQL DECIMAL(10,2))
  return Math.round(total * 100) / 100;
}

/**
 * Checks whether an order's required space fits within a train trip's remaining capacity.
 *
 * @param {number} totalCapacity - Total trip capacity (e.g. 500.00 units)
 * @param {number} currentlyBookedSpace - Space already allocated on this trip
 * @param {number} requiredSpace - Space needed by the new order
 * @returns {{ fits: boolean; availableSpace: number; overflowSpace: number }}
 */
export function checkTripCapacity(
  totalCapacity: number,
  currentlyBookedSpace: number,
  requiredSpace: number
): { fits: boolean; availableSpace: number; overflowSpace: number } {
  const availableSpace = Math.max(0, Math.round((totalCapacity - currentlyBookedSpace) * 100) / 100);
  const roundedRequired = Math.round(requiredSpace * 100) / 100;

  if (roundedRequired <= availableSpace) {
    return {
      fits: true,
      availableSpace,
      overflowSpace: 0,
    };
  }

  return {
    fits: false,
    availableSpace,
    overflowSpace: Math.round((roundedRequired - availableSpace) * 100) / 100,
  };
}

// =========================================================================
// 4. Roster Hours & Calendar Week Math (BR-004 & BR-005)
// =========================================================================

/**
 * Computes the start of the calendar week (Monday at 00:00:00) for a given date.
 *
 * Replicates the logic of MySQL's `fn_week_start(p_ts)` function from migration 10:
 * Monday is day 0 of the week, Sunday is day 6.
 *
 * @param {Date | string} date - Target timestamp
 * @returns {Date} Start of the week (Monday 00:00:00)
 */
export function getWeekStartMonday(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date.getTime());
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  // Distance to previous Monday: if Sunday (0), go back 6 days; otherwise go back (day - 1) days
  const diffDays = day === 0 ? 6 : day - 1;

  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffDays, 0, 0, 0, 0);
  return monday;
}

/**
 * Calculates duration in decimal hours between start and end timestamps.
 *
 * @param {Date | string} startTime - Shift start time
 * @param {Date | string} endTime - Shift end time
 * @returns {number} Duration in decimal hours, rounded to 2 decimal places
 */
export function calculateShiftDurationHours(
  startTime: Date | string,
  endTime: Date | string
): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (isNaN(start) || isNaN(end) || end <= start) {
    return 0;
  }

  const durationHours = (end - start) / (1000 * 60 * 60);
  return Math.round(durationHours * 100) / 100;
}

/**
 * Validates whether adding a new shift would violate the 40-hour weekly roster limit.
 *
 * @param {number} currentWeeklyHours - Accumulated hours worked in the target week
 * @param {number} newShiftHours - Duration of the planned new shift in hours
 * @param {number} [maxHours=MAX_WEEKLY_ROSTER_HOURS] - Weekly hour threshold (default: 40.0)
 * @returns {{ allowed: boolean; projectedHours: number; remainingHours: number; message?: string }}
 */
export function validateRosterHours(
  currentWeeklyHours: number,
  newShiftHours: number,
  maxHours: number = MAX_WEEKLY_ROSTER_HOURS
): {
  allowed: boolean;
  projectedHours: number;
  remainingHours: number;
  message?: string;
} {
  const current = Math.round(currentWeeklyHours * 100) / 100;
  const additional = Math.round(newShiftHours * 100) / 100;
  const projectedHours = Math.round((current + additional) * 100) / 100;
  const remainingHours = Math.max(0, Math.round((maxHours - current) * 100) / 100);

  const allowed = projectedHours <= maxHours;

  return {
    allowed,
    projectedHours,
    remainingHours,
    ...(allowed
      ? {}
      : {
          message: `Shift exceeds weekly limit. Current: ${current}h, New: ${additional}h, Max: ${maxHours}h.`,
        }),
  };
}
