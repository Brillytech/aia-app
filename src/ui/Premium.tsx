import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { category, Theme } from "../theme";
import { haptics } from "./haptics";
import { radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * Shared locked-state treatment, so a screen gating a feature later doesn't
 * invent its own.
 *
 * `ListRow` already takes a `pill` prop, so a locked *row* needs nothing from
 * here — use `pill={{ label: "Premium", color: category.yellow }}`. These two
 * cover the cases a row can't: a badge beside a non-row control, and a whole
 * blocked region.
 */

const PREMIUM_TONE = category.yellow;

export function PremiumBadge({
  theme,
  label = "Premium",
  style,
}: {
  theme: Theme;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = theme.mode === "dark";

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: withAlpha(PREMIUM_TONE, dark ? 0.24 : 0.16) },
        style,
      ]}
    >
      <MaterialCommunityIcons name="crown" size={12} color={PREMIUM_TONE} />
      <Text style={[styles.badgeText, { color: PREMIUM_TONE }]}>{label}</Text>
    </View>
  );
}

export function PremiumGate({
  theme,
  title,
  note,
  onUpgrade,
  children,
  style,
}: {
  theme: Theme;
  title: string;
  note?: string;
  onUpgrade?: () => void;
  /** The blocked content. Rendered dimmed and non-interactive behind the
   *  overlay, so the user can see what they'd get rather than a blank box. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = theme.mode === "dark";

  return (
    <View style={[styles.gate, { backgroundColor: theme.card }, style]}>
      {children ? (
        <View pointerEvents="none" style={styles.gateContent}>
          {children}
        </View>
      ) : null}

      <View
        style={[
          styles.gateOverlay,
          { backgroundColor: withAlpha(theme.card, children ? 0.86 : 1) },
        ]}
      >
        <View
          style={[
            styles.gateIcon,
            { backgroundColor: withAlpha(PREMIUM_TONE, dark ? 0.22 : 0.14) },
          ]}
        >
          <MaterialCommunityIcons name="lock-outline" size={22} color={PREMIUM_TONE} />
        </View>

        <Text style={[styles.gateTitle, { color: theme.text }]}>{title}</Text>

        {note ? (
          <Text style={[styles.gateNote, { color: theme.muted }]}>{note}</Text>
        ) : null}

        {onUpgrade ? (
          <Pressable
            onPress={() => {
              haptics.tap();
              onUpgrade();
            }}
            style={[styles.gateButton, { backgroundColor: PREMIUM_TONE }]}
          >
            <MaterialCommunityIcons name="crown" size={16} color={theme.onAccent} />
            <Text style={[styles.gateButtonText, { color: theme.onAccent }]}>
              Go Premium
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...type.micro,
    letterSpacing: 0.3,
  },
  gate: {
    borderRadius: radius.lg,
    overflow: "hidden",
    minHeight: 150,
  },
  gateContent: {
    opacity: 0.35,
  },
  gateOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  gateIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  gateTitle: {
    ...type.bodyLg,
    fontWeight: weight.semi,
    textAlign: "center",
  },
  gateNote: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    textAlign: "center",
  },
  gateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
    minHeight: 40,
  },
  gateButtonText: {
    ...type.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
  },
});
