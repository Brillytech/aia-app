import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * A small self-dismissing pill for naming something the UI shows but never
 * explains — the streak counter being the case that prompted it. A tap says
 * what the thing is and gets out of the way, which a modal cannot do without
 * making the user pay a dismissal for their curiosity.
 *
 * Overlays the top of the screen rather than occupying layout space, so
 * showing one never shifts the content underneath it.
 */
export function HintBadge({
  theme,
  visible,
  icon,
  label,
  detail,
  tint,
  durationMs = 2800,
  onHide,
}: {
  theme: Theme;
  visible: boolean;
  icon: IconName;
  label: string;
  detail?: string;
  /** Defaults to the theme accent. */
  tint?: string;
  durationMs?: number;
  onHide: () => void;
}) {
  const insets = useSafeAreaInsets();
  const color = tint ?? theme.accent;

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(onHide, durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, onHide]);

  if (!visible) return null;

  return (
    // A plain fade-and-drop, not `SlideInUp.springify()`. The spring overshot
    // well past its resting place and snapped back, which read as the badge
    // falling down the screen rather than appearing under the header.
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(220)}
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + spacing.md }]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.card,
            borderColor: withAlpha(color, theme.mode === "dark" ? 0.4 : 0.28),
            shadowColor: theme.shadow,
          },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={15} color={color} />
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>

        {detail ? (
          <Text style={[styles.detail, { color: theme.muted }]}>{detail}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: {
    ...type.caption,
    fontWeight: weight.bold,
  },
  detail: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
});
