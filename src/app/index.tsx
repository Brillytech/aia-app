import { Redirect } from "expo-router";

/**
 * Entry route.
 *
 * This was a four-slide onboarding carousel. It is paused while the app moves
 * to the web: a swipe-through intro is a first-run app-store ritual, and it
 * reads as a wall in front of a URL someone has just clicked.
 *
 * Behaviour is unchanged for anyone who had already seen it — that path
 * already redirected straight here — so this only removes the carousel for
 * first-time visitors. `/auth/login` does not check for an existing session
 * today, which is also the behaviour this replaces exactly.
 *
 * The slides, `src/onboarding.ts` and `src/ui/DevOnboardingReset.tsx` are kept
 * (unreferenced) so bringing it back is a revert rather than a rewrite. The
 * carousel itself is in git history at 81c9018 and earlier.
 */
export default function Index() {
  return <Redirect href="/auth/login" />;
}
