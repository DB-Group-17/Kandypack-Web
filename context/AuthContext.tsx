"use client";

/**
 * @file context/AuthContext.tsx
 * @description Central React Authentication Context and Provider for the Kandypack logistics platform.
 * 
 * Responsibilities:
 * 1. Manages in-memory authenticated staff user state (`SessionUser | null`).
 * 2. Hydrates user session on initial client mount via background call to `GET /api/auth/me`.
 * 3. Provides `login(credentials)` which communicates with `POST /api/auth/login` and updates state.
 * 4. Provides `logout()` which communicates with `POST /api/auth/logout`, resets state, and redirects to `/login`.
 * 5. Provides `hasRole(roles)` advisory helper for conditional UI rendering (action buttons, tabs).
 * 6. Exposes the canonical `useAuth()` consumer hook for components across the application.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/05_api-and-pages.md §A1
 * Owner: Member 1 (Dineth)
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AuthContextType,
  AuthResult,
  LoginCredentials,
  SessionUser,
  AppRole,
} from "@/types/auth";

/**
 * React Context holding the global authentication state and operations.
 * Initialized as undefined to catch invalid usage outside of <AuthProvider>.
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Properties for the AuthProvider component wrapper.
 */
export interface AuthProviderProps {
  /** Child React component tree */
  children: ReactNode;
}

/**
 * AuthProvider component that wraps the application and supplies authentication context.
 * 
 * @param {AuthProviderProps} props - Provider properties containing child nodes
 * @returns {JSX.Element} The rendered Context Provider
 */
export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const router = useRouter();

  // Active authenticated user profile in browser memory
  const [user, setUser] = useState<SessionUser | null>(null);

  // Loading flag indicating whether initial session hydration from /api/auth/me is in progress
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Derived state shortcuts
  const role: AppRole | null = user?.role ?? null;
  const store_id: number | null = user?.store_id ?? null;
  const isAuthenticated: boolean = Boolean(user);

  /**
   * Fetches the current session profile from GET /api/auth/me.
   * Runs during initial application mount and when explicit refresh is requested.
   */
  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (response.ok) {
        const data = (await response.json()) as SessionUser;
        setUser(data);
      } else {
        // 401 or invalid session cookie
        setUser(null);
      }
    } catch (error) {
      console.error("[AuthContext] Error hydrating session from /api/auth/me:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Initial session hydration on component mount.
   * Runs once when the client loads the app in browser memory.
   */
  useEffect(() => {
    let isSubscribed = true;

    const hydrateSession = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!isSubscribed) return;

        if (response.ok) {
          const data = (await response.json()) as SessionUser;
          setUser(data);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("[AuthContext] Error hydrating session from /api/auth/me:", error);
        if (isSubscribed) {
          setUser(null);
        }
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    void hydrateSession();

    return () => {
      isSubscribed = false;
    };
  }, []);

  /**
   * Submits user credentials to POST /api/auth/login.
   * On success, updates in-memory user state and returns { success: true }.
   * Does NOT hardcode navigation, allowing the caller (e.g. Login page) to handle ?from= redirects.
   * 
   * @param {LoginCredentials} credentials - Email and password entered by user
   * @returns {Promise<AuthResult>} Object containing success status and optional error message
   */
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<AuthResult> => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
        });

        const data = await response.json();

        if (response.ok && data.user) {
          setUser(data.user as SessionUser);
          return { success: true };
        }

        const errorMessage =
          data?.error?.message || "Login failed. Please check your credentials.";
        return { success: false, error: errorMessage };
      } catch (error) {
        console.error("[AuthContext] Network or unexpected error during login:", error);
        return { success: false, error: "Network error. Please try again later." };
      }
    },
    []
  );

  /**
   * Terminates the active session by calling POST /api/auth/logout.
   * Clears in-memory user state, redirects the browser to /login, and flushes route cache.
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("[AuthContext] Error invoking /api/auth/logout:", error);
    } finally {
      setUser(null);
      router.push("/login");
      router.refresh();
    }
  }, [router]);

  /**
   * Evaluates whether the currently authenticated user possesses one of the authorized roles.
   * Used for conditional UI rendering (e.g., showing "+ New Order" buttons).
   * 
   * @param {AppRole | AppRole[]} roles - Single allowed role or array of allowed roles
   * @returns {boolean} True if authenticated and role matches; false otherwise
   */
  const hasRole = useCallback(
    (roles: AppRole | AppRole[]): boolean => {
      if (!user) return false;
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      return allowedRoles.includes(user.role);
    },
    [user]
  );

  // Memoize context value to avoid re-rendering consumers when provider re-renders
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      role,
      store_id,
      isAuthenticated,
      isLoading,
      login,
      logout,
      refreshUser,
      hasRole,
    }),
    [
      user,
      role,
      store_id,
      isAuthenticated,
      isLoading,
      login,
      logout,
      refreshUser,
      hasRole,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

/**
 * Custom React hook to access authentication context.
 * Must be used within an <AuthProvider> tree.
 * 
 * @returns {AuthContextType} The active authentication context
 * @throws {Error} If called outside of an <AuthProvider>
 * 
 * @example
 * const { user, role, logout, hasRole } = useAuth();
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuth must be used within an AuthProvider. Ensure your component tree is wrapped with <AuthProvider>."
    );
  }
  return context;
}
