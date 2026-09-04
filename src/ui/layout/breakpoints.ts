import { Platform, StyleSheet, useWindowDimensions } from "react-native";
import { spacing } from "../tokens";

/**
 * Width at which the app stops being a phone-in-a-column and becomes a desktop
 * layout: sidebar navigation, multi-column screens, side-by-side panes.
 *
 * This is deliberately a long way above `PHONE_MAX_WIDTH` (480, in
 * ./../density.ts). Those two numbers answer different questions:
 *
 *   480  — "is this still a thumb?"   -> row heights, section rhythm
 *   1024 — "is this a desktop?"       -> whole layout structure
 *
 * Two panes at 600px would be worse than one, which is why the density
 * breakpoint is not reused here.
 *
 * DEFINED ONCE. Every desktop branch in the app reads `useIsDesktop()` rather
 * than comparing widths itself, so there is exactly one place where the phone
 * layout can be turned off — and it defaults to the phone.
 */
export const DESKTOP_MIN_WIDTH = 1024;

/**
 * True only on web, and only above `DESKTOP_MIN_WIDTH`.
 *
 * The `Platform.OS` half matters: the native app is frozen but still in the
 * tree, and a large tablet reports a width above 1024. Gating on web as well
 * means native can never fall into a desktop branch that has never been run
 * there, regardless of screen size.
 */
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}

const insetStyles = StyleSheet.create({
  /**
   * Overrides the `layout.tabBarInset` (150) that every scrolling screen adds
   * to clear the floating tab bar. With the bar on the left there is nothing
   * below the content to clear, and 150px of empty scroll looks like a bug.
   */
  desktop: {
    paddingBottom: spacing.xxl,
  },
});

/**
 * Bottom padding override for a screen's scroll container on desktop.
 *
 * Returns `null` below the breakpoint — NOT a style with the phone value in
 * it. That distinction is the whole point: `[styles.scroll, null]` flattens to
 * exactly `styles.scroll`, so phone markup is unchanged rather than merely
 * equivalent. Spread it as the last entry:
 *
 *     contentContainerStyle={[styles.scroll, contentInset]}
 */
export function useContentInset() {
  return useIsDesktop() ? insetStyles.desktop : null;
}
