/**
 * @file tests/unit/roster-hours.test.ts
 * @description Unit tests for driver & assistant weekly roster hour limit (BR-004 / BR-005).
 *
 * Verifies that:
 * - Week start is accurately mapped to Monday 00:00:00 (matching MySQL fn_week_start).
 * - Shift durations are accurately computed from timestamps.
 * - Weekly accumulations are enforced against the 40.0-hour statutory limit.
 * - Boundary conditions (exactly 40h vs 40.01h) are strictly respected.
 *
 * Follows Docs/03_architecture.md §16 Priority 1.
 */

import { describe, it, expect } from 'vitest';
import {
  getWeekStartMonday,
  calculateShiftDurationHours,
  validateRosterHours,
  MAX_WEEKLY_ROSTER_HOURS,
} from '@/lib/business-rules';

describe('BR-004 & BR-005: Driver & Assistant Weekly Roster Math', () => {
  describe('getWeekStartMonday()', () => {
    it('returns the same day if the input is already Monday', () => {
      // 2026-10-05 is a Monday
      const monday = new Date(2026, 9, 5, 14, 30);
      const weekStart = getWeekStartMonday(monday);
      expect(weekStart.getFullYear()).toBe(2026);
      expect(weekStart.getMonth()).toBe(9);
      expect(weekStart.getDate()).toBe(5);
      expect(weekStart.getHours()).toBe(0);
      expect(weekStart.getMinutes()).toBe(0);
    });

    it('returns the preceding Monday for a mid-week date (e.g. Wednesday)', () => {
      // 2026-10-07 is a Wednesday -> preceding Monday is 2026-10-05
      const wednesday = new Date(2026, 9, 7, 10, 0);
      const weekStart = getWeekStartMonday(wednesday);
      expect(weekStart.getDate()).toBe(5);
    });

    it('returns the preceding Monday for Sunday (the last day of the calendar week)', () => {
      // 2026-10-11 is Sunday -> preceding Monday is 2026-10-05
      const sunday = new Date(2026, 9, 11, 23, 0);
      const weekStart = getWeekStartMonday(sunday);
      expect(weekStart.getDate()).toBe(5);
    });

    it('handles month boundary transitions', () => {
      // 2026-10-01 is a Thursday -> preceding Monday is Sep 28, 2026
      const thursday = new Date(2026, 9, 1);
      const weekStart = getWeekStartMonday(thursday);
      expect(weekStart.getMonth()).toBe(8); // September (0-indexed 8)
      expect(weekStart.getDate()).toBe(28);
    });
  });

  describe('calculateShiftDurationHours()', () => {
    it('calculates integer shift hours accurately', () => {
      const start = '2026-10-05T08:00:00';
      const end = '2026-10-05T16:00:00';
      expect(calculateShiftDurationHours(start, end)).toBe(8.0);
    });

    it('calculates fractional shift hours with 2 decimal precision', () => {
      // 8:00 to 12:30 = 4.5 hours
      const start = '2026-10-05T08:00:00';
      const end = '2026-10-05T12:30:00';
      expect(calculateShiftDurationHours(start, end)).toBe(4.5);
    });

    it('handles shifts spanning across midnight (same week)', () => {
      // 22:00 to 06:00 next day = 8 hours
      const start = '2026-10-05T22:00:00';
      const end = '2026-10-06T06:00:00';
      expect(calculateShiftDurationHours(start, end)).toBe(8.0);
    });

    it('returns 0 if end time is before or equal to start time', () => {
      const start = '2026-10-05T16:00:00';
      const end = '2026-10-05T08:00:00';
      expect(calculateShiftDurationHours(start, end)).toBe(0);
    });
  });

  describe('validateRosterHours() (40-Hour Limit Enforcement)', () => {
    it('allows shifts that keep weekly hours comfortably below 40.0', () => {
      // Currently worked 24h, adding 8h -> 32h
      const result = validateRosterHours(24.0, 8.0);
      expect(result.allowed).toBe(true);
      expect(result.projectedHours).toBe(32.0);
      expect(result.remainingHours).toBe(16.0);
    });

    it('allows shift that brings total to exactly 40.0 hours (boundary condition)', () => {
      // Currently worked 34h, adding 6h -> 40.0h
      const result = validateRosterHours(34.0, 6.0);
      expect(result.allowed).toBe(true);
      expect(result.projectedHours).toBe(40.0);
      expect(result.remainingHours).toBe(6.0);
      expect(result.message).toBeUndefined();
    });

    it('rejects shift that exceeds 40.0 hours by even 0.01 hours', () => {
      // Currently worked 34h, adding 6.01h -> 40.01h
      const result = validateRosterHours(34.0, 6.01);
      expect(result.allowed).toBe(false);
      expect(result.projectedHours).toBe(40.01);
      expect(result.message).toContain('Shift exceeds weekly limit');
    });

    it('rejects adding any shift if driver is already at 40.0 hours', () => {
      const result = validateRosterHours(40.0, 4.0);
      expect(result.allowed).toBe(false);
      expect(result.remainingHours).toBe(0);
    });

    it('uses standard MAX_WEEKLY_ROSTER_HOURS default (40.0)', () => {
      expect(MAX_WEEKLY_ROSTER_HOURS).toBe(40.0);
    });
  });
});
