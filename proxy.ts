/**
 * @file proxy.ts
 * @description Next.js 16 Edge Proxy (formerly Middleware) for Kandypack.
 * 
 * Features:
 * - Edge-compatible JWT verification using jose library.
 * - Route-level authentication check (redirects unauthenticated page requests to /login).
 * - Role-based authorization guard using lib/rbac canAccessRoute.
 * - Injects verified user context headers (x-user-id, x-user-role, x-user-store)
 *   into authorized requests for downstream Server Components and API Route Handlers.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/05_api-and-pages.md, Next.js 16 Proxy Convention
 * Owner: Member 1 (Dineth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { canAccessRoute } from './lib/rbac';
import { AUTH_COOKIE_NAME, AppRole, JWTPayload } from './lib/auth';

/**
 * Public routes accessible without authentication.
 */
const PUBLIC_ROUTES = ['/login', '/api/auth/login'];

/**
 * Helper to get the encoded JWT secret for jose Edge verification.
 */
function getEncodedSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is missing. Please define it in your .env.local file.'
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Verifies a JWT token using jose in the Edge Runtime.
 * 
 * @param token - The raw JWT string from the request cookie
 * @returns The verified payload or null if invalid/expired
 */
async function verifyEdgeToken(token: string): Promise<JWTPayload | null> {
  try {
    const encodedSecret = getEncodedSecret();
    const { payload } = await jwtVerify(token, encodedSecret);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Next.js 16 Proxy function. Intercepts incoming requests before completion.
 * 
 * @param request - The incoming NextRequest
 * @returns NextResponse (redirect, JSON error, or next with context headers)
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  // Extract auth token from HttpOnly cookie
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyEdgeToken(token) : null;

  // Handle public routes
  if (isPublicRoute) {
    // If already authenticated and visiting /login, redirect to /dashboard
    if (payload && payload.sub && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // Handle unauthenticated requests to protected routes
  if (!payload || !payload.sub || !payload.role) {
    if (isApiRoute) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.'
          }
        },
        { status: 401 }
      );
    }

    // Redirect browser to login page
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/' && pathname !== '/dashboard') {
      loginUrl.searchParams.set('from', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Handle role-based authorization check
  const isAllowed = canAccessRoute(payload.role as AppRole, pathname);

  if (!isAllowed) {
    if (isApiRoute) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${payload.role}' is not authorized to access this resource.`
          }
        },
        { status: 403 }
      );
    }

    // Redirect browser to dashboard with unauthorized status
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Clone headers and inject verified user context
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.sub);
  requestHeaders.set('x-user-role', payload.role);
  requestHeaders.set('x-user-store', payload.store_id !== null ? String(payload.store_id) : '');
  requestHeaders.set('x-user-display-name', encodeURIComponent(payload.display_name || ''));

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

/**
 * Default export for Next.js proxy convention compatibility.
 */
export default proxy;

/**
 * Next.js Proxy matcher config.
 * Runs on all routes except static files, images, and Next.js internal assets.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
