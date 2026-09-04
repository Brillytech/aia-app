import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import type { Theme } from "../theme";
import { radius, spacing } from "./tokens";

/**
 * The three ways content sits on the page. Replaces `Card` as the default
 * container.
 *
 * `Card` had one look — a white rounded box with a shadow — and because it was
 * the only container, every screen became a stack of floating boxes regardless
 * of what it held. Settings, Premium, Profile and the exam rules all rendered
 * as the same object. That is an iOS grouped-list idiom, and on the web it
 * reads as a mobile layout that has been widened.
 *
 * The fix is not a nicer card. It is having more than one answer to "how does
 * this content meet the page":
 *
 *   flat    no surface at all. The page ground IS the surface, and grouping
 *           comes from space and dividers. This is the default on the web and
 *           the right answer for most lists.
 *   inset   a recessed step, for content that is genuinely contained — a
 *           nested panel, a code block, a well.
 *   raised  a bordered panel that reads as a distinct object — a plan card, a
 *           tile in a grid. A BORDER, not a shadow: shadows imply physical
 *           layering, which is a touch-interface metaphor.
 *
 * No elevation anywhere. Depth on the web comes from a border and a background
 * step; `elevation()` stays available for the components that still want it,
 * but nothing new should reach for it.
 */
export type SurfaceLevel = "flat" | "inset" | "raised";

export function Surface({
  theme,
  level = "flat",
  padded = false,
  children,
  style,
}: {
  theme: Theme;
  level?: SurfaceLevel;
  /** Adds the standard inner gutter. Off by default so rows can bleed. */
  padded?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        level !== "flat" && styles.rounded,
        level === "inset" && { backgroundColor: theme.cardSoft },
        level === "raised" && {
          backgroundColor: theme.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  rounded: {
    // Capped well below the old scale's top end (34). Large radii read as
    // "app card"; the web reads a panel at 10-12.
    borderRadius: radius.md - 4,
    overflow: "hidden",
  },
  padded: {
    padding: spacing.lg,
  },
});
