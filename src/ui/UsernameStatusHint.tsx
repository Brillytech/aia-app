import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import type { UsernameStatus } from "../username";
import { spacing, type, weight } from "./tokens";

/**
 * Live availability read-out for the username field, sized for AuthField's
 * label row.
 *
 * Only the two states the field itself cannot show appear here. "invalid" and
 * "taken" already surface as the field's own error text, and repeating them
 * beside the label would say the same thing twice on one row.
 */
export function UsernameStatusHint({
  theme,
  status,
}: {
  theme: Theme;
  status: UsernameStatus;
}) {
  if (status === "checking") {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={theme.muted} />
        <Text style={[styles.text, { color: theme.muted }]}>Checking</Text>
      </View>
    );
  }

  if (status === "available") {
    return (
      <View style={styles.row}>
        <MaterialCommunityIcons name="check-circle" size={14} color={theme.success} />
        <Text style={[styles.text, { color: theme.success }]}>Available</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  text: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
  },
});
