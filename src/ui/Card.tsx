import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { usePressScale } from "./motion";
import { elevation as elevationPreset, radius, withAlpha } from "./tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Shared card surface. Every card-like block in the app (goal card, continue
 * card, course card, material row, etc.) should render through this instead
 * of a one-off `<View style={{ borderRadius: 30, ... }}>` — that's what kept
 * every screen's cards subtly different from each other.
 *
 * Pass `onPress` to get automatic press-scale + haptic feedback; omit it for
 * a static, non-interactive card.
 */
export function Card({
  children,
  onPress,
  backgroundColor,
  borderColor,
  shadowColor,
  tone,
  theme,
  radiusSize = "xl",
  elevationLevel = 2,
  bordered,
  style,
  hapticStyle = "tap",
}: {
  children: ReactNode;
  onPress?: () => void;
  backgroundColor: string;
  borderColor: string;
  shadowColor: string;
  /**
   * Fill the card with a soft wash of this colour instead of a neutral
   * surface — pass a `category` hue from `subjectColor()`.
   *
   * This is what stops content from reading as a stack of grey boxes, and it
   * is also what makes light mode work: `card #FFFFFF` on `bg #FBF7EF` is a
   * 3% difference that needs a shadow to be visible at all, whereas a tint
   * separates on its own. Requires `theme`.
   */
  tone?: string;
  theme?: Theme;
  radiusSize?: keyof typeof radius;
  elevationLevel?: 0 | 1 | 2 | 3;
  /** Draw a hairline outline. Off by default — depth comes from surface
   *  contrast plus shadow, not a drawn line. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  hapticStyle?: "tap" | "press" | "none";
}) {
  const { style: pressStyle, onPressIn, onPressOut } = usePressScale(0.975);

  const dark = theme?.mode === "dark";
  const toned = tone && theme;

  const base = [
    {
      backgroundColor: toned ? withAlpha(tone, dark ? 0.16 : 0.09) : backgroundColor,
      borderRadius: radius[radiusSize],
      ...(toned
        ? // A toned card is defined by its own colour, so it takes a matching
          // hairline instead of a shadow — stacking a drop shadow under a
          // tint just muddies it.
          { borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(tone, dark ? 0.3 : 0.22) }
        : bordered
          ? { borderWidth: StyleSheet.hairlineWidth, borderColor }
          : null),
      ...elevationPreset(toned ? 0 : elevationLevel, shadowColor),
    },
    style,
  ];

  if (!onPress) {
    return <Animated.View style={base}>{children}</Animated.View>;
  }

  return (
    <AnimatedPressable
      onPress={() => {
        if (hapticStyle !== "none") haptics[hapticStyle]();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[base, pressStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

