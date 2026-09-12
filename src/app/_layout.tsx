import { router, Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { clearPopups, dismissPopup, popExternalNotification, useNotificationPopup } from "../notify";
import { maybeNudgeStudy } from "../studyReminder";
import { maybeOfferWeeklyReport } from "../weeklyReport";
import { useInstallPrompt } from "../pwa/useInstallPrompt";
import { useServiceWorker } from "../pwa/useServiceWorker";
import { useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import { AppBanner } from "../ui/AppBanner";
import { useIsDesktop } from "../ui/layout/breakpoints";
import { elevation } from "../ui/tokens";
import { appSurfaces, useThemeChrome } from "../ui/useThemeChrome";

/**
 * Width of the app column on large screens.
 *
 * Every token in this app was tuned for a phone — `layout.screenGutter` is
 * 20, the type scale tops out at 34pt, the tab bar is sized for a thumb. Left
 * unconstrained on a desktop browser those proportions fall apart: at 1440px
 * the sign-in button measured 1378px wide and a form field ran the full
 * viewport.
 *
 * 480 keeps the phone proportions honest rather than trying to reflow a
 * phone-first design into a desktop one. Widening it is a single number here,
 * but everything inside was composed against roughly this measure.
 */
const COLUMN_MAX_WIDTH = 480;

/**
 * Root layout: centres the whole app in a fixed-width column.
 *
 * The absolutely-positioned chrome — tab bar, modals, the pinned header —
 * anchors to this column rather than the viewport, because it sits inside it.
 * That is the reason the constraint belongs here and not inside each screen.
 */
export default function RootLayout() {
  const { theme } = useThemeMode();

  // Above 1024 the column stops being the design and starts being a cage: the
  // sidebar and a two-pane screen cannot live inside 480px. The letterboxing
  // below — surround tint, hairline edges, elevation — exists to make a narrow
  // column look deliberate, and all of it is wrong once the app fills the
  // viewport, so it is switched off as a set rather than piecemeal.
  const desktop = useIsDesktop();

  const { updateReady, applyUpdate } = useServiceWorker();
  const install = useInstallPrompt();

  /**
   * The popup lives at the root because it has to appear over any screen, and
   * because whatever triggers it is usually somewhere else — finishing a
   * practice session, or simply opening the app.
   */
  const popup = useNotificationPopup();
  const pathname = usePathname();

  /**
   * Nothing queued survives the session that queued it.
   *
   * Two triggers, because they catch different things. The auth listener
   * handles an explicit sign-out, which may not navigate anywhere. The route
   * check handles a screen deciding the session is gone and redirecting —
   * that path fires no auth event at all, and it is the one that actually
   * left a weekly report offer sitting over the login form.
   */
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearPopups();
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (pathname?.startsWith("/auth")) clearPopups();
  }, [pathname]);

  /**
   * The three things that can want the screen the moment the app opens.
   *
   * ONE AT MOST. On a Monday morning with nothing done yet and an unread
   * announcement, all three qualify — and three sheets in a row is not a
   * greeting, it is an obstacle course. Each check reports whether it showed
   * anything and the rest are skipped, so the later ones keep their state
   * intact and fire on a subsequent open instead of being spent unseen.
   *
   * Ordered by rarity, because the rarest event has the most to say: a weekly
   * report comes once a week, an announcement now and then, a study nudge
   * potentially twice a day.
   *
   * The practice-streak popup is not here — it answers something the student
   * just did, and arrives later in the session on its own.
   */
  useEffect(() => {
    (async () => {
      if (await maybeOfferWeeklyReport()) return;
      if (await popExternalNotification()) return;
      await maybeNudgeStudy();
    })().catch(() => {
      // Not worth an error surface. Anything missed is either still in the
      // list or still true on the next open.
    });
  }, []);

  // The update notice outranks the install offer: a stale build is a
  // correctness problem, being uninstalled is only a missed nicety. Never both
  // at once — two stacked banners over the tab bar would be worse than either.
  const banner = updateReady
    ? "update"
    : install.dismissed || install.installed
      ? null
      : install.canPrompt
        ? "install"
        : install.needsIosInstructions
          ? "ios"
          : null;

  // Both grounds come from one place now, because the document body and the
  // browser's own chrome have to agree with them — see appSurfaces.
  const { surround, column: columnBg } = appSurfaces(theme);

  // Paints the PWA status bar and the page ground to match. Without it the
  // app was black in dark mode with a cream strip above it and cream slivers
  // at the edges, because index.html's colours never followed the theme.
  useThemeChrome(theme);

  return (
    <View
      style={[styles.backdrop, { backgroundColor: desktop ? columnBg : surround }]}
    >
      <View
        style={[
          styles.column,
          // A second StyleSheet entry rather than inline overrides, so that on
          // phone widths this entry is `false` and the array flattens to
          // exactly `styles.column` — byte-identical markup to before this
          // change, which is what the 390px DOM diff checks.
          desktop && styles.columnDesktop,
          {
            backgroundColor: columnBg,
            borderColor: theme.border,
            ...(desktop ? null : elevation(3, theme.shadow)),
          },
        ]}
      >
        <Stack screenOptions={{ headerShown: false }} />

        {/* Inside the column so it inherits the app's width on desktop rather
            than stretching across the viewport. */}
        {banner === "update" ? (
          <AppBanner
            theme={theme}
            icon="cloud-download-outline"
            title="New version available"
            message="Reload to get the latest."
            actionLabel="Reload"
            onAction={applyUpdate}
            // No dismiss: an update notice that can be waved away forever is
            // the stale-build problem wearing a different hat.
          />
        ) : null}

        {banner === "install" ? (
          <AppBanner
            theme={theme}
            icon="cellphone-arrow-down"
            title="Add to home screen"
            message="Open LASU Scholar like an app."
            actionLabel="Install"
            onAction={install.install}
            onDismiss={install.dismiss}
          />
        ) : null}

        {banner === "ios" ? (
          <AppBanner
            theme={theme}
            icon="export-variant"
            title="Add to home screen"
            // iOS has no install API at all, so the only honest thing to offer
            // is the manual route. "Got it" simply dismisses.
            message="Tap Share, then Add to Home Screen."
            actionLabel="Got it"
            onAction={install.dismiss}
            onDismiss={install.dismiss}
          />
        ) : null}

        {/* The same sheet as every other dialog in the app, wearing the
            notification's own category instead of an AlertType. */}
        <AlertModal
          theme={theme}
          visible={Boolean(popup)}
          type="info"
          kicker={popup?.kicker}
          icon={popup?.icon}
          accent={popup?.accent}
          title={popup?.title || ""}
          message={popup?.message || ""}
          // With somewhere to go, the primary action goes there. Without, the
          // only honest button is one that closes it — the same rule the
          // notifications list follows by hiding its chevron.
          primaryLabel={popup?.href ? popup.actionLabel || "Open" : "Got it"}
          onPrimary={() => {
            const href = popup?.href;
            dismissPopup();
            if (href) router.push(href as any);
          }}
          secondaryLabel={popup?.href ? "Not now" : undefined}
          onSecondary={popup?.href ? dismissPopup : undefined}
          onRequestClose={dismissPopup}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: COLUMN_MAX_WIDTH,
    // Hairline edges give the column a defined boundary on wide screens. On a
    // phone the column is the full width, so both sit off-screen and cost
    // nothing.
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  // Real values, not `undefined` — a later entry in a style array only wins
  // where it actually declares the property.
  columnDesktop: {
    maxWidth: "100%",
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
});
