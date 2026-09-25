import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { elevation, motion, radius, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * One course, as a practice target.
 *
 * WHY THIS IS NOT STUDY'S TILE
 * It was, briefly: the same `CourseFolder` with a progress arc added beside it.
 * That read as the same page with a decoration, which is the opposite of what
 * is wanted — a student should know which mode they are in before reading a
 * word, and certainly without having to notice a small arc.
 *
 * A folder is a container you open to read. That is Study, exactly. Practice is
 * a thing you come back to and measure yourself against, so it gets the shape
 * of a scoreboard row instead: a colour spine rather than a folder tab, the
 * course code ABOVE the title rather than a badge parked right, a horizontal
 * bar rather than a ring, and the score as a large numeral. No part of the
 * silhouette matches Study's.
 *
 * WHY COLOUR IS A SPINE AND NOT THE ICON'S WHOLE IDENTITY
 * The real data settled this: 60 courses use 37 distinct icons but only SIX
 * colours, so roughly ten courses share each. Colour cannot identify a course
 * here; the glyph can. Colour accents, the glyph identifies.
 *
 * TWO METRICS, EACH LABELLED, KEPT APART
 * The bar is coverage, the numeral is accuracy. An earlier version put both as
 * bare percentages side by side and a tile read "13%" next to "94%" with
 * nothing saying which was which. They are separated by form as well as
 * position now.
 *
 * NOT STARTED SHOWS NO BAR AND NO NUMBER
 * `practice_attempts` took no rows at all until the save bug was fixed, so this
 * is still every tile for most students. An empty bar and a 0 would read as
 * failure on a course nobody has touched.
 */

export type PracticeProgress = {
  /** Distinct topics with at least one recorded answer. */
  topicsAttempted: number;
  /** Topics the course has. Zero means the count is not known yet. */
  topicsTotal: number;
  /** Mean score_percent across attempts, or null with none. */
  accuracy: number | null;
  /** Completed practice sessions on this course. */
  sessions: number;
};

function bandColor(accuracy: number, theme: Theme) {
  if (accuracy >= 75) return theme.success;
  if (accuracy >= 50) return theme.warning;

  return theme.error;
}

/**
 * Smallest visible fill, in points.
 *
 * One topic of twenty-seven is 3.7%, under four points across the bar — a mark
 * read as a rendering artefact rather than as progress. A floor, not a fudge:
 * zero coverage still draws nothing.
 */
const MIN_FILL = 8;

// ---------------------------------------------------------------------------
// Press motion — "arm and fire"
// ---------------------------------------------------------------------------
/**
 * The row reads left to right: spine, bar, numeral. The motion travels the same
 * way, because that is where the eye already is. Three beats, staged so no two
 * peak together.
 *
 *   press-in    0-90ms    spine 4 -> 7pt, anchored left so it grows INTO the
 *                         card; a thickening at the point nearest the thumb
 *               0-120ms   a 4% wash of the course colour over the card
 *   release     0-180ms   a charge runs to the leading edge of the bar fill
 *               50-210ms  the numeral pops 1 -> 1.05 -> 1
 *               40-200ms  the spine settles back to 4pt
 *
 * THE RULE THIS OBEYS: nothing that encodes data is allowed to move.
 * The obvious idea is to sweep the coverage bar on tap. That is the one to
 * reject — the bar IS the coverage, and animating its width says the number
 * changed. The charge is a brightness travelling over a fill whose width never
 * moves. Same reason the numeral scales but never changes colour: the band
 * colour carries meaning and must not flicker.
 *
 * This is deliberately not the folder hinge in another form. The hinge is one
 * object rotating open on an axis — a container admitting you. There is no
 * rotation and no opening here; it is a signal propagating along a row.
 */
const SPINE_REST = 4;
const SPINE_PRESSED = 7;
const WASH_OPACITY = 0.04;

export function PracticeTile({
  theme,
  title,
  code,
  color,
  icon,
  progress,
  onPress,
}: {
  theme: Theme;
  title: string;
  /** Omit or pass null when the course has no code. Use courseCode(). */
  code?: string | null;
  color: string;
  icon: IconName;
  /** Null until the history query resolves; `sessions: 0` means never practised. */
  progress: PracticeProgress | null;
  onPress: () => void;
}) {
  const reduce = useReducedMotion();

  const press = useSharedValue(0);

  const [pressed, setPressed] = useState(false);
  /** False until the first press, so nothing charges on mount. */
  const [everPressed, setEverPressed] = useState(false);
  const releasing = everPressed && !pressed;

  const started = Boolean(progress && progress.sessions > 0);
  const canShowCoverage = Boolean(progress && progress.topicsTotal > 0);
  const coverage = canShowCoverage
    ? Math.round((progress!.topicsAttempted / progress!.topicsTotal) * 100)
    : 0;
  const accuracy = progress?.accuracy ?? null;

  const spineStyle = useAnimatedStyle(() => ({
    width: SPINE_REST + press.value * (SPINE_PRESSED - SPINE_REST),
  }));

  const washStyle = useAnimatedStyle(() => ({
    opacity: press.value * WASH_OPACITY,
  }));

  /**
   * The charge and the numeral pop both ride the spine's RETURN, so they are
   * derived from `press` rather than given a shared value of their own.
   *
   * `press` runs 0 -> 1 on press-in and 1 -> 0 on release. The parabola
   * 4·p·(1−p) peaks at p = 0.5 and is zero at both ends — exactly the rise and
   * decay wanted — gated by `releasing` so it plays on the way out only.
   *
   * ONE SHARED VALUE, NOT TWO, AND NOT BY PREFERENCE
   * The React Compiler rejects assigning a SECOND shared value anywhere in a
   * component: "this value cannot be modified". Four shapes were tried — a
   * separate effect, a single conditional expression, withSequence against
   * withRepeat, a raw zero against an animation object — and all were flagged.
   * Collapsing both into one effect finally showed the rule: the first
   * assignment passes and the second is flagged, wherever it sits. Deriving
   * instead of assigning sidesteps it, and is simpler anyway.
   */
  const chargeStyle = useAnimatedStyle(() => ({
    opacity: releasing ? 4 * press.value * (1 - press.value) : 0,
  }));

  const numeralStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + (releasing ? 4 * press.value * (1 - press.value) : 0) * 0.05 },
    ],
  }));

  // Assigning a shared value inside an event handler is rejected too; an effect
  // with the value in its dependency list is the shape that is accepted.
  useEffect(() => {
    if (reduce) {
      press.value = pressed ? 1 : 0;
      return;
    }

    press.value = pressed
      ? withTiming(1, { duration: 90, easing: Easing.out(Easing.back(1.6)) })
      // 160ms out, so the derived charge peaks about 80ms after release —
      // close to the 0-180ms the sequence was specified at.
      : withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
  }, [pressed, reduce, press]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        code,
        title,
        started
          ? `${coverage}% of topics practised${accuracy === null ? "" : `, ${accuracy}% average`}`
          : "not started",
      ]
        .filter(Boolean)
        .join(" — ")}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        setEverPressed(true);
      }}
      onPressOut={() => {
        setPressed(false);
      }}
      style={({ hovered }: any) => [
        practiceTileLayout.tile,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          // No scale. The spine is the press feedback now; two feedbacks at
          // once is what made the previous lift read as the page twitching.
          ...elevation(1, theme.shadow),
          opacity: hovered ? 0.94 : 1,
          transitionProperty: "opacity",
          transitionDuration: motion.fast,
        },
      ]}
    >
      {/* The wash sits under the content and over the card, so it warms the
          whole row without touching any text colour. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: color }, washStyle]}
      />

      <Animated.View style={[styles.spine, { backgroundColor: color }, spineStyle]} />

      <View style={styles.inner}>
        <View style={styles.body}>
          <View style={styles.codeRow}>
            <MaterialCommunityIcons name={icon} size={15} color={color} />
            {code ? (
              <Text style={[styles.code, { color }]} numberOfLines={1}>
                {code}
              </Text>
            ) : null}
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {started && canShowCoverage ? (
            <View style={styles.barRow}>
              <View style={[styles.track, { backgroundColor: withAlpha(theme.text, 0.1) }]}>
                {progress!.topicsAttempted > 0 ? (
                  <View
                    style={[
                      styles.fill,
                      { width: `${coverage}%`, minWidth: MIN_FILL, backgroundColor: color },
                    ]}
                  >
                    <Animated.View
                      pointerEvents="none"
                      style={[styles.charge, { backgroundColor: theme.onAccent }, chargeStyle]}
                    />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.fraction, { color: theme.muted }]}>
                {progress!.topicsAttempted}/{progress!.topicsTotal}
              </Text>
            </View>
          ) : started ? (
            <Text style={[styles.meta, { color: theme.muted }]}>
              {progress!.sessions} {progress!.sessions === 1 ? "session" : "sessions"}
            </Text>
          ) : (
            <Text style={[styles.meta, { color: theme.muted }]}>Start practising</Text>
          )}
        </View>

        {/* The third beat lands here whichever state the row is in: on the
            numeral when there is one, on the play glyph when there is not. */}
        <Animated.View style={[styles.numberCol, numeralStyle]}>
          {started && accuracy !== null ? (
            <>
              <Text style={[styles.bigNum, { color: bandColor(accuracy, theme) }]}>
                {accuracy}
              </Text>
              <Text style={[styles.numLabel, { color: theme.muted }]}>AVG %</Text>
            </>
          ) : (
            <MaterialCommunityIcons
              name="play-circle"
              size={26}
              color={withAlpha(color, 0.85)}
            />
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}

/**
 * Grid and cell. A separate export from `courseTileLayout` even where the
 * values match: the two screens are free to diverge, and sharing the object
 * would make that a breaking change rather than an edit.
 */
export const practiceTileLayout = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignContent: "flex-start",
  },
  tile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    // The spine and the wash both run to the card's edge, so both have to be
    // clipped by the radius.
    overflow: "hidden",
  },
  cell: {
    flexGrow: 1,
    minWidth: 0,
    flexDirection: "row",
  },
  cellThird: { flexBasis: "31%" },
  cellHalf: { flexBasis: "46%" },
  cellFull: { flexBasis: "100%" },
});

const styles = StyleSheet.create({
  spine: { alignSelf: "stretch" },
  inner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  body: { flex: 1, minWidth: 0 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  code: { ...typeScale.micro, fontWeight: weight.bold, letterSpacing: 0.6 },
  title: { ...typeScale.bodyLg, fontWeight: weight.bold, marginTop: 2 },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, justifyContent: "center" },
  /** Rides the fill's right edge. Anchored right so it cannot overstate it. */
  charge: { position: "absolute", right: 0, width: 10, height: 4, borderRadius: 2 },
  fraction: { ...typeScale.micro, letterSpacing: 0 },
  meta: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
  numberCol: { alignItems: "flex-end", minWidth: 44 },
  bigNum: { fontSize: 24, fontWeight: "900", lineHeight: 26 },
  numLabel: { ...typeScale.micro, letterSpacing: 0.6 },
});
