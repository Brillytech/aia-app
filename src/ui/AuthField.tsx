import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { motion, radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * The app's auth input.
 *
 * The four auth screens each hand-rolled their own field with no focus state
 * at all — you couldn't tell which input you were typing into. This one lifts
 * and tints its border on focus, so the active field is unambiguous, and it
 * owns the password reveal so that logic stops being copy-pasted.
 */
export function AuthField({
  theme,
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  autoCapitalize = "none",
  autoComplete,
  error,
  right,
}: {
  theme: Theme;
  label: string;
  icon?: IconName;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Renders the reveal toggle and starts masked. */
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  autoComplete?: "email" | "password" | "name" | "off";
  error?: string;
  /** Extra control on the label row — "Forgot?", for instance. */
  right?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const dark = theme.mode === "dark";
  const tone = error ? theme.error : focused ? theme.accent : theme.border;

  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
        {right}
      </View>

      <Animated.View
        style={[
          styles.field,
          {
            backgroundColor: focused
              ? withAlpha(theme.accent, dark ? 0.1 : 0.06)
              : theme.input,
            borderColor: tone,
            // Widening the border on focus rather than adding a glow keeps
            // the row height stable — a glow would shift the layout.
            borderWidth: focused || error ? 1.5 : StyleSheet.hairlineWidth,
            transitionProperty: "background-color, border-color",
            transitionDuration: motion.fast,
          },
        ]}
      >
        {icon ? (
          <MaterialCommunityIcons
            name={icon}
            size={20}
            color={focused ? theme.accent : theme.muted}
          />
        ) : null}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          secureTextEntry={secure && !revealed}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          style={[styles.input, { color: theme.text }]}
        />

        {secure ? (
          <Pressable onPress={() => setRevealed((prev) => !prev)} hitSlop={10}>
            <MaterialCommunityIcons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={theme.muted}
            />
          </Pressable>
        ) : null}
      </Animated.View>

      {error ? (
        <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  label: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    // 50 rather than 54 — four of these stack up on the signup form, and it
    // still clears the 44pt minimum touch target comfortably.
    minHeight: 50,
  },
  input: {
    flex: 1,
    ...type.bodyLg,
    fontWeight: weight.regular,
    // Android's intrinsic padding would push past the field height.
    paddingVertical: 0,
  },
  error: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
});
