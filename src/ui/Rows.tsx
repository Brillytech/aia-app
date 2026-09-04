import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Children, Fragment, ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { useDensity } from "./density";
import { haptics } from "./haptics";
import { motion, radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * Flat, divider-separated rows. The web counterpart to `List`.
 *
 * `ListSection` wraps its rows in a rounded, shadowed card floating on the
 * page. That is the iOS grouped-table look, and it is why every screen in this
 * app reads the same: the container was doing the talking, not the content.
 *
 * Here the page ground is the surface. A group is a quiet label, a hairline
 * above and below, and rows separated by hairlines — the pattern every
 * settings page on the web uses, because it scales to a wide viewport without
 * turning into a row of floating boxes.
 *
 * `List` is NOT deprecated by this. Screens that genuinely present discrete
 * objects still want a real container; those should reach for `Surface` with
 * `level="raised"`. This is for lists.
 */

const GLYPH = 20;

export function Rows({
  theme,
  title,
  footer,
  action,
  children,
  style,
}: {
  theme: Theme;
  title?: string;
  footer?: string;
  /** Trailing header link, for a group that shows less than it has. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { sectionGap } = useDensity();

  // Children.toArray drops null/false, so `{cond && <Row/>}` yields the right
  // divider count. Do not swap for children.map.
  const items = Children.toArray(children);

  return (
    <View style={[{ marginBottom: sectionGap }, style]}>
      {title || action ? (
        <View style={styles.header}>
          {title ? (
            <Text style={[styles.headerTitle, { color: theme.muted }]}>{title}</Text>
          ) : (
            <View />
          )}

          {action ? (
            <Pressable
              onPress={() => {
                haptics.tap();
                action.onPress();
              }}
              hitSlop={10}
              style={styles.headerAction}
            >
              <Text style={[styles.headerActionText, { color: theme.accent }]}>
                {action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Rules top and bottom rather than a box. The group is bounded, but the
          page ground still runs behind it. */}
      <View style={[styles.rule, { backgroundColor: theme.border }]} />

      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          ) : null}
          {child}
        </Fragment>
      ))}

      <View style={[styles.rule, { backgroundColor: theme.border }]} />

      {footer ? (
        <Text style={[styles.footer, { color: theme.muted }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

export function Row({
  theme,
  label,
  icon,
  iconColor,
  leading,
  value,
  secondary,
  accessory,
  chevron,
  onPress,
  destructive,
  disabled,
  loading,
  style,
}: {
  theme: Theme;
  label: string;
  icon?: IconName;
  /** Only where the colour is data. Decoration belongs nowhere. */
  iconColor?: string;
  /** Custom leading element — an avatar, a rank. Replaces the icon slot. */
  leading?: ReactNode;
  /** Trailing value — a version, a count, the current setting. */
  value?: string;
  /** Second line. Information the label genuinely cannot carry. */
  secondary?: string;
  /** Custom trailing control (Segmented, Switch). Suppresses the chevron. */
  accessory?: ReactNode;
  /** Force the chevron. Defaults to on for pressable, non-destructive rows. */
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { rowMinHeight } = useDensity();
  const [pressed, setPressed] = useState(false);

  const showChevron =
    chevron ?? (!!onPress && !destructive && !accessory && !loading);

  const content = destructive ? (
    loading ? (
      <ActivityIndicator size="small" color={theme.error} />
    ) : (
      <Text style={[styles.label, { color: theme.error }]}>{label}</Text>
    )
  ) : (
    <>
      {leading ??
        (icon ? (
          <MaterialCommunityIcons
            name={icon}
            size={GLYPH}
            // Icons inherit text colour unless the colour carries meaning.
            // The tinted plates were five different hues on five consecutive
            // rows, which reads as a system while encoding nothing.
            color={iconColor ?? theme.muted}
          />
        ) : null)}

      <View style={styles.labelWrap}>
        <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
          {label}
        </Text>

        {secondary ? (
          <Text style={[styles.secondary, { color: theme.muted }]} numberOfLines={2}>
            {secondary}
          </Text>
        ) : null}
      </View>

      {loading ? <ActivityIndicator size="small" color={theme.muted} /> : null}

      {value && !loading ? (
        <Text style={[styles.value, { color: theme.muted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}

      {accessory}

      {showChevron ? (
        <MaterialCommunityIcons name="chevron-right" size={18} color={theme.muted2} />
      ) : null}
    </>
  );

  const rowStyle = [
    styles.row,
    { minHeight: rowMinHeight },
    destructive && styles.centeredRow,
    disabled && styles.disabled,
    style,
  ];

  if (!onPress || disabled || loading) {
    return <View style={rowStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      // `hovered` is supplied by react-native-web and is undefined on native,
      // where this collapses to no style. A pointer needs to know a row is
      // live before committing a click; a finger finds out by touching it.
      style={({ hovered }: any) => [
        ...rowStyle,
        hovered ? { backgroundColor: withAlpha(theme.text, 0.04) } : null,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.soft,
            opacity: pressed ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: motion.fast,
          },
        ]}
      />

      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  headerTitle: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
  },
  headerAction: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerActionText: {
    ...type.caption,
    fontWeight: weight.semi,
    letterSpacing: 0,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // Full bleed, not inset to the label. An inset divider is a native
    // convention that exists because rows sit inside a card; without the card
    // it just looks misaligned.
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    // No horizontal padding: the row spans its container and the page gutter
    // does the insetting. This is what lets a row sit flush in a pane.
    paddingVertical: spacing.md,
  },
  centeredRow: {
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.45,
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    ...type.body,
    fontWeight: weight.medium,
  },
  secondary: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: 2,
  },
  value: {
    ...type.body,
    fontWeight: weight.regular,
  },
  footer: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.sm,
  },
  // Kept for callers that want a chip in the accessory slot.
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
});
