"use client";

/**
 * @file app/login/page.tsx
 * @description Authentication sign-in page for staff members of Kandypack.
 * 
 * Features:
 * - Matches the split-card design from UI/login/code.html and DESIGN.md.
 * - Deep violet left hero banner with brand icon, tagline, and logistics illustration.
 * - Pure white responsive right card with structured input fields and focus glow.
 * - Sourced strictly from Docs/07_content-copy.md (§/login).
 * - Wired to central AuthContext (useAuth) for login state, session creation, and routing.
 * - Supports safe local redirection via `?from=` search parameter.
 * - Preserves 'Remember me' email state in browser localStorage.
 * - Wrapped in <Suspense> to comply with Next.js 16 CSR bailout rules for useSearchParams().
 * 
 * Authority: DESIGN.md, Docs/11_ui-rules.md §8, Docs/07_content-copy.md §/login
 * Owner: Member 1 (Dineth)
 */

import React, { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Package2,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Info,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Internal form component that consumes useSearchParams inside Suspense.
 * 
 * @returns {React.ReactNode} Rendered login card and form.
 */
function LoginForm(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Form input state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Submission and error state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fallback state if external illustration fails to load
  const [imageError, setImageError] = useState(false);

  /**
   * If already authenticated, redirect to dashboard or requested destination.
   */
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      const fromParam = searchParams.get("from");
      const target =
        fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")
          ? fromParam
          : "/dashboard";
      router.replace(target);
    }
  }, [isAuthenticated, isAuthLoading, router, searchParams]);

  /**
   * Hydrate remembered email address from localStorage on client mount.
   * Uses setTimeout to avoid synchronous cascading render warnings in React 19.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const savedEmail = localStorage.getItem("kandypack_remember_email");
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      } catch {
        // LocalStorage access may be restricted in private/incognito browsing
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  /**
   * Validates and submits login credentials to the auth context.
   * 
   * @param {React.FormEvent<HTMLFormElement>} e - Form submission event
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Please enter both your email and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Handle Remember Me preference persistence
      try {
        if (rememberMe) {
          localStorage.setItem("kandypack_remember_email", trimmedEmail);
        } else {
          localStorage.removeItem("kandypack_remember_email");
        }
      } catch {
        // Silently ignore storage exceptions
      }

      const result = await login({
        email: trimmedEmail,
        password,
      });

      if (result.success) {
        // Sanitize return target from query string to prevent open redirects
        const fromParam = searchParams.get("from");
        const destination =
          fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")
            ? fromParam
            : "/dashboard";

        router.push(destination);
        router.refresh();
      } else {
        // Map returned error to approved copy from Docs/07_content-copy.md
        const rawError = (result.error || "").toLowerCase();

        if (rawError.includes("deactivated")) {
          setErrorMessage(
            "This account has been deactivated. Contact your administrator."
          );
        } else if (rawError.includes("rate") || rawError.includes("attempts")) {
          setErrorMessage(
            "Too many attempts. Please try again in a few minutes."
          );
        } else if (
          rawError.includes("credential") ||
          rawError.includes("incorrect") ||
          rawError.includes("invalid") ||
          rawError.includes("password")
        ) {
          setErrorMessage("Incorrect email or password.");
        } else {
          setErrorMessage(
            result.error || "Something went wrong. Please try again."
          );
        }
      }
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-5xl flex flex-col md:flex-row bg-white rounded-2xl overflow-hidden shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40">
      {/* =========================================================================
          LEFT PANEL: Graphic & Branding (Visible on md+ viewports)
          Theme: Deep Violet (#5A4FE0) with Plus Jakarta typography
          ========================================================================= */}
      <div className="hidden md:flex flex-col justify-between w-1/2 p-10 lg:p-12 bg-[#5A4FE0] relative overflow-hidden text-white select-none">
        {/* Decorative background blurs */}
        <div
          className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 left-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"
          aria-hidden="true"
        />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm">
            <Package2 className="w-5 h-5 text-[#5A4FE0]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Kandypack
          </h1>
        </div>

        {/* Central Isometric Logistics Graphic + Tagline */}
        <div className="relative z-10 mt-auto pt-10">
          {!imageError ? (
            <div className="w-full flex items-center justify-center mb-6">
              <Image
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC4ngppf1RAEhvVLgenbav1CO-scjcQrVeT9fiqJULSgrrEtZ7tZxvHkVCapNpRIuuhQWVKgusAl6CcTGMoVfeD_7Jms1uZKve-HNrFrUbxAIDp4L1l2i1VGjRsTvNmI0tFEu9YJqH_UfMSVXSu4EDZH46I5MD_Xj4AovjrT_DwshpFVcaWFyLaVs1252h6qMmePBmc-69nKeWz0UjXKZxFjnZkPZGjCbd50PrMrKt8bTS2_2d32Zaz1Q"
                alt="Logistics network diagram illustration"
                width={360}
                height={260}
                unoptimized
                priority
                className="w-auto h-auto max-h-[260px] object-contain opacity-95 mix-blend-screen transition-opacity duration-300"
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            // Offline/Fallback SVG graphic representation
            <div className="w-full h-48 mb-6 rounded-xl bg-white/10 border border-white/20 flex flex-col items-center justify-center p-6 text-center">
              <Package2 className="w-12 h-12 text-white/70 mb-2" />
              <span className="text-xs uppercase font-semibold tracking-wider text-white/60">
                Logistics Hub Operations
              </span>
            </div>
          )}

          <h2 className="text-2xl font-semibold text-white mb-2 leading-tight">
            Rail &amp; road distribution management
          </h2>
          <p className="text-sm text-white/80 leading-relaxed max-w-md">
            Streamline your supply chain with intelligent tracking and
            comprehensive logistics tools.
          </p>
        </div>
      </div>

      {/* =========================================================================
          RIGHT PANEL: Sign-in Form
          Surface: Pure white with soft inputs and pill action button
          ========================================================================= */}
      <div className="w-full md:w-1/2 p-8 sm:p-10 lg:p-12 flex flex-col justify-center">
        <div className="max-w-sm mx-auto w-full">
          {/* Mobile-Only Header */}
          <div className="md:hidden flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#5A4FE0] flex items-center justify-center shadow-sm">
              <Package2 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121C2C]">
              Kandypack
            </h1>
          </div>

          {/* Page Titles per Docs/07_content-copy.md */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-[#121C2C] mb-1">
              Sign in
            </h2>
            <p className="text-sm text-[#474554] md:hidden">
              Rail &amp; road distribution management
            </p>
          </div>

          {/* Error Alert Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-lg bg-[#FFF0F0] border border-[#F93C65]/30 flex items-start gap-2.5 text-sm text-[#F93C65] transition-all"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F93C65]" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 flex flex-col">
            {/* Email Field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-bold text-[#474554] uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@kandypack.lk"
                disabled={isSubmitting}
                className="w-full h-12 px-4 rounded-lg bg-[#F9F9FF] border border-[#C8C4D7] text-[#121C2C] placeholder-[#474554]/50 focus:border-[#5A4FE0] focus:ring-2 focus:ring-[#5A4FE0]/20 outline-none transition text-sm disabled:opacity-50"
              />
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-bold text-[#474554] uppercase tracking-wider"
              >
                Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={isSubmitting}
                  className="w-full h-12 pl-4 pr-11 rounded-lg bg-[#F9F9FF] border border-[#C8C4D7] text-[#121C2C] placeholder-[#474554]/50 focus:border-[#5A4FE0] focus:ring-2 focus:ring-[#5A4FE0]/20 outline-none transition text-sm disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 p-1 text-[#474554]/70 hover:text-[#121C2C] transition-colors rounded"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me & Help Actions */}
            <div className="flex items-center justify-between pt-1">
              <label
                htmlFor="remember"
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <input
                  id="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#C8C4D7] text-[#5A4FE0] focus:ring-[#5A4FE0] bg-[#F9F9FF] cursor-pointer"
                />
                <span className="text-xs text-[#474554]">Remember me</span>
              </label>
              <span
                tabIndex={0}
                className="text-xs text-[#4132C7] hover:text-[#5A4FE0] transition-colors cursor-pointer hover:underline"
                title="Contact system administrator to reset credentials"
              >
                Forgot password?
              </span>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 w-full h-12 bg-[#5A4FE0] hover:bg-[#4132C7] active:scale-[0.99] text-white font-semibold text-sm rounded-full flex items-center justify-center gap-2 shadow-sm hover:shadow-[0px_8px_24px_rgba(90,79,224,0.25)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Note per Docs/07_content-copy.md */}
          <div className="mt-10 pt-6 border-t border-[#C8C4D7]/40 text-center">
            <p className="text-xs text-[#474554] flex items-center justify-center gap-1.5 leading-normal">
              <Info className="w-3.5 h-3.5 text-[#5A4FE0] shrink-0" />
              <span>
                No public sign-up? Contact your system administrator to get an
                account.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback skeleton placeholder while search params hydrate on client.
 */
function LoginSkeleton(): React.ReactNode {
  return (
    <div className="w-full max-w-5xl h-[520px] bg-white rounded-2xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-[#C8C4D7]/40 animate-pulse flex items-center justify-center">
      <div className="flex items-center gap-2 text-[#5A4FE0]">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm font-medium text-[#474554]">
          Loading Kandypack…
        </span>
      </div>
    </div>
  );
}

/**
 * Exported default LoginPage component.
 * Ensures whole page uses canonical #F5F5FA canvas background.
 * Wraps LoginForm in <Suspense> boundary to adhere to Next.js 16 requirements.
 * 
 * @returns {React.ReactNode} Complete sign-in view.
 */
export default function LoginPage(): React.ReactNode {
  return (
    <main className="min-h-screen bg-[#F5F5FA] flex items-center justify-center p-4 sm:p-6 lg:p-8 antialiased">
      <Suspense fallback={<LoginSkeleton />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
