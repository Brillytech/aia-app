import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { elevation, radius, spacing, type, weight } from "./tokens";

/**
 * Inline segmented control — a compact native answer to a small set of
 * mutually exclusive choices.
 *
 * Replaces the two 150px-tall theme tiles in settings (which signalled
 * selection three times over: border colour, a check badge, and a modal) and
 * the hand-rolled range tabs in leaderboard.
 */
export function Segmented<T extends string>({
  theme,
  value,
  options,
  onChange,
  stretch,
  style,
}: {
  theme: Theme;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Divide the full width evenly between segments, for a standalone control.
   *  Omit when the control sits inline in a row, where content width is right. */
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.track, { backgroundColor: theme.soft }, style]}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => {
              haptics.select();
              onChange(option.value);
            }}
            style={[
              styles.segment,
              stretch && styles.stretched,
              active && {
                backgroundColor: theme.card,
                ...elevation(1, theme.shadow),
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? theme.text : theme.muted },
                active && styles.activeLabel,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: radius.sm,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  stretched: {
    flex: 1,
  },
  label: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
  },
  activeLabel: {
    fontWeight: weight.semi,
  },
});
