import { router } from "expo-router";
import { supabase } from "../lib/supabase";

/**
 * Where Supabase should send the browser back to after an auth round-trip.
 *
 * The app used to hardcode `aiaapp://auth/callback` and friends. A custom URL
 * scheme means nothing to a browser: it either does nothing or offers to open
 * an app that no longer exists. Every redirect is now an https URL on the
 * origin the user is already on, which also means localhost during development
 * and the real domain in production resolve automatically, with no build-time
 * configuration.
 *
 * IMPORTANT: every URL this can produce must be listed in the Supabase
 * dashboard under Authentication → URL Configuration → Redirect URLs.
 * Supabase silently refuses to redirect anywhere unlisted, and because dev
 * usually *is* listed, the failure only ever appears in production.
 *
 * The native branch is a fallback for running the old app locally during the
 * migration; PWA builds never take it.
 */
export function authRedirectTo(path: string) {
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }

  return `aiaapp://${path.replace(/^\/+/, "")}`;
}

/** The three redirect targets, named so call sites cannot typo a path. */
export const AUTH_REDIRECTS = {
  /** Google OAuth returns here. */
  callback: () => authRedirectTo("/auth/callback"),
  /** Signup confirmation email lands here. */
  emailConfirm: () => authRedirectTo("/auth/login"),
  /** Password reset email lands here. */
  passwordReset: () => authRedirectTo("/auth/reset-password"),
};

/**
 * Sends a freshly authenticated user to the right screen.
 *
 * Lifted out of `auth/login.tsx` so the new OAuth callback route can apply the
 * same rule rather than reimplementing it — a second copy is exactly how the
 * two paths would drift.
 */
export async function routeAfterAuth(
  userId: string,
  onError?: (message: string) => void,
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("profile_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    onError?.(error.message);
    return;
  }

  router.replace(profile?.profile_completed ? "/dashboard" : "/complete-profile");
}
