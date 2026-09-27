/**
 * @file tests/unit/space-calculation.test.ts
 * @description Unit tests for cargo space calculations and train capacity limits (BR-003).
 *
 * Verifies that:
 * - Order space equals sum(quantity * space_rate), rounded to 2 decimal places.
 * - Train trip capacity checks correctly identify available vs overflow space.
 * - Overflow space conservation holds true (split items sum to total required space).
 *
 * Follows Docs/03_architecture.md §16 Priority 1.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOrderSpace,
  checkTripCapacity,
  DEFAULT_TRAIN_CAPACITY,
} from '@/lib/business-rules';

describe('BR-003: Cargo Space & Train Capacity Calculations', () => {
  describe('calculateOrderSpace()', () => {
    it('returns 0 for empty items array', () => {
      expect(calculateOrderSpace([])).toBe(0);
    });

    it('calculates space for a single item correctly', () => {
      // 10 units at 1.50 space rate = 15.00 units
      const items = [{ quantity: 10, spaceRate: 1.5 }];
      expect(calculateOrderSpace(items)).toBe(15.0);
    });

    it('aggregates multiple items with different space rates', () => {
      // Item 1: 5 * 0.75 = 3.75
      // Item 2: 10 * 1.20 = 12.00
      // Item 3: 20 * 0.50 = 10.00
      // Total: 25.75
      const items = [
        { quantity: 5, spaceRate: 0.75 },
        { quantity: 10, spaceRate: 1.2 },
        { quantity: 20, spaceRate: 0.5 },
      ];
      expect(calculateOrderSpace(items)).toBe(25.75);
    });

    it('rounds floating point totals to 2 decimal places (DECIMAL(10,2) alignment)', () => {
      // 3 items * 0.333 space rate = 0.999 -> rounds to 1.00
      const items = [{ quantity: 3, spaceRate: 0.333 }];
      expect(calculateOrderSpace(items)).toBe(1.0);
    });

    it('handles fractional quantities or space rates cleanly', () => {
      // 7 * 0.125 = 0.875 -> rounds to 0.88
      const items = [{ quantity: 7, spaceRate: 0.125 }];
      expect(calculateOrderSpace(items)).toBe(0.88);
    });

    it('ignores negative quantities or space rates defensively', () => {
      const items = [
        { quantity: -5, spaceRate: 1.5 },
        { quantity: 10, spaceRate: -2.0 },
        { quantity: 4, spaceRate: 2.0 },
      ];
      // Only the valid positive item should contribute: 4 * 2.0 = 8.00
      expect(calculateOrderSpace(items)).toBe(8.0);
    });
  });

  describe('checkTripCapacity() & Overflow Logic', () => {
    const totalCapacity = DEFAULT_TRAIN_CAPACITY; // 500.00

    it('confirms order fits when total required space is less than available', () => {
      // 400 booked, 100 available. Order requires 80.
      const result = checkTripCapacity(totalCapacity, 400, 80);
      expect(result.fits).toBe(true);
      expect(result.availableSpace).toBe(100);
      expect(result.overflowSpace).toBe(0);
    });

    it('confirms exact fit at 100% capacity boundary', () => {
      // 450 booked, 50 available. Order requires exactly 50.
      const result = checkTripCapacity(totalCapacity, 450, 50);
      expect(result.fits).toBe(true);
      expect(result.availableSpace).toBe(50);
      expect(result.overflowSpace).toBe(0);
    });

    it('flags overflow when required space exceeds available by even 0.01 units', () => {
      // 450 booked, 50 available. Order requires 50.01.
      const result = checkTripCapacity(totalCapacity, 450, 50.01);
      expect(result.fits).toBe(false);
      expect(result.availableSpace).toBe(50);
      expect(result.overflowSpace).toBe(0.01);
    });

    it('accurately calculates overflow for large orders (Order #46 simulation)', () => {
      // Simulating seed test scenario: Trip 5 has 50.0 units capacity, 0.5 already booked -> 49.50 available.
      // Order requires 120.00 units.
      const tripCapacity = 50.0;
      const currentlyBooked = 0.5;
      const requiredSpace = 120.0;

      const result = checkTripCapacity(tripCapacity, currentlyBooked, requiredSpace);
      expect(result.fits).toBe(false);
      expect(result.availableSpace).toBe(49.5);
      expect(result.overflowSpace).toBe(70.5);

      // Conservation of space: allocated on trip 1 (49.5) + overflow to trip 2 (70.5) = 120.0
      expect(result.availableSpace + result.overflowSpace).toBe(requiredSpace);
    });

    it('handles completely full trips (0 available space)', () => {
      const result = checkTripCapacity(500, 500, 25);
      expect(result.fits).toBe(false);
      expect(result.availableSpace).toBe(0);
      expect(result.overflowSpace).toBe(25);
    });
  });
});
