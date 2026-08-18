import { ReactNode, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { motion, radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * A folder: a labelled flap above a toned body.
 *
 * Courses are containers — they hold topics, materials and questions — so a
 * folder says what they are far better than another rounded rectangle does.
 * The flap carries the course code, which means the code stops competing with
 * the title for space inside the body.
 *
 * Pressing lifts the whole folder and lifts the flap slightly further, so it
 * reads as opening rather than merely highlighting. Driven by a CSS transition
 * rather than shared values, so it stays clear of the `react-hooks/immutability`
 * rule that plain-callback `.value` writes trip.
 */
export function Folder({
  theme,
  tone,
  label,
  onPress,
  children,
  style,
}: {
  theme: Theme;
  /** A `category` hue — from `subjectColor()`. */
  tone: string;
  /** Text in the flap. Kept short: a course code, not a title. */
  label: string;
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  const dark = theme.mode === "dark";

  const body = withAlpha(tone, dark ? 0.16 : 0.09);
  const bodyLift = withAlpha(tone, dark ? 0.22 : 0.14);
  const flap = withAlpha(tone, dark ? 0.28 : 0.17);
  const edge = withAlpha(tone, dark ? 0.3 : 0.2);

  const content = (
    <Animated.View style={[styles.wrap, style]}>
      {/* A sheet peeking out of the folder. It slides up and fans slightly as
          the folder opens — the detail that sells the metaphor, because real
          folders reveal their contents rather than just tilting. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sheet,
          {
            backgroundColor: theme.card,
            borderColor: edge,
            transform: [
              { translateY: pressed ? -10 : 0 },
              { rotate: pressed ? "-1.6deg" : "0deg" },
            ],
            opacity: pressed ? 1 : 0,
            transitionProperty: "transform, opacity",
            transitionDuration: motion.base,
          },
        ]}
      />

      {/* The flap hinges backward on its bottom edge, in perspective, so it
          pivots at the crease rather than around its own centre. */}
      <Animated.View
        style={[
          styles.flap,
          {
            backgroundColor: flap,
            borderColor: edge,
            transform: [
              { perspective: 480 },
              { rotateX: pressed ? "-42deg" : "0deg" },
              { translateY: pressed ? -1 : 0 },
            ],
            transitionProperty: "transform",
            transitionDuration: motion.base,
          },
        ]}
      >
        <Text style={[styles.flapText, { color: tone }]}>{label}</Text>
      </Animated.View>

      {/* The body rises to meet the opening flap and deepens its tint, which
          reads as the contents coming forward. */}
      <Animated.View
        style={[
          styles.body,
          {
            backgroundColor: pressed ? bodyLift : body,
            borderColor: edge,
            transform: [{ translateY: pressed ? -4 : 0 }, { scale: pressed ? 1.015 : 1 }],
            transitionProperty: "transform, background-color",
            transitionDuration: motion.base,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // No overflow:hidden — the flap deliberately sits outside the body's box.
  },
  flap: {
    alignSelf: "flex-start",
    minWidth: 84,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    // Tucks under the body so the two read as one shape, not two stacked.
    marginBottom: -spacing.sm,
    zIndex: 0,
    // Hinge at the crease where flap meets body, not at the flap's centre.
    transformOrigin: "bottom",
  },
  flapText: {
    ...type.caption,
    fontWeight: weight.bold,
    letterSpacing: 0.6,
  },
  sheet: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    top: spacing.lg,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 0,
  },
  body: {
    borderRadius: radius.lg,
    // Squared where the flap meets it.
    borderTopLeftRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    zIndex: 1,
  },
});
