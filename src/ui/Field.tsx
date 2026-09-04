import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { motion, noFocusRing, radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * The app's text input.
 *
 * `AuthField` already solved this for the four auth screens, but every other
 * input in the app was hand-rolled: dashboard's goal input, profile's review
 * box, study's search, both edit-profile fields and `Stepper` each built their
 * own. That is why the browser focus-ring bug had to be fixed in six places —
 * there was no one field to fix.
 *
 * This generalises `AuthField` rather than replacing it in place: the auth
 * screens are proven and can migrate when their own redesign lands.
 * Everything new should use this.
 *
 * Focus lives on the container, never the inner input — `noFocusRing`
 * suppresses the browser's own outline, which would otherwise draw a second
 * box inside this one.
 */
export function Field({
  theme,
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secure,
  multiline,
  rows = 4,
  keyboardType,
  autoCapitalize = "none",
  autoComplete,
  editable = true,
  error,
  hint,
  right,
  style,
}: {
  theme: Theme;
  /** Omit for a bare field — a search box, an inline editor. */
  label?: string;
  icon?: IconName;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Renders the reveal toggle and starts masked. */
  secure?: boolean;
  multiline?: boolean;
  /** Visible rows when `multiline`. */
  rows?: number;
  keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  autoComplete?: "email" | "password" | "name" | "tel" | "off";
  editable?: boolean;
  /** Replaces `hint` while set, and tones the border. */
  error?: string;
  /** Quiet helper text under the field. */
  hint?: string;
  /** Extra control on the label row — a "Forgot?" link, a counter. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const dark = theme.mode === "dark";
  const tone = error ? theme.error : focused ? theme.accent : theme.border;

  return (
    <View style={[styles.block, style]}>
      {label || right ? (
        <View style={styles.labelRow}>
          {label ? (
            <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          {
            backgroundColor: focused
              ? withAlpha(theme.accent, dark ? 0.1 : 0.06)
              : theme.input,
            borderColor: tone,
            // Widening rather than glowing keeps the row height stable.
            borderWidth: focused || error ? 1.5 : StyleSheet.hairlineWidth,
            transitionProperty: "background-color, border-color",
            transitionDuration: motion.fast,
          },
          !editable && styles.disabled,
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
          multiline={multiline}
          numberOfLines={multiline ? rows : undefined}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          editable={editable}
          style={[
            styles.input,
            multiline && { height: rows * 20, textAlignVertical: "top" },
            noFocusRing,
            { color: theme.text },
          ]}
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

      {error || hint ? (
        <Text style={[styles.helper, { color: error ? theme.error : theme.muted }]}>
          {error || hint}
        </Text>
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
    minHeight: 50,
  },
  fieldMultiline: {
    alignItems: "flex-start",
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    ...type.bodyLg,
    fontWeight: weight.regular,
    // Android's intrinsic padding would push past the field height.
    paddingVertical: 0,
  },
  disabled: {
    opacity: 0.55,
  },
  helper: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
});
