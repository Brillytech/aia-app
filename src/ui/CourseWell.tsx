import { useEffect, useId } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import type { IconName } from "./alerts";
import { CourseFolder } from "./CourseFolder";
import { radius, withAlpha } from "./tokens";

/**
 * The course folder, recessed into a tinted well.
 *
 * This is the one place in the app where a course hue FILLS an area rather
 * than marking an edge or an icon. That is deliberate and it is the whole
 * reason the treatment is contained to 108x108: the rule has always been that
 * colour lives on meaningful elements and never as a background wash, and a
 * well the size of a folder is an element. Do not grow this to the card.
 *
 * The gradient is a radial rather than a flat tint because a flat one at these
 * alphas reads as a mistake — a slightly-off rectangle behind an icon. Light
 * from above, falling off toward the bottom corners, reads as a recess.
 *
 * MOUNT MOTION, not press motion. The press animation belongs to CourseFolder
 * and is untouched here; this is the once-per-load settle that makes the hero
 * announce itself. The two never overlap in practice — the settle is done at
 * 700ms and a press cannot land before then in any realistic session — but
 * they are separate transforms on separate views regardless, so they compose
 * rather than fight.
 */

/**
 * zeta 0.73 — underdamped on purpose. Critically damped (as the glyph reveal
 * is) reads as "placed"; this should read as "landed", which needs exactly one
 * visible overshoot. Peaks 3.4% past at ~420ms, settled by 700ms.
 */
const SETTLE = { mass: 1, damping: 16, stiffness: 120 };

/** Waits for the section's own entrance to be underway rather than racing it. */
const SETTLE_DELAY = 120;

export function CourseWell({
  color,
  icon,
  size = 108,
  folderSize = 76,
  open,
  dark,
}: {
  color: string;
  icon: IconName;
  /** The well. The folder inside it scales independently. */
  size?: number;
  folderSize?: number;
  /** Passed straight through to the folder's opening sequence. */
  open: boolean;
  /**
   * Dark mode needs roughly double the alpha for the same apparent tint: the
   * well sits on `card #101A2D` rather than white, so a 17% overlay that reads
   * clearly in light mode all but disappears.
   */
  dark: boolean;
}) {
  const settle = useSharedValue(0);

  // React's own ids contain colons, which are not valid in an SVG url(#...)
  // reference. Two wells never render at once today, but a colliding id would
  // silently give one of them the other's gradient, which is exactly the kind
  // of failure that only shows up later.
  const gradientId = `well${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    settle.value = withDelay(SETTLE_DELAY, withSpring(1, SETTLE));
  }, [settle]);

  const settleStyle = useAnimatedStyle(() => ({
    // Reaches full opacity at about a third of the travel, so the fade is over
    // well before the spring settles. A fade running the full 700ms reads as
    // slow; the motion should be what you notice, not the transparency.
    opacity: Math.min(1, settle.value * 2.2),
    transform: [
      { translateY: 16 * (1 - settle.value) },
      { scale: 0.94 + 0.06 * settle.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.well,
        {
          width: size,
          height: size,
          borderColor: withAlpha(color, dark ? 0.3 : 0.2),
        },
        settleStyle,
      ]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* userSpaceOnUse rather than percentages: the units are then plain
              pixels in this box, which is unambiguous across renderers. */}
          <RadialGradient
            id={gradientId}
            cx={size / 2}
            cy={size * 0.28}
            rx={size * 0.78}
            ry={size * 0.78}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={color} stopOpacity={dark ? 0.32 : 0.17} />
            <Stop offset="1" stopColor={color} stopOpacity={dark ? 0.07 : 0.035} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${gradientId})`} />
      </Svg>

      <CourseFolder color={color} icon={icon} size={folderSize} open={open} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  well: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    // Keeps the gradient inside the rounded corners. The folder has ~20px of
    // headroom at the default sizes, so its lift and hinge never reach this.
    overflow: "hidden",
    flexGrow: 0,
    flexShrink: 0,
  },
});
