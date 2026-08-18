import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { clearOnboardingSeen, ONBOARDING_KEY } from "../onboarding";
import type { Theme } from "../theme";
import { radius, spacing, type, weight } from "./tokens";

/**
 * Dev-only escape hatch for replaying the onboarding slides.
 *
 * Removes just `ONBOARDING_KEY` — no `AsyncStorage.clear()`, so the saved
 * theme, premium flag, practice session and notification prefs all survive —
 * then sends you back to `/`, which re-reads the key on mount and, finding
 * nothing, renders the slides instead of redirecting to login.
 *
 * Guarded three times over: the call site in `auth/login.tsx` renders it
 * behind `__DEV__`, the render below bails on `__DEV__`, and the press
 * handler bails again. Metro replaces `__DEV__` with a literal `false` in
 * release builds, so the minifier folds every one of those branches away.
 */
export function DevOnboardingReset({ theme }: { theme: Theme }) {
  if (!__DEV__) return null;

  async function resetOnboarding() {
    if (!__DEV__) return;

    await clearOnboardingSeen();
    console.log(`[dev] removed AsyncStorage key: ${ONBOARDING_KEY}`);

    router.replace("/");
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={resetOnboarding}
        activeOpacity={0.7}
        style={[styles.button, { borderColor: theme.border }]}
      >
        <MaterialCommunityIcons name="restart" size={14} color={theme.muted2} />
        <Text style={[styles.label, { color: theme.muted2 }]}>
          DEV · Reset onboarding
        </Text>
      </TouchableOpacity>

      <Text style={[styles.key, { color: theme.muted2 }]}>{ONBOARDING_KEY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    ...type.caption,
    fontWeight: weight.semi,
  },
  key: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xs,
    opacity: 0.7,
  },
});
