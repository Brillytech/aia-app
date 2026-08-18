import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The one and only key the onboarding flow touches.
 *
 * Written as the string `"true"` by `finishOnboarding()` in `app/index.tsx`
 * (both on "Get started" and on "Skip"), and read on every cold start of `/`
 * to decide between replaying the slides and redirecting to `/auth/login`.
 * Anything other than the exact string `"true"` — including `null` — replays
 * onboarding, so removing the key is enough to reset it.
 */
export const ONBOARDING_KEY = "lasu_scholar_onboarding_seen";

/** Removes the seen-flag so `/` replays the slides. Dev tooling only. */
export function clearOnboardingSeen() {
  return AsyncStorage.removeItem(ONBOARDING_KEY);
}
