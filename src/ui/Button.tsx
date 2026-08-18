import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { lightTheme } from "../theme";
import { haptics } from "./haptics";
import { usePressScale } from "./motion";
import { radius, spacing, type, weight } from "./tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({
  label,
  onPress,
  icon,
  color,
  textColor,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  /** Defaults to the light-theme accent; pass `theme.accent` to track the theme. */
  color?: string;
  textColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { style: pressStyle, onPressIn, onPressOut } = usePressScale();

  const background = color ?? lightTheme.accent;
  const foreground = textColor ?? lightTheme.onAccent;

  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={() => {
        haptics.press();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.primary,
        { backgroundColor: background, opacity: disabled ? 0.6 : 1 },
        pressStyle,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.primaryLabel, { color: foreground }]}>{label}</Text>
    </AnimatedPressable>
  );
}

export function IconButton({
  onPress,
  children,
  backgroundColor,
  borderColor,
  size = 36,
  style,
}: {
  onPress: () => void;
  children: ReactNode;
  backgroundColor: string;
  borderColor: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { style: pressStyle, onPressIn, onPressOut } = usePressScale(0.9);

  return (
    <AnimatedPressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2.6,
          backgroundColor,
          borderColor,
        },
        pressStyle,
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    // Keeps the tap target at the platform minimum regardless of label size.
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  primaryLabel: {
    ...type.body,
    fontWeight: weight.bold,
  },
  iconButton: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
});
