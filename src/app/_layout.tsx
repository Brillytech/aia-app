import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useInstallPrompt } from "../pwa/useInstallPrompt";
import { useServiceWorker } from "../pwa/useServiceWorker";
import { useThemeMode } from "../theme";
import { AppBanner } from "../ui/AppBanner";
import { useIsDesktop } from "../ui/layout/breakpoints";
import { elevation, shade } from "../ui/tokens";

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
  const dark = theme.mode === "dark";

  // Above 1024 the column stops being the design and starts being a cage: the
  // sidebar and a two-pane screen cannot live inside 480px. The letterboxing
  // below — surround tint, hairline edges, elevation — exists to make a narrow
  // column look deliberate, and all of it is wrong once the app fills the
  // viewport, so it is switched off as a set rather than piecemeal.
  const desktop = useIsDesktop();

  const { updateReady, applyUpdate } = useServiceWorker();
  const install = useInstallPrompt();

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

  // The surround always recedes and the column always reads as the lit
  // surface — the same depth model in both themes.
  //
  // The first attempt tinted the surround with `theme.text`, which inverted
  // between modes: measured, it produced a surround DARKER than the column in
  // light (#efebe4 vs #fbf7ef) but LIGHTER than it in dark (#272c34 vs
  // #050b16). Content receded on dark and advanced on light, which is why the
  // dark surround read wrong.
  //
  // In dark there is no room to go darker — the page ground is already
  // #050B16 — so depth comes from lifting the column instead of sinking the
  // surround, plus a shadow that works on both.
  const surround = dark ? shade(theme.bg, -0.45) : shade(theme.bg, -0.06);
  const columnBg = dark ? shade(theme.bg, 0.05) : theme.bg;

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
