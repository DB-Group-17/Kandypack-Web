/**
 * @file tests/unit/lead-time.test.ts
 * @description Unit tests for the 7-day minimum advance order lead time rule (BR-001).
 *
 * Verifies that orders cannot be scheduled earlier than 7 full calendar days
 * from the placement date, testing exact boundaries, past dates, month roll-overs,
 * and string/Date format compatibility.
 *
 * Follows Docs/03_architecture.md §16 Priority 1.
 */

import { describe, it, expect } from 'vitest';
import { validateLeadTime, MIN_ORDER_LEAD_DAYS } from '@/lib/business-rules';

describe('BR-001: 7-Day Advance Order Lead Time Rule', () => {
  const baseOrderDate = '2026-10-01'; // Oct 1, 2026

  it('allows orders placed exactly 7 calendar days in advance (boundary condition)', () => {
    // 2026-10-01 + 7 days = 2026-10-08
    const result = validateLeadTime(baseOrderDate, '2026-10-08');
    expect(result.valid).toBe(true);
    expect(result.daysDifference).toBe(7);
    expect(result.message).toBeUndefined();
  });

  it('allows orders placed more than 7 days in advance', () => {
    // 14 days in advance
    const result = validateLeadTime(baseOrderDate, '2026-10-15');
    expect(result.valid).toBe(true);
    expect(result.daysDifference).toBe(14);
    expect(result.message).toBeUndefined();
  });

  it('rejects orders placed 6 calendar days in advance (1 day short boundary)', () => {
    // 2026-10-01 + 6 days = 2026-10-07
    const result = validateLeadTime(baseOrderDate, '2026-10-07');
    expect(result.valid).toBe(false);
    expect(result.daysDifference).toBe(6);
    expect(result.message).toBe('Delivery date must be at least 7 days from today.');
  });

  it('rejects same-day delivery requests (0 days lead time)', () => {
    const result = validateLeadTime(baseOrderDate, baseOrderDate);
    expect(result.valid).toBe(false);
    expect(result.daysDifference).toBe(0);
    expect(result.message).toBe('Delivery date must be at least 7 days from today.');
  });

  it('rejects past delivery dates (negative lead time)', () => {
    const result = validateLeadTime('2026-10-10', '2026-10-05');
    expect(result.valid).toBe(false);
    expect(result.daysDifference).toBe(-5);
  });

  it('handles month roll-overs correctly (e.g. end of January to February)', () => {
    // Jan 28, 2026 + 7 days = Feb 4, 2026
    const validResult = validateLeadTime('2026-01-28', '2026-02-04');
    expect(validResult.valid).toBe(true);
    expect(validResult.daysDifference).toBe(7);

    // Jan 28, 2026 + 6 days = Feb 3, 2026
    const invalidResult = validateLeadTime('2026-01-28', '2026-02-03');
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.daysDifference).toBe(6);
  });

  it('handles year-end roll-overs correctly (e.g. December to January)', () => {
    // Dec 28, 2026 + 7 days = Jan 04, 2027
    const result = validateLeadTime('2026-12-28', '2027-01-04');
    expect(result.valid).toBe(true);
    expect(result.daysDifference).toBe(7);
  });

  it('works with native Date objects as well as string dates', () => {
    const orderDate = new Date(2026, 9, 1); // 2026-10-01
    const deliveryDate = new Date(2026, 9, 8); // 2026-10-08 (+7 days)
    const result = validateLeadTime(orderDate, deliveryDate);
    expect(result.valid).toBe(true);
    expect(result.daysDifference).toBe(7);
  });

  it('gracefully rejects invalid date formats', () => {
    const result = validateLeadTime('not-a-date', '2026-10-08');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Invalid date format');
  });

  it('defaults to MIN_ORDER_LEAD_DAYS constant (7)', () => {
    expect(MIN_ORDER_LEAD_DAYS).toBe(7);
  });
});
