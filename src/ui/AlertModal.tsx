import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AlertType, Theme } from "../theme";
import { alertColor, alertIcon } from "./alerts";
import { haptics } from "./haptics";
import { motion, radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * The app's confirm/inform dialog, presented as a bottom sheet.
 *
 * It used to be a centred box with two small side-by-side buttons — the
 * shape a web dialog takes, and the reason these read as a website. Phones
 * put decisions at the bottom, within thumb reach, with full-width targets.
 *
 * Still purely presentational: each screen keeps its own state and handlers
 * and passes them in, so adopting this changed no behaviour.
 */
export function AlertModal({
  theme,
  visible,
  type: alertType,
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onRequestClose,
}: {
  theme: Theme;
  visible: boolean;
  type: AlertType;
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Android hardware back, and tap-outside. */
  onRequestClose?: () => void;
}) {
  const color = alertColor(alertType, theme);
  const insets = useSafeAreaInsets();
  const dark = theme.mode === "dark";

  // Tapping the backdrop is the same intent as cancelling. Falls back to the
  // secondary action when the screen didn't supply an explicit close.
  const dismiss = onRequestClose ?? onSecondary;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.root}>
        <Animated.View
          entering={FadeIn.duration(motion.fast)}
          exiting={FadeOut.duration(motion.fast)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable
            onPress={dismiss}
            disabled={!dismiss}
            style={[styles.backdrop, { backgroundColor: theme.overlay }]}
          />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.springify().damping(19).stiffness(190)}
          exiting={SlideOutDown.duration(motion.base)}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />

          <View style={[styles.iconWrap, { backgroundColor: withAlpha(color, dark ? 0.2 : 0.13) }]}>
            <MaterialCommunityIcons name={alertIcon[alertType]} size={26} color={color} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.muted }]}>{message}</Text>

          {/* Stacked and full-width rather than two small buttons side by
              side — bigger targets, and the primary action sits closest to
              the thumb. */}
          <Pressable
            onPress={() => {
              haptics.press();
              onPrimary();
            }}
            style={[styles.primary, { backgroundColor: color }]}
          >
            <Text style={[styles.primaryLabel, { color: theme.onAccent }]}>
              {primaryLabel}
            </Text>
          </Pressable>

          {secondaryLabel && onSecondary ? (
            <Pressable
              onPress={() => {
                haptics.tap();
                onSecondary();
              }}
              style={styles.secondary}
            >
              <Text style={[styles.secondaryLabel, { color: theme.muted }]}>
                {secondaryLabel}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    alignItems: "center",
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.xl,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    ...type.title,
    textAlign: "center",
  },
  message: {
    ...type.body,
    fontWeight: weight.regular,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  primary: {
    alignSelf: "stretch",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primaryLabel: {
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  secondary: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    minHeight: 48,
  },
  secondaryLabel: {
    ...type.body,
    fontWeight: weight.medium,
  },
});
