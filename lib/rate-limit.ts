/**
 * @file lib/rate-limit.ts
 * @description Route-level rate limiting middleware for Kandypack API endpoints.
 *
 * Wraps the low-level `checkRateLimit` helper in `lib/redis.ts` with:
 * - Pre-configured rate limit profiles for each protected endpoint
 * - Client IP extraction from standard proxy headers
 * - Standardized HTTP 429 "Too Many Requests" responses with Retry-After header
 *
 * Protected endpoints (per Docs/03_architecture.md §7):
 * - POST /api/auth/login         — 5 requests per 15 minutes per IP
 * - POST /api/orders             — 20 requests per minute per user
 * - POST /api/truck-schedules    — 20 requests per minute per user
 * - POST /api/reports/:type/export/pdf — 10 requests per 5 minutes per user
 * - Global baseline              — 120 requests per minute per IP
 *
 * Owned by Member 5 (Desandu). Follows Docs/03_architecture.md §7, §10, §14.
 * Error copy from Docs/07_content-copy.md §/login.
 */

import { NextResponse } from 'next/server';
import { checkRateLimit, RateLimitResult } from '@/lib/redis';

/* =========================================================================
   1. RATE LIMIT PROFILE DEFINITIONS
   Pre-configured limits for each protected action. Add new profiles here
   when new endpoints need rate limiting — the route handler just calls
   `applyRateLimit(req, RATE_LIMIT_PROFILES.SOME_ACTION)`.
   ========================================================================= */

/**
 * Configuration for a single rate-limited action.
 */
export interface RateLimitProfile {
  /** Internal action name used as the Redis key namespace (e.g. "auth_login") */
  action: string;
  /** Maximum requests allowed within the time window */
  limit: number;
  /** Duration of the rate limit window in seconds */
  windowSeconds: number;
  /** Human-readable error message returned in the 429 response body */
  message: string;
}

/**
 * Pre-configured rate limit profiles for each protected endpoint.
 *
 * Values chosen to balance security against legitimate usage:
 * - Login is tight (5 per 15 min) because brute-force attacks are the primary threat
 * - Order/truck creation are moderate (20 per min) — fast enough for a busy clerk
 * - PDF export is conservative (10 per 5 min) because rendering is CPU-expensive
 * - Global baseline is generous (120 per min) — catches runaway scripts, not normal use
 */
export const RATE_LIMIT_PROFILES = {
  /** POST /api/auth/login — 5 attempts per 15 minutes per IP */
  AUTH_LOGIN: {
    action: 'auth_login',
    limit: 5,
    windowSeconds: 15 * 60, // 15 minutes
    message: 'Too many attempts. Please try again in a few minutes.',
  },

  /** POST /api/orders — 20 requests per minute per authenticated user */
  ORDER_CREATE: {
    action: 'order_create',
    limit: 20,
    windowSeconds: 60,
    message: 'Too many order requests. Please wait a moment and try again.',
  },

  /** POST /api/truck-schedules — 20 requests per minute per authenticated user */
  TRUCK_SCHEDULE_CREATE: {
    action: 'truck_schedule_create',
    limit: 20,
    windowSeconds: 60,
    message: 'Too many scheduling requests. Please wait a moment and try again.',
  },

  /** POST /api/reports/:type/export/pdf — 10 requests per 5 minutes per user */
  REPORT_PDF_EXPORT: {
    action: 'report_pdf_export',
    limit: 10,
    windowSeconds: 5 * 60, // 5 minutes
    message: 'Too many export requests. Please wait a few minutes before trying again.',
  },

  /** Global per-IP baseline — 120 requests per minute */
  GLOBAL_BASELINE: {
    action: 'global',
    limit: 120,
    windowSeconds: 60,
    message: 'Too many requests. Please slow down.',
  },
} as const;

/* =========================================================================
   2. CLIENT IP EXTRACTION
   Reads the client IP from standard reverse-proxy headers (Vercel, Cloudflare,
   nginx) with a safe fallback for local development.
   ========================================================================= */

/**
 * Extracts the client IP address from request headers.
 *
 * Checks headers in priority order:
 * 1. `x-forwarded-for` (standard proxy header — first IP is the real client)
 * 2. `x-real-ip` (nginx / some CDN setups)
 * 3. Falls back to "unknown" for local dev (rate limiting still works, just shared)
 *
 * @param {Request} req - The incoming HTTP request.
 * @returns {string} The best-effort client IP address.
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;

  // x-forwarded-for may contain a comma-separated chain: "client, proxy1, proxy2"
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  // x-real-ip is a single IP set by nginx or similar
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // Local development fallback — all local requests share one bucket
  return 'unknown';
}

/* =========================================================================
   3. RATE LIMIT ENFORCEMENT
   The main function that route handlers call. Returns null if the request is
   allowed, or a pre-built 429 NextResponse if the limit is exceeded.
   ========================================================================= */

/**
 * Checks whether the current request exceeds the specified rate limit.
 *
 * Usage in a route handler:
 * ```ts
 * const blocked = await applyRateLimit(req, RATE_LIMIT_PROFILES.AUTH_LOGIN);
 * if (blocked) return blocked; // 429 response already built
 * // ... proceed with the actual handler logic
 * ```
 *
 * @param {Request} req - The incoming HTTP request (used to extract the client IP).
 * @param {RateLimitProfile} profile - The rate limit profile to enforce.
 * @param {string} [identifier] - Optional explicit identifier (e.g. user_id).
 *   If omitted, the client IP is used. For authenticated endpoints, pass the
 *   user_id so limits are per-user rather than per-IP.
 * @returns {Promise<NextResponse | null>} A 429 response if rate-limited, or null if allowed.
 */
export async function applyRateLimit(
  req: Request,
  profile: RateLimitProfile,
  identifier?: string
): Promise<NextResponse | null> {
  // Determine the identifier: prefer explicit user ID, fall back to client IP
  const effectiveIdentifier = identifier || getClientIp(req);

  // Check against the Redis counter
  const result: RateLimitResult = await checkRateLimit(
    profile.action,
    effectiveIdentifier,
    profile.limit,
    profile.windowSeconds
  );

  // If allowed, return null (no blocking response) — the caller continues normally
  if (result.allowed) {
    return null;
  }

  // Build a standardised 429 response with rate limit headers
  const retryAfterSeconds = Math.ceil(
    (result.resetTimeMs - Date.now()) / 1000
  );

  return NextResponse.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: profile.message,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfterSeconds)),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetTimeMs),
      },
    }
  );
}
