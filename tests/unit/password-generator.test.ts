/**
 * @file tests/unit/password-generator.test.ts
 * @description Unit tests for cryptographically secure temporary password generation.
 *
 * Verifies:
 * - Web Crypto API randomness and unbiased Fisher–Yates shuffling
 * - Required password complexity (uppercase, lowercase, digits, special characters)
 * - Minimum length enforcement (>= 8 characters, default 12)
 * - Exclusion of ambiguous characters ('I', 'O', 'l', '0', '1')
 * - Entropy / uniqueness across repeated generations
 * - Bounds handling for getSecureRandomInt and secureShuffle
 */

import { describe, it, expect } from 'vitest';
import {
  generateSecureTemporaryPassword,
  getSecureRandomInt,
  secureShuffle,
  PASSWORD_CHARSETS,
  DEFAULT_PASSWORD_LENGTH,
} from '@/lib/password';

describe('lib/password: Cryptographically Secure Password Generator', () => {
  describe('generateSecureTemporaryPassword', () => {
    it('generates a password of default length 12', () => {
      const password = generateSecureTemporaryPassword();
      expect(password).toHaveLength(DEFAULT_PASSWORD_LENGTH);
      expect(typeof password).toBe('string');
    });

    it('generates a password of custom specified length (>= 8)', () => {
      const length16 = generateSecureTemporaryPassword(16);
      expect(length16).toHaveLength(16);

      const length24 = generateSecureTemporaryPassword(24);
      expect(length24).toHaveLength(24);
    });

    it('throws an error if requested length is less than 8 characters', () => {
      expect(() => generateSecureTemporaryPassword(7)).toThrow(
        'Temporary password must be at least 8 characters long.'
      );
      expect(() => generateSecureTemporaryPassword(0)).toThrow(
        'Temporary password must be at least 8 characters long.'
      );
      expect(() => generateSecureTemporaryPassword(-5)).toThrow(
        'Temporary password must be at least 8 characters long.'
      );
    });

    it('satisfies all complexity requirements: uppercase, lowercase, digit, and special char', () => {
      // Test over 50 iterations to ensure guarantee holds consistently
      for (let i = 0; i < 50; i++) {
        const password = generateSecureTemporaryPassword();

        const hasUpper = [...password].some((char) => PASSWORD_CHARSETS.UPPER.includes(char));
        const hasLower = [...password].some((char) => PASSWORD_CHARSETS.LOWER.includes(char));
        const hasDigit = [...password].some((char) => PASSWORD_CHARSETS.DIGITS.includes(char));
        const hasSpecial = [...password].some((char) => PASSWORD_CHARSETS.SPECIAL.includes(char));

        expect(hasUpper).toBe(true);
        expect(hasLower).toBe(true);
        expect(hasDigit).toBe(true);
        expect(hasSpecial).toBe(true);
      }
    });

    it('contains ONLY characters from the approved unambiguous character pools', () => {
      const allowedPool =
        PASSWORD_CHARSETS.UPPER +
        PASSWORD_CHARSETS.LOWER +
        PASSWORD_CHARSETS.DIGITS +
        PASSWORD_CHARSETS.SPECIAL;

      for (let i = 0; i < 50; i++) {
        const password = generateSecureTemporaryPassword();
        for (const char of password) {
          expect(allowedPool.includes(char)).toBe(true);
        }

        // Verify ambiguous characters are excluded
        expect(password).not.toContain('I');
        expect(password).not.toContain('O');
        expect(password).not.toContain('l');
        expect(password).not.toContain('0');
        expect(password).not.toContain('1');
      }
    });

    it('produces unique passwords across consecutive invocations (high entropy)', () => {
      const samples = 100;
      const generated = new Set<string>();

      for (let i = 0; i < samples; i++) {
        generated.add(generateSecureTemporaryPassword());
      }

      // All 100 randomly generated passwords must be distinct
      expect(generated.size).toBe(samples);
    });
  });

  describe('getSecureRandomInt', () => {
    it('returns integers within [0, maxExclusive)', () => {
      const max = 10;
      for (let i = 0; i < 100; i++) {
        const val = getSecureRandomInt(max);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(max);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('returns 0 when maxExclusive is 1', () => {
      expect(getSecureRandomInt(1)).toBe(0);
    });

    it('throws if maxExclusive <= 0', () => {
      expect(() => getSecureRandomInt(0)).toThrow('maxExclusive must be greater than 0.');
      expect(() => getSecureRandomInt(-1)).toThrow('maxExclusive must be greater than 0.');
    });
  });

  describe('secureShuffle', () => {
    it('preserves all original elements in the array (multiset equality)', () => {
      const original = ['A', 'b', '3', '!', 'X', 'y', '7', '@'];
      const copy = [...original];
      const shuffled = secureShuffle(copy);

      expect(shuffled).toHaveLength(original.length);
      expect([...shuffled].sort()).toEqual([...original].sort());
    });

    it('handles empty and single-element arrays gracefully', () => {
      expect(secureShuffle([])).toEqual([]);
      expect(secureShuffle(['single'])).toEqual(['single']);
    });

    it('changes the element ordering over multiple trials', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let didPermute = false;

      // With 10 elements, the probability of returning the exact identical order is 1 / 10! ≈ 2.7e-7
      for (let trial = 0; trial < 10; trial++) {
        const shuffled = secureShuffle([...original]);
        if (shuffled.some((val, idx) => val !== original[idx])) {
          didPermute = true;
          break;
        }
      }

      expect(didPermute).toBe(true);
    });
  });
});
