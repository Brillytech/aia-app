import { useCallback, useEffect, useState } from "react";

/** Remembers a dismissal so the banner does not nag on every launch. */
const DISMISSED_KEY = "lasu_scholar_install_dismissed";

/**
 * `beforeinstallprompt` is not in TypeScript's DOM lib — it is a Chromium
 * extension to the spec, not a standard.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** True once the app is running from the home screen rather than a tab. */
function isStandalone() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari's own non-standard flag, which is the only signal on iOS.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch point count is what separates it.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export type InstallState = {
  /** Chromium: a real prompt is available and `install()` will show it. */
  canPrompt: boolean;
  /** iOS Safari: no prompt exists, so show instructions instead. */
  needsIosInstructions: boolean;
  /** Already installed — offer nothing. */
  installed: boolean;
  dismissed: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
};

/**
 * Install affordance state.
 *
 * Two entirely separate paths, because iOS never joined the standard:
 * Chromium fires `beforeinstallprompt` and hands over an event that can show a
 * native install dialog. **Safari never fires it at all** — on iOS the only
 * route is Share → Add to Home Screen, done by hand. Left unhandled that
 * platform silently offers nothing, which is why it is detected explicitly
 * rather than treated as "no prompt available".
 */
export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  // Lazy initialisers, not an effect. Both are pure reads of the environment,
  // and setting them synchronously inside an effect is a cascading render —
  // the render runs, the effect immediately sets state, everything renders
  // again. Their guards make them safe to evaluate during render.
  const [installed, setInstalled] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      // Private mode, or storage blocked. Not dismissed is the safe default —
      // worst case the banner reappears.
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onBeforeInstallPrompt(event: Event) {
      // Without preventDefault Chrome shows its own mini-infobar and the event
      // cannot be replayed later from our own button.
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;

    await deferred.prompt();
    await deferred.userChoice;

    // The event is single-use; Chrome fires a fresh one if the user declines
    // and remains eligible.
    setDeferred(null);
  }, [deferred]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Dismissal just will not persist. Not worth failing over.
    }
  }, []);

  return {
    canPrompt: Boolean(deferred) && !installed,
    needsIosInstructions: isIos() && !isStandalone() && !installed,
    installed,
    dismissed,
    install,
    dismiss,
  };
}
