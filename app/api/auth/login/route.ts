/**
 * @file app/api/auth/login/route.ts
 * @description Authentication endpoint for staff sign-in.
 * 
 * Flow:
 * 1. Validates presence of email and password in JSON body.
 * 2. Queries `users` table for email match.
 * 3. Verifies account status (`is_active = 1`).
 * 4. Compares password against bcrypt hash in Node.js.
 * 5. Queries `user_profiles` and `employees` to resolve role, store_id, and display name.
 * 6. Generates signed JWT session and sets an HttpOnly cookie.
 * 7. Returns 200 OK with authenticated user profile.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §8, Docs/05_api-and-pages.md §A1
 * Copy Source: Docs/07_content-copy.md §/login
 */

import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  verifyPassword,
  signToken,
  AUTH_COOKIE_NAME,
  authCookieOptions,
  AppRole,
  SessionUser
} from '@/lib/auth';

/**
 * User record shape from database `users` table.
 */
interface UserRow {
  user_id: string;
  email: string;
  password_hash: string;
  is_active: number;
}

/**
 * Profile record shape joined from `user_profiles` and `employees`.
 */
interface ProfileRow {
  app_role: AppRole;
  display_name_override: string | null;
  home_store_id: number | null;
  full_name: string | null;
  is_active: number;
}

/**
 * Handles POST requests to /api/auth/login.
 * 
 * @param req - Incoming HTTP Request with JSON body { email, password }
 * @returns JSON Response containing user payload and Set-Cookie header
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { email, password } = body;

    // 1. Validate input presence
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Email and password are required.'
          }
        },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Fetch user record from database
    const user = await queryOne<UserRow>(
      'SELECT user_id, email, password_hash, is_active FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Incorrect email or password.'
          }
        },
        { status: 401 }
      );
    }

    // 3. Verify user account is active
    if (user.is_active !== 1) {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_DEACTIVATED',
            message: 'This account has been deactivated. Contact your administrator.'
          }
        },
        { status: 401 }
      );
    }

    // 4. Verify password with bcrypt
    const passwordMatches = await verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Incorrect email or password.'
          }
        },
        { status: 401 }
      );
    }

    // 5. Fetch associated staff profile and role
    const profile = await queryOne<ProfileRow>(
      `SELECT 
         up.app_role, 
         up.display_name_override, 
         up.is_active,
         e.home_store_id, 
         e.full_name
       FROM user_profiles up
       LEFT JOIN employees e ON e.employee_id = up.employee_id
       WHERE up.user_id = ?`,
      [user.user_id]
    );

    if (!profile || profile.is_active !== 1) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_ACTIVE_PROFILE',
            message: 'This account has no active profile assigned. Contact your administrator.'
          }
        },
        { status: 401 }
      );
    }

    const displayName = profile.full_name || profile.display_name_override || 'Staff Member';

    // 6. Sign JWT token
    const token = signToken({
      sub: user.user_id,
      email: user.email,
      role: profile.app_role,
      store_id: profile.home_store_id,
      display_name: displayName
    });

    const sessionUser: SessionUser = {
      user_id: user.user_id,
      email: user.email,
      role: profile.app_role,
      store_id: profile.home_store_id,
      display_name: displayName
    };

    // 7. Return 200 OK and attach HttpOnly cookie
    const response = NextResponse.json(
      {
        user: sessionUser
      },
      { status: 200 }
    );

    response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);

    return response;
  } catch (error: unknown) {
    console.error('Error during login:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Something went wrong. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
