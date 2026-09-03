/**
 * @file types/auth.ts
 * @description Client-safe TypeScript type definitions and interfaces for Kandypack authentication.
 * 
 * Provides:
 * - Re-exported AppRole and SessionUser types from lib/auth for client consumption.
 * - LoginCredentials and AuthResult DTO interfaces.
 * - AuthContextType contract for React AuthContext and useAuth() consumer hook.
 * 
 * Note:
 * Uses `import type` from `@/lib/auth` to prevent bundling server-side packages
 * (bcryptjs, jsonwebtoken, next/headers) into client-side browser bundles.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/05_api-and-pages.md §A1
 * Owner: Member 1 (Dineth)
 */

import type { AppRole, SessionUser } from '@/lib/auth';

export type { AppRole, SessionUser };

/**
 * Client alias for SessionUser representing an authenticated staff member.
 */
export type AuthUser = SessionUser;

/**
 * Credentials payload submitted during user login.
 */
export interface LoginCredentials {
  /** User login email address */
  email: string;
  /** Plaintext password */
  password: string;
}

/**
 * Result returned by the client-side login action.
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  success: boolean;
  /** Human-readable error message if authentication failed */
  error?: string;
}

/**
 * Interface defining the authentication state and actions provided by AuthContext.
 */
export interface AuthContextType {
  /** Currently authenticated user profile, or null if unauthenticated */
  user: SessionUser | null;
  /** Current user's app role shortcut, or null if unauthenticated */
  role: AppRole | null;
  /** Store ID bound to the current user (if store_manager), or null */
  store_id: number | null;
  /** Whether a verified user session is currently active */
  isAuthenticated: boolean;
  /** Whether the initial session hydration check is currently in flight */
  isLoading: boolean;
  /**
   * Submits user credentials to POST /api/auth/login and updates client state.
   * 
   * @param credentials - Login email and password
   * @returns AuthResult indicating success or failure error message
   */
  login: (credentials: LoginCredentials) => Promise<AuthResult>;
  /**
   * Terminates the current session via POST /api/auth/logout, resets state,
   * and navigates the browser to /login.
   */
  logout: () => Promise<void>;
  /**
   * Refreshes the active session profile by calling GET /api/auth/me.
   */
  refreshUser: () => Promise<void>;
  /**
   * Checks whether the active user has at least one of the specified roles.
   * Advisory helper for conditional UI element visibility.
   * 
   * @param roles - Single role or array of allowed roles
   * @returns True if authenticated and role matches, false otherwise
   */
  hasRole: (roles: AppRole | AppRole[]) => boolean;
}
