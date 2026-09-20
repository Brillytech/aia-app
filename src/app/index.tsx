import { router } from "expo-router";
import { useEffect } from "react";
import { routeAfterAuth } from "../auth-redirect";
import { readSession } from "../session";

/**
 * Entry route.
 *
 * This was a four-slide onboarding carousel. It is paused while the app moves
 * to the web: a swipe-through intro is a first-run app-store ritual, and it
 * reads as a wall in front of a URL someone has just clicked.
 *
 * The slides, `src/onboarding.ts` and `src/ui/DevOnboardingReset.tsx` are kept
 * (unreferenced) so bringing it back is a revert rather than a rewrite. The
 * carousel itself is in git history at 81c9018 and earlier.
 *
 * IT USED TO SEND EVERYONE TO THE LOGIN FORM
 * Unconditionally -- and `auth/login.tsx` has never checked for a session
 * either, so a student with a perfectly good session sitting in storage opened
 * the app and was shown a sign-in form. It was reported as "why am I seeing my
 * weekly report without logging in": they were not signed out at all, they were
 * signed in and looking at the wrong screen, with a popup that had correctly
 * decided they had a report waiting.
 *
 * WHY `unavailable` GOES TO THE DASHBOARD
 * The three answers are not equal. `getSession()` reads storage, so someone
 * genuinely signed out comes back as `signed-out` without needing the network
 * at all. `unavailable` therefore means something much more specific: there WAS
 * a session and it could not be refreshed. Sending that case to the login form
 * is precisely the spurious logout `src/session.ts` exists to prevent. The
 * dashboard handles it properly -- it redirects only on a confirmed
 * `signed-out`, so there is no bounce back here and no loop.
 */
export default function Index() {
  useEffect(() => {
    let active = true;

    (async () => {
      const state = await readSession();

      if (!active) return;

      if (state.status === "signed-out") {
        router.replace("/auth/login");
        return;
      }

      if (state.status === "unavailable") {
        router.replace("/dashboard");
        return;
      }

      // Reused, not reimplemented. `routeAfterAuth` is where "completed profile
      // or not" is decided for the login screen and the OAuth callback, and its
      // own comment says a second copy is how those paths would drift.
      await routeAfterAuth(state.user.id, () => {
        if (active) router.replace("/auth/login");
      });
    })().catch(() => {
      if (active) router.replace("/auth/login");
    });

    return () => {
      active = false;
    };
  }, []);

  // Nothing to draw. This route only ever decides where to go, and the decision
  // is a storage read, so the blank frame is momentary. Rendering a spinner here
  // would flash under the splash screen rather than replace it.
  return null;
}
