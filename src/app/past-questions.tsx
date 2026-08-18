import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { category, useThemeMode } from "../theme";
import { PrimaryButton } from "../ui/Button";
import { IconPlate } from "../ui/IconPlate";
import { Screen } from "../ui/Screen";
import { layout, spacing, type, weight } from "../ui/tokens";

/**
 * Placeholder for Past Questions.
 *
 * The previous version was an unstyled `<Text>Coming Soon</Text>` on no
 * background, which rendered black-on-black in dark mode. It is still not
 * routed from anywhere — worth wiring up once the feature exists.
 */
export default function PastQuestionsPage() {
  const { theme } = useThemeMode();

  return (
    <Screen backgroundColor={theme.bg}>
      <View style={styles.wrap}>
        <IconPlate
          theme={theme}
          icon="file-clock-outline"
          color={category.blue}
          size="lg"
        />

        <Text style={[styles.title, { color: theme.text }]}>Past Questions</Text>

        <Text style={[styles.body, { color: theme.muted }]}>
          Past question papers are coming to the app soon.
        </Text>

        <PrimaryButton
          label="Back to studying"
          onPress={() => router.push("/study" as any)}
          color={theme.accent}
          textColor={theme.onAccent}
          style={styles.button}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
    gap: spacing.md,
  },
  title: {
    ...type.title,
    marginTop: spacing.sm,
  },
  body: {
    ...type.body,
    fontWeight: weight.regular,
    textAlign: "center",
    maxWidth: 300,
  },
  button: {
    marginTop: spacing.md,
    alignSelf: "stretch",
    maxWidth: 260,
  },
});
