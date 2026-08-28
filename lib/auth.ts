/**
 * @file lib/auth.ts
 * @description Central authentication helper for Kandypack.
 * 
 * Features:
 * - Password hashing and verification with bcryptjs (cost factor: 12).
 * - JWT signing and verification with jsonwebtoken and process.env.JWT_SECRET.
 * - Server-side session extraction helper `getSession()` using Next.js cookies API.
 * - Cookie name and configuration constants.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §8
 * Owner: Member 1 (Dineth)
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

/**
 * The standard authentication cookie name.
 */
export const AUTH_COOKIE_NAME = 'auth_token';

/**
 * Default JWT expiration (8 hours — standard shift duration).
 */
export const TOKEN_EXPIRY = '8h';

/**
 * Max age for the cookie in seconds (8 hours = 28800 seconds).
 */
export const COOKIE_MAX_AGE = 8 * 60 * 60;

/**
 * Valid staff roles in Kandypack.
 */
export type AppRole =
  | 'system_administrator'
  | 'logistics_manager'
  | 'order_entry_clerk'
  | 'store_manager'
  | 'fleet_supervisor';

/**
 * JWT payload structure stored inside the signed auth token.
 */
export interface JWTPayload {
  /** User UUID (sub claim) */
  sub: string;
  /** User login email */
  email: string;
  /** User's assigned app role */
  role: AppRole;
  /** User's home store ID (if store-bound), or null */
  store_id: number | null;
  /** User display name from employee record or display_name_override */
  display_name: string;
  /** Issued at timestamp (seconds) */
  iat?: number;
  /** Expiration timestamp (seconds) */
  exp?: number;
}

/**
 * Authenticated session user representation across the application.
 */
export interface SessionUser {
  user_id: string;
  email: string;
  role: AppRole;
  store_id: number | null;
  display_name: string;
}

/**
 * Helper to retrieve the active JWT secret key.
 * Throws a descriptive error if JWT_SECRET is not defined.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is missing. Please define it in your .env.local file.'
    );
  }
  return secret;
}

/**
 * Hashes a plaintext password using bcryptjs with a cost factor of 12.
 * 
 * @param plaintext - The raw user password
 * @returns The hashed password string
 * 
 * @example
 * const hash = await hashPassword('AdminPass2026!');
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plaintext, salt);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 * 
 * @param plaintext - The candidate password
 * @param hash - The bcrypt hash stored in the users table
 * @returns True if password matches, false otherwise
 * 
 * @example
 * const isValid = await verifyPassword(enteredPassword, user.password_hash);
 */
export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Signs a new JWT carrying user identity claims.
 * 
 * @param payload - User identity attributes
 * @param expiresIn - Optional expiration string (defaults to '8h')
 * @returns Signed JWT string
 * 
 * @example
 * const token = signToken({ sub: user.user_id, email: user.email, role: user.app_role, store_id: user.home_store_id, display_name: user.display_name });
 */
export function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  expiresIn: string = TOKEN_EXPIRY
): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn']
  });
}

/**
 * Verifies a JWT token signature and expiration.
 * 
 * @param token - The raw JWT string from the request cookie
 * @returns Decoded JWTPayload if valid, or null if expired/invalid
 * 
 * @example
 * const payload = verifyToken(cookieToken);
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Cookie options used when issuing the auth_token cookie.
 */
export const authCookieOptions: Partial<ResponseCookie> = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: COOKIE_MAX_AGE
};

/**
 * Retrieves the current authenticated user's session from incoming cookies.
 * Compatible with Next.js App Router Server Components, Server Actions, and Route Handlers.
 * 
 * @returns The active SessionUser or null if unauthenticated / expired
 * 
 * @example
 * const session = await getSession();
 * if (!session) {
 *   return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } }, { status: 401 });
 * }
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const payload = verifyToken(token);
    if (!payload || !payload.sub) {
      return null;
    }

    return {
      user_id: payload.sub,
      email: payload.email,
      role: payload.role,
      store_id: payload.store_id,
      display_name: payload.display_name
    };
  } catch {
    return null;
  }
}

/**
 * Decodes a URL-encoded display name header injected by proxy.ts.
 * 
 * @param value - The raw `x-user-display-name` header string
 * @returns Decoded user display name, or fallback 'Staff Member'
 * 
 * @example
 * const displayName = decodeDisplayNameHeader(req.headers.get('x-user-display-name'));
 */
export function decodeDisplayNameHeader(value?: string | null): string {
  if (!value) {
    return 'Staff Member';
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
