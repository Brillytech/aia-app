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
import { elevation, motion, radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * Grouped list rows — the native settings/list pattern.
 *
 * This replaces six structurally identical row components that had drifted
 * apart (SettingRow, two different ActionRows, PreferenceRow, NotificationRow,
 * MaterialRow). They were all `[icon][title + subtitle][chevron]` and differed
 * only by accident: icon 44/46/48/51px, radius 16/17, TouchableOpacity vs Card.
 *
 * The shape is: a muted section label OUTSIDE one rounded container, rows
 * inside separated by hairline dividers inset to meet the label. Rows are
 * single-line by default — a `secondary` line is for information the label
 * genuinely cannot carry (a message body, a status), never a restatement.
 */

const GLYPH = 22;
const PLATE = 32;
/** Phone touch target. The desktop value lives in useDensity(). */
const ROW_MIN_HEIGHT = 52;

/**
 * Left inset for the hairline divider, so it starts at the label rather than
 * running under the icon. Pick the one matching the rows in that section.
 */
export const dividerInset = {
  /** Rows with a bare monochrome glyph (utility lists). */
  glyph: spacing.lg + GLYPH + spacing.md,
  /** Rows with a tinted icon plate (content lists, where colour is data). */
  plate: spacing.lg + PLATE + spacing.md,
  /** Rows with no leading icon. */
  none: spacing.lg,
};

export function ListSection({
  theme,
  title,
  footer,
  action,
  inset = dividerInset.glyph,
  plain,
  children,
  style,
}: {
  theme: Theme;
  title?: string;
  footer?: string;
  /** Trailing header link, for when a section shows less than it has. */
  action?: { label: string; onPress: () => void };
  inset?: number;
  /** Drop the card surface and keep only rows + dividers. For groups already
   *  inside a container — a dialog, say — where a second card would nest. */
  plain?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { sectionGap } = useDensity();

  // Children.toArray drops null/undefined/false, so `{cond && <ListRow/>}`
  // yields the right divider count. Do not swap this for children.map.
  const items = Children.toArray(children);

  return (
    <View style={[styles.section, { marginBottom: sectionGap }, style]}>
      {title || action ? (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.muted }]}>
            {title}
          </Text>

          {action ? (
            <Pressable
              onPress={() => {
                haptics.tap();
                action.onPress();
              }}
              hitSlop={10}
              style={styles.sectionAction}
            >
              <Text style={[styles.sectionActionText, { color: theme.accent }]}>
                {action.label}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={16}
                color={theme.accent}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Two views: iOS `overflow: hidden` sets masksToBounds, which clips the
          view's own shadow away. The outer one casts, the inner one clips.
          No border — the group reads by surface contrast plus shadow. */}
      <View
        style={
          plain
            ? undefined
            : [styles.groupShadow, { backgroundColor: theme.card, ...elevation(2, theme.shadow) }]
        }
      >
        <View style={plain ? undefined : styles.group}>
          {items.map((child, index) => (
            <Fragment key={index}>
              {index > 0 ? (
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: theme.border, marginLeft: inset },
                  ]}
                />
              ) : null}
              {child}
            </Fragment>
          ))}
        </View>
      </View>

      {footer ? (
        <Text style={[styles.footer, { color: theme.muted }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

export function ListRow({
  theme,
  label,
  icon,
  iconColor,
  leading,
  value,
  secondary,
  progress,
  pill,
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
  /** Omit for a bare monochrome glyph. Pass a colour only where the colour is
   *  data (a course's category hue), never for decoration. */
  iconColor?: string;
  /** Custom leading element (an avatar, a rank badge). Replaces the icon slot.
   *  Pass a matching `inset` to the parent ListSection so dividers still line
   *  up with the label. */
  leading?: ReactNode;
  /** Trailing value — a version, a count, a current setting. */
  value?: string;
  /** Second line. Informative content only. */
  secondary?: string;
  /** 0–100. Draws a hairline progress bar under the label. */
  progress?: number;
  /** Trailing status chip — "In progress", "Correct", "Answered". */
  pill?: { label: string; color: string };
  /** Custom trailing control (Switch, Segmented). Suppresses the chevron. */
  accessory?: ReactNode;
  /** Force the chevron on or off. Defaults to on for pressable rows. */
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
      <Text style={[styles.label, styles.centered, { color: theme.error }]}>
        {label}
      </Text>
    )
  ) : (
    <>
      {leading ??
        (icon ? (
          iconColor ? (
            <View style={[styles.plate, { backgroundColor: withAlpha(iconColor, 0.12) }]}>
              <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
            </View>
          ) : (
            <MaterialCommunityIcons name={icon} size={GLYPH} color={theme.muted} />
          )
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

        {typeof progress === "number" ? (
          <View style={[styles.track, { backgroundColor: theme.soft }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max(0, Math.min(100, progress))}%`,
                  backgroundColor: iconColor ?? theme.accent,
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      {loading ? <ActivityIndicator size="small" color={theme.muted} /> : null}

      {value && !loading ? (
        <Text style={[styles.value, { color: theme.muted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}

      {pill ? (
        <View
          style={[
            styles.pill,
            { backgroundColor: withAlpha(pill.color, theme.mode === "dark" ? 0.2 : 0.14) },
          ]}
        >
          <Text style={[styles.pillText, { color: pill.color }]} numberOfLines={1}>
            {pill.label}
          </Text>
        </View>
      ) : null}

      {accessory}

      {showChevron ? (
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted2} />
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
      style={rowStyle}
    >
      {/* A native row highlights on press; it does not scale like a card. The
          highlight is its own layer so it can fade via a CSS transition —
          Pressable's own `pressed` style flips instantly. */}
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
  section: {
    marginBottom: spacing.xxxl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
    marginLeft: spacing.xs,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing.xs,
  },
  sectionActionText: {
    ...type.caption,
    fontWeight: weight.semi,
    letterSpacing: 0,
  },
  groupShadow: {
    borderRadius: radius.md,
  },
  group: {
    borderRadius: radius.md,
    // Clips the pressed-row highlight to the container's corners.
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  footer: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  centeredRow: {
    justifyContent: "center",
  },
  centered: {
    textAlign: "center",
  },
  disabled: {
    opacity: 0.45,
  },
  plate: {
    width: PLATE,
    height: PLATE,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    ...type.bodyLg,
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
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
  pillText: {
    ...type.micro,
    letterSpacing: 0.2,
  },
  track: {
    height: 3,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
});
