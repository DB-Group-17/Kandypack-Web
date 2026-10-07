/**
 * @file lib/password.ts
 * @description Cryptographically secure temporary password generation and utilities.
 *
 * Implements cryptographically secure randomness via the Web Crypto API
 * (crypto.getRandomValues()) and an unbiased Fisher–Yates shuffle algorithm.
 *
 * Conforms to:
 * - Docs/05_api-and-pages.md §A10 (POST /api/users temporary password generation)
 * - Docs/07_content-copy.md §/admin/users
 * - PR Review Fix #5: secure temporary password generation without Math.random() or biased sorting.
 */

/**
 * Character sets used for temporary password generation.
 * Ambiguous characters (such as uppercase 'I', 'O', lowercase 'l', digits '0', '1')
 * are excluded to minimize human transcription errors when copying/pasting.
 */
export const PASSWORD_CHARSETS = {
  UPPER: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  LOWER: 'abcdefghijkmnopqrstuvwxyz',
  DIGITS: '23456789',
  SPECIAL: '!@#$%&*',
} as const;

/** Default temporary password length */
export const DEFAULT_PASSWORD_LENGTH = 12;

/**
 * Retrieves the Web Crypto API instance available in the current environment
 * (browser window.crypto or Node.js globalThis.crypto).
 *
 * @throws {Error} If no cryptographically secure random number generator is available.
 * @returns {Crypto} The platform Crypto instance.
 */
function getCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API (crypto.getRandomValues) is not available in the current environment.');
}

/**
 * Generates a cryptographically secure uniform random integer in the range [0, maxExclusive).
 *
 * Uses rejection sampling with a 32-bit unsigned integer to completely eliminate
 * modulo bias when maxExclusive is not a power of two.
 *
 * @param maxExclusive - Upper bound (exclusive). Must be a positive integer > 0.
 * @returns A cryptographically secure random integer in [0, maxExclusive).
 * @throws {Error} If maxExclusive is less than or equal to 0.
 */
export function getSecureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) {
    throw new Error('maxExclusive must be greater than 0.');
  }
  if (maxExclusive === 1) {
    return 0;
  }

  const cryptoInstance = getCrypto();
  const buffer = new Uint32Array(1);
  const range = 0x100000000; // 2^32
  // Rejection sampling limit: the largest multiple of maxExclusive <= 2^32
  const limit = range - (range % maxExclusive);

  let randomValue: number;
  do {
    cryptoInstance.getRandomValues(buffer);
    randomValue = buffer[0];
  } while (randomValue >= limit);

  return randomValue % maxExclusive;
}

/**
 * Shuffles an array in place using the Fisher–Yates (Knuth) algorithm
 * with cryptographically secure random indices.
 *
 * @template T
 * @param array - The array to shuffle in place.
 * @returns The same array reference, now randomly shuffled.
 */
export function secureShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    // Pick an unbiased random index j in [0, i] (inclusive)
    const j = getSecureRandomInt(i + 1);
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

/**
 * Generates a cryptographically secure temporary password.
 *
 * Guarantees that at least one character from each character category
 * (uppercase, lowercase, digit, special character) is included, fills the
 * remaining characters uniformly from the combined character pool, and
 * performs an unbiased Fisher–Yates shuffle.
 *
 * @param length - Desired password length. Defaults to DEFAULT_PASSWORD_LENGTH (12).
 *                 Must be at least 8 characters to meet backend validation rules.
 * @returns A 12-character (or specified length) cryptographically secure password string.
 * @throws {Error} If length is less than 8 characters.
 */
export function generateSecureTemporaryPassword(length: number = DEFAULT_PASSWORD_LENGTH): string {
  if (length < 8) {
    throw new Error('Temporary password must be at least 8 characters long.');
  }

  // Guarantee at least one character from each required category
  const chars: string[] = [
    PASSWORD_CHARSETS.UPPER[getSecureRandomInt(PASSWORD_CHARSETS.UPPER.length)],
    PASSWORD_CHARSETS.LOWER[getSecureRandomInt(PASSWORD_CHARSETS.LOWER.length)],
    PASSWORD_CHARSETS.DIGITS[getSecureRandomInt(PASSWORD_CHARSETS.DIGITS.length)],
    PASSWORD_CHARSETS.SPECIAL[getSecureRandomInt(PASSWORD_CHARSETS.SPECIAL.length)],
  ];

  const allChars =
    PASSWORD_CHARSETS.UPPER +
    PASSWORD_CHARSETS.LOWER +
    PASSWORD_CHARSETS.DIGITS +
    PASSWORD_CHARSETS.SPECIAL;

  // Fill remaining characters from the combined pool
  for (let i = chars.length; i < length; i++) {
    chars.push(allChars[getSecureRandomInt(allChars.length)]);
  }

  // Unbiased Fisher–Yates shuffle
  return secureShuffle(chars).join('');
}
