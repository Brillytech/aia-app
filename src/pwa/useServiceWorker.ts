import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Registers the service worker and surfaces when a new build is waiting.
 *
 * The worker is generated with `skipWaiting: false`, so a new version installs
 * and then sits in `waiting` rather than taking over. Nothing changes under the
 * user's feet; the app asks first. That is deliberate — Expo's own PWA guide
 * warns service workers can cache aggressively enough to strand users on stale
 * builds, and an update that applies silently mid-session is the other half of
 * that problem.
 *
 * No-ops safely anywhere `navigator.serviceWorker` is absent: native, SSR, and
 * any browser without support.
 */
export function useServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);
  /** Guards the reload loop that fires when several tabs change controller. */
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    function promote(worker: ServiceWorker | null) {
      if (cancelled || !worker) return;
      waitingRef.current = worker;
      setUpdateReady(true);
    }

    function watch(registration: ServiceWorkerRegistration) {
      // Already waiting when we registered — e.g. the tab was reopened after an
      // update installed in a previous session.
      if (registration.waiting && navigator.serviceWorker.controller) {
        promote(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          // `controller` existing is what separates an update from a first
          // install. Without that check the banner would appear on a user's
          // very first visit, where there is nothing to update to.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            promote(installing);
          }
        });
      });
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (cancelled) return;
        watch(registration);
      })
      .catch((error) => {
        // A failed registration must never break the app — it just means no
        // offline support this session.
        console.log("SW REGISTER FAILED:", error);
      });

    function onControllerChange() {
      if (reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  /**
   * Activates the waiting worker. Workbox adds the matching message listener
   * automatically when built with `skipWaiting: false`; the reload happens in
   * the `controllerchange` handler above once it takes over.
   */
  const applyUpdate = useCallback(() => {
    const waiting = waitingRef.current;
    if (!waiting) return;

    waiting.postMessage({ type: "SKIP_WAITING" });

    // If the controller never changes — an edge case seen when the page was
    // never controlled to begin with — reload anyway so the user is not left
    // tapping a button that does nothing.
    setTimeout(() => {
      if (!reloadedRef.current) {
        reloadedRef.current = true;
        window.location.reload();
      }
    }, 2500);
  }, []);

  return { updateReady, applyUpdate };
}
