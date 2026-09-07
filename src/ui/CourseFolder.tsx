import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { IconName } from "./alerts";
import { FolderIcon } from "./FolderIcon";
import { shade } from "./tokens";

/**
 * The course folder, opening.
 *
 * WHAT WAS WRONG
 * --------------
 * The old press was a 260ms CSS transition on the wrapper's translate and
 * rotate, plus a discrete swap of the front face's SVG path. Nothing
 * interpolated the opening itself, so what you saw was a small jiggle with a
 * jump-cut in the middle of it — a shake, not a hinge. Slowing the wrapper
 * could not have fixed that, because the opening was never animated.
 *
 * WHAT IT IS NOW
 * --------------
 * One motion, done properly, rather than several done adequately. The wrapper
 * jiggle is gone — it was the shake — and the budget goes to a real hinge on
 * the front face, driven by Reanimated springs on the UI thread.
 *
 * Three overlapping stages, because real objects do not wait for one motion to
 * finish before starting the next:
 *
 *   lift   0-140ms    the whole folder rises and grows slightly: picked up
 *   hinge  90-520ms   the front face swings forward about its bottom edge
 *   glyph  240-560ms  what was inside becomes visible as the face clears it
 *
 * The hinge spring is deliberately heavier than `motion.springConfig`, which
 * is tuned snappy for buttons (mass 0.5, stiffness 220) and feels flicky on
 * something this size. Low stiffness and higher mass give it weight; damping
 * sits just under critical so it settles rather than bounces.
 */

const HINGE = { mass: 1.1, damping: 18, stiffness: 90 };

/**
 * The glyph's own spring, separate from LIFT.
 *
 * On LIFT the reveal ran 0 to 100 in about 200ms and finished at 440 — the
 * same instant navigation fired, so it was cut off exactly as it landed and
 * never registered. Critically damped at zeta 1.00, this takes 345ms and
 * arrives without a bounce, which suits something appearing rather than
 * something being flicked into place.
 */
const GLYPH = { mass: 0.8, damping: 27.4, stiffness: 234 };

/**
 * When the whole sequence has settled, and what callers time navigation to.
 *
 * Set by the GLYPH stage, not the hinge: the hinge is done at 530ms but the
 * glyph finishes at 290 + 345. Navigating on the hinge alone cut the reveal
 * off at the moment it arrived.
 */
export const FOLDER_OPEN_MS = 640;

export function CourseFolder({
  color,
  icon,
  size = 52,
  open,
}: {
  color: string;
  icon: IconName;
  size?: number;
  /** Drives the whole sequence. */
  open: boolean;
}) {
  const progress = useSharedValue(0);
  const glyph = useSharedValue(0);
  const breathe = useSharedValue(0);

  // The idle breathing the client asked for, moved here from a React Native
  // Animated loop in study.tsx. Same 1.018 over 1900ms, now on Reanimated so
  // the whole folder runs on one animation system rather than two, and so the
  // loop can be paused while the hinge is playing — a breathing folder
  // mid-open reads as a wobble.
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 1900 }), -1, true);
  }, [breathe]);

  useEffect(() => {
    if (open) {
      progress.value = withSpring(1, HINGE);
      // Starts once the face has begun to clear the glyph, not with it.
      // 290 rather than 240: the folder is about 78% open by then, so the
      // face has visibly moved before anything appears from behind it.
      glyph.value = withDelay(290, withSpring(1, GLYPH));
    } else {
      // Closing is quicker and plainer: reversing a weighty spring reads as
      // hesitation, and by this point the screen is usually changing anyway.
      progress.value = withTiming(0, { duration: 220 });
      glyph.value = withTiming(0, { duration: 160 });
    }
  }, [open, progress, glyph]);

  const liftStyle = useAnimatedStyle(() => {
    // Breathing fades out as the open begins, so the two never compound.
    const idle = 0.018 * breathe.value * (1 - progress.value);

    return {
      transform: [
        { translateY: -4 * progress.value },
        { scale: 1 + idle + 0.03 * progress.value },
      ],
    };
  });

  const hingeStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 520 },
      // Negative brings the top edge toward the viewer, so the folder opens
      // outward rather than folding away from you.
      // 58deg was not enough: viewed head-on, rotating about the bottom edge
      // foreshortens the face into a band rather than swinging it clear, and
      // it still covered the glyph. 74 tips it far enough to read as a lid
      // going down.
      { rotateX: `${-74 * progress.value}deg` },
    ],
    // The hinge is the crease where the front meets the back, not the middle
    // of the shape.
    transformOrigin: "bottom",
  }));

  const glyphStyle = useAnimatedStyle(() => ({
    opacity: glyph.value,
    transform: [
      // Rises out of the folder rather than fading in place. Fading alone read
      // as nothing happening, because the glyph sat where the tipped face
      // still covered it — this is the beat that makes the open legible.
      { translateY: 10 - 18 * glyph.value },
      { scale: 0.85 + 0.15 * glyph.value },
    ],
  }));

  // Dark enough to read on the folder's own face at every category hue —
  // measured 4.9:1 at worst, against 1.1:1 for the undiluted colour and as
  // low as 1.75:1 for white on yellow.
  const ink = shade(color, -0.75);

  return (
    <Animated.View style={[{ width: size, height: size * (56 / 64) }, liftStyle]}>
      <FolderIcon color={color} size={size} frontStyle={hingeStyle} />

      {/* Under the front face, so the opening reveals it. */}
      <Animated.View style={[styles.glyph, glyphStyle]}>
        <MaterialCommunityIcons name={icon} size={size * 0.29} color={ink} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    // Sits on the front face rather than centred on the whole shape, so the
    // opening face passes over it.
    justifyContent: "flex-end",
    paddingBottom: "16%",
  },
});
