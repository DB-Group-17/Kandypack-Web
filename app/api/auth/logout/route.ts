/**
 * @file app/api/auth/logout/route.ts
 * @description Sign out endpoint that invalidates and clears the user session cookie.
 * 
 * Flow:
 * 1. Receives POST /api/auth/logout request.
 * 2. Deletes the `auth_token` cookie from the response.
 * 3. Returns { "success": true } with 200 OK.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/05_api-and-pages.md §A1
 * Owner: Member 1 (Dineth)
 */

import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

/**
 * Handles POST requests to /api/auth/logout.
 * Clears the session cookie from the client browser.
 * 
 * @returns JSON Response with { success: true }
 */
export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json(
    {
      success: true
    },
    { status: 200 }
  );

  // Clear the auth_token cookie
  response.cookies.delete(AUTH_COOKIE_NAME);

  return response;
}
