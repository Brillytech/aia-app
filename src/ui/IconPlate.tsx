import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { radius, withAlpha } from "./tokens";

/**
 * Soft rounded-square icon container — the app's single icon treatment for
 * content surfaces.
 *
 * Practice alone had twelve distinct plate specs across ten radii, including
 * three near-duplicate pairs (48/r17 vs 48/r18, 52/r18 vs 52/r19, and two
 * identical 42/r21 styles under different names). This is three sizes.
 *
 * `color` should be a `category` hue — from `subjectColor()` where the subject
 * is known. Use this where colour *identifies* something. Utility rows
 * (settings, profile actions) deliberately keep bare glyphs, because there the
 * colour would be decoration.
 */

const SIZES = {
  sm: { box: 32, radius: radius.sm, glyph: 18 },
  md: { box: 44, radius: radius.md, glyph: 24 },
  lg: { box: 56, radius: radius.lg, glyph: 30 },
} as const;

export function IconPlate({
  theme,
  icon,
  color,
  size = "sm",
  style,
}: {
  theme: Theme;
  icon: IconName;
  /** A `category` hue. Defaults to the accent. */
  color?: string;
  size?: keyof typeof SIZES;
  style?: StyleProp<ViewStyle>;
}) {
  const spec = SIZES[size];
  const hue = color ?? theme.accent;

  return (
    <View
      style={[
        styles.plate,
        {
          width: spec.box,
          height: spec.box,
          borderRadius: spec.radius,
          // Dark needs a stronger tint to separate from the surface behind it.
          backgroundColor: withAlpha(hue, theme.mode === "dark" ? 0.18 : 0.12),
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={spec.glyph} color={hue} />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: "center",
    justifyContent: "center",
  },
});
