import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import type { Theme } from "../../theme";
import { spacing } from "../tokens";

/**
 * Two panes side by side: a fixed-width rail and a flexible main area.
 *
 * This is the layout half of a responsive screen, not the switch. The screen
 * decides WHEN to use it, via `useBreakpoint(n)` with its own number, because
 * the width at which content stops fitting is a property of the content.
 * Keeping the switch in the screen also keeps the two branches visible next to
 * each other, rather than hidden inside a component that silently renders
 * something different.
 *
 * Flexbox, not grid: react-native-web has no CSS Grid through RN styles. A
 * fixed-basis rail plus `flex: 1` main is the same result for a two-column
 * layout, and it works on native.
 *
 * Both panes stretch to the row's height so the divider runs the full way
 * down. Either pane may scroll internally; this does not impose one, because
 * a short pane should not gain a scrollbar to match a long one.
 */
export function SplitPane({
  theme,
  rail,
  railWidth = 220,
  side = "start",
  divider = true,
  gap = spacing.xxxl,
  children,
  style,
}: {
  theme: Theme;
  /** The fixed-width pane — a section nav, or a secondary panel. */
  rail: ReactNode;
  railWidth?: number;
  /** Which side the rail sits on. A nav leads; a secondary panel follows. */
  side?: "start" | "end";
  divider?: boolean;
  gap?: number;
  /** The flexible pane. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const railPane = (
    <View style={{ width: railWidth, flexGrow: 0, flexShrink: 0 }}>{rail}</View>
  );

  const line = divider ? (
    <View style={[styles.divider, { backgroundColor: theme.border }]} />
  ) : null;

  return (
    <View style={[styles.row, { gap }, style]}>
      {side === "start" ? railPane : null}
      {side === "start" ? line : null}

      {/* minWidth 0 so long content inside can shrink and wrap instead of
          forcing the row wider than the viewport — the flexbox default of
          `min-width: auto` is the usual cause of a page that scrolls
          sideways. */}
      <View style={styles.main}>{children}</View>

      {side === "end" ? line : null}
      {side === "end" ? railPane : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  },
});
