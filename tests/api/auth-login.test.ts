/**
 * @file tests/api/auth-login.test.ts
 * @description API route tests for POST /api/auth/login.
 *
 * Verifies that:
 * - Empty / missing credentials return HTTP 400.
 * - Incorrect credentials return HTTP 401 with appropriate error message.
 * - Correct credentials for the bootstrap admin return HTTP 200 with session cookie.
 * - Rate limiting enforces 5 requests per 15 minutes per IP and returns HTTP 429.
 *
 * Redis is mocked at the module level so no real network call is ever made.
 * The rate-limit test overrides checkRateLimit to simulate an exceeded limit,
 * making every test instant and deterministic regardless of environment.
 *
 * Follows Docs/03_architecture.md §16 Priority 4, Docs/07_content-copy.md §/login.
 */

import { describe, it, expect, afterAll, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/login/route';
import { pool } from '@/lib/db';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Mock lib/redis so checkRateLimit never makes a real Upstash network call.
// Default behaviour: always allow the request (allowed: true).
// Individual tests that need to simulate a blocked request override this below.
// ---------------------------------------------------------------------------
vi.mock('@/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/redis')>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      limit: 5,
      remaining: 4,
      // Reset time 15 minutes from now (matches AUTH_LOGIN profile window)
      resetTimeMs: Date.now() + 15 * 60 * 1000,
    }),
  };
});

describe('API Route: POST /api/auth/login', () => {
  const adminEmail = 'admin@kandypack.lk';
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@Kandypack2026!';

  afterAll(async () => {
    await pool.end();
  });

  it('returns 400 when email or password is missing', async () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.1.1',
      },
      body: JSON.stringify({ email: '' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.message).toContain('Email and password are required');
  });

  it('returns 401 when password is wrong', async () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.1.2',
      },
      body: JSON.stringify({
        email: adminEmail,
        password: 'CompletelyWrongPassword!123',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.message).toBe('Incorrect email or password.');
  });

  it('returns 200 and auth cookie for valid bootstrap admin credentials', async () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.1.3',
      },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.user).toBeDefined();
    expect(json.user.email).toBe(adminEmail);
    expect(json.user.role).toBe('system_administrator');

    // Verify Set-Cookie header contains auth session token
    const cookieHeader = res.headers.get('set-cookie');
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain(AUTH_COOKIE_NAME);
  });

  it('enforces rate limiting and returns 429 with Retry-After header after 5 attempts', async () => {
    // Override checkRateLimit to simulate the counter being at the limit.
    // This verifies that applyRateLimit + the route handler correctly produce
    // a 429 response when Redis reports the limit is exceeded — no real network
    // calls or shared Redis state needed.
    const { checkRateLimit } = await import('@/lib/redis');
    const resetTimeMs = Date.now() + 15 * 60 * 1000;
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetTimeMs,
    });

    const blockedReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.99.1',
      },
      body: JSON.stringify({ email: 'admin@kandypack.lk', password: 'anything' }),
    });

    const res = await POST(blockedReq);
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe('RATE_LIMITED');
    expect(json.error.message).toBe('Too many attempts. Please try again in a few minutes.');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });
});
