import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { haptics } from "./haptics";
import { motion, radius, spacing, type, weight } from "./tokens";

/**
 * A pinned notice at the bottom of the app column — used for the update and
 * install prompts.
 *
 * Not `AlertModal`: neither of these is a decision that should block the
 * screen. And not `HintBadge`, which auto-hides after a couple of seconds — an
 * update notice that disappears on its own is exactly the stranding risk this
 * whole step exists to avoid.
 *
 * Sits above the tab bar rather than over it, so it never covers navigation.
 */
export function AppBanner({
  theme,
  icon,
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  theme: Theme;
  icon: IconName;
  title: string;
  message?: string;
  actionLabel: string;
  onAction: () => void;
  /** Omit to make the banner persistent — no dismiss control is rendered. */
  onDismiss?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.base)}
      exiting={FadeOutDown.duration(motion.fast)}
      style={[
        styles.wrap,
        {
          backgroundColor: theme.elevated,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          bottom: Math.max(insets.bottom, spacing.md) + spacing.md,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
        <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {message ? (
          <Text style={[styles.message, { color: theme.muted }]}>{message}</Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => {
          haptics.press();
          onAction();
        }}
        style={[styles.action, { backgroundColor: theme.accent }]}
      >
        <Text style={[styles.actionLabel, { color: theme.onAccent }]}>
          {actionLabel}
        </Text>
      </Pressable>

      {onDismiss ? (
        <Pressable
          onPress={() => {
            haptics.tap();
            onDismiss();
          }}
          hitSlop={10}
          style={styles.dismiss}
        >
          <MaterialCommunityIcons name="close" size={18} color={theme.muted} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    // Above the tab bar and any screen content.
    zIndex: 50,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  title: {
    ...type.body,
    fontWeight: weight.bold,
  },
  message: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: 1,
  },
  action: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  actionLabel: {
    ...type.caption,
    letterSpacing: 0,
  },
  dismiss: {
    marginLeft: -spacing.xs,
  },
});
