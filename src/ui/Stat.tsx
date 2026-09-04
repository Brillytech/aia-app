import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import type { Theme } from "../theme";
import { spacing, type, weight } from "./tokens";

/**
 * A number and what it means. One primitive for a shape the app currently
 * re-implements about ten times.
 *
 * The existing versions, all structurally identical and all slightly
 * different: `HeadlineStat`, `InfoMini`, `ResultMetric` and `PaletteStat` in
 * exam.tsx; `HeadlineStat`, `Metric` and `NavigatorStat` in practice.tsx;
 * `StatBlock` in profile.tsx; `WeekStat` in dashboard.tsx. They differ in type
 * step, label case, gap and colour default — not in what they do.
 *
 * Sizes are named for their job rather than for a t-shirt scale:
 *
 *   hero   the one number a results screen is about
 *   major  a dashboard or profile headline
 *   minor  a supporting figure in a group
 */
export type StatSize = "hero" | "major" | "minor";

const VALUE_STYLE: Record<StatSize, object> = {
  hero: type.hero,
  major: type.display,
  minor: type.title,
};

export function Stat({
  theme,
  value,
  label,
  size = "minor",
  color,
  align = "start",
  style,
}: {
  theme: Theme;
  value: string | number;
  label: string;
  size?: StatSize;
  /** Only when the colour is data — a pass/fail tone, a category hue. */
  color?: string;
  align?: "start" | "center";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[align === "center" && styles.centered, style]}>
      <Text
        style={[
          VALUE_STYLE[size],
          { color: color ?? theme.text },
          align === "center" && styles.centerText,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>

      <Text
        style={[
          styles.label,
          { color: theme.muted },
          align === "center" && styles.centerText,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
  },
  centerText: {
    textAlign: "center",
  },
  label: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
});
