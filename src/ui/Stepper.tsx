import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * A number field that looks like one.
 *
 * A right-aligned bare number reads as a *value*, not an editable control —
 * so this gives it a filled well plus visible − / + affordances. The number
 * itself stays a TextInput, so typing still works for large jumps while
 * tapping handles the common small adjustments.
 */
export function Stepper({
  theme,
  color,
  value,
  onChangeText,
  step = 1,
  min = 0,
  max = 999,
  placeholder,
}: {
  theme: Theme;
  /** Tint for the control; defaults to the accent. */
  color?: string;
  value: string;
  onChangeText: (next: string) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const tone = color ?? theme.accent;
  const dark = theme.mode === "dark";

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  function nudge(delta: number) {
    haptics.select();
    const current = Number(String(value).replace(/[^0-9]/g, "")) || 0;
    onChangeText(String(clamp(current + delta)));
  }

  const atMin = (Number(value) || 0) <= min;
  const atMax = (Number(value) || 0) >= max;

  return (
    <View style={[styles.wrap, { backgroundColor: withAlpha(tone, dark ? 0.18 : 0.11) }]}>
      <Pressable
        onPress={() => nudge(-step)}
        disabled={atMin}
        hitSlop={6}
        style={[styles.button, atMin && styles.disabled]}
      >
        <MaterialCommunityIcons name="minus" size={18} color={tone} />
      </Pressable>

      <TextInput
        value={value}
        onChangeText={(next) => onChangeText(next.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        selectTextOnFocus
        style={[styles.input, { color: theme.text }]}
      />

      <Pressable
        onPress={() => nudge(step)}
        disabled={atMax}
        hitSlop={6}
        style={[styles.button, atMax && styles.disabled]}
      >
        <MaterialCommunityIcons name="plus" size={18} color={tone} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.3,
  },
  input: {
    minWidth: 42,
    textAlign: "center",
    ...type.bodyLg,
    fontWeight: weight.bold,
    // Android's intrinsic TextInput padding would blow past the row height.
    paddingVertical: 0,
  },
});
