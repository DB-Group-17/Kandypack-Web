/**
 * @file app/api/auth/me/route.ts
 * @description Identity endpoint returning the currently authenticated staff profile.
 * 
 * Flow:
 * 1. Reads the `auth_token` cookie via getSession().
 * 2. If valid, returns the user's ID, email, role, store_id, and display name with 200 OK.
 * 3. If missing or invalid, returns 401 Unauthorized.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/05_api-and-pages.md §A1
 * Owner: Member 1 (Dineth)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Handles GET requests to /api/auth/me.
 * 
 * @returns JSON Response containing the active session profile or 401 error
 */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated.'
        }
      },
      { status: 401 }
    );
  }

  return NextResponse.json(session, { status: 200 });
}
