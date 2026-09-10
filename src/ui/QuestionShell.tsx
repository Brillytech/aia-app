import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import type { Theme } from "../theme";
import { radius, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * The page a question sits on: where you are in the set, the paper head, the
 * turn between questions, and the navigation.
 *
 * Extracted from TheoryQuestion once grid questions needed all of it. None of
 * this is specific to prose — a fill-in-the-table question has the same
 * numeral, the same marks in the margin and the same place in the sequence —
 * and two copies of a staged spring is exactly what drifts.
 *
 * WHAT THE BODY IS RESPONSIBLE FOR
 * -------------------------------
 * Telling the shell when its content is actually on screen, via `ready`. The
 * turn is held until then: changing question replaces injected HTML, React
 * resets innerHTML and KaTeX re-runs, and animating over the top of that
 * flashes. `direction === null` skips the hold entirely, which is what gives
 * the very first question a plain swap instead of a blank wait.
 */

/** zeta 0.85 — one soft overshoot, settled ~520ms. Weightier than a button. */
const TURN = { mass: 1, damping: 20, stiffness: 140 };

/** The numeral and rule trail the body, so the page assembles rather than
 *  sliding in as one rigid slab. */
const HEAD_DELAY = 60;

/** How far the incoming page starts from its resting position. */
const TURN_OFFSET = 46;

/**
 * Past this many questions a segment is a few pixels wide and the strip stops
 * communicating anything, so it falls back to the plain fill bar.
 */
const STRIP_MAX = 15;

export function QuestionShell({
  theme,
  index,
  total,
  segments,
  marks,
  difficulty,
  direction,
  ready,
  onPrev,
  onNext,
  onFinish,
  children,
}: {
  theme: Theme;
  index: number;
  total: number;
  /**
   * One entry per question, in order: the colour that question earned, or null
   * for not yet attempted.
   *
   * A colour rather than a rating, because the two kinds of question arrive at
   * one differently — a self-check maps straight to it, a grid maps its
   * correct-cell fraction onto the same three — and the strip should read as
   * one language either way.
   */
  segments: (string | null)[];
  marks: number | null;
  difficulty: string | null;
  direction: "next" | "prev" | null;
  /** True once the body's content is laid out and safe to animate. */
  ready: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Called instead of onNext on the last question. */
  onFinish: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  const body = useSharedValue(0);
  const head = useSharedValue(0);

  // A new question mounts hidden and offset (the shared values start at 0).
  // The caller keys this component by question id, so there is no reset to do
  // here — which is why this is one effect and not two.
  useEffect(() => {
    if (reduce || direction === null) {
      // No motion wanted, or nothing to move from. Arrive in place.
      body.value = 1;
      head.value = 1;
      return;
    }

    if (!ready) return;

    body.value = withSpring(1, TURN);
    head.value = withDelay(HEAD_DELAY, withSpring(1, TURN));
  }, [ready, reduce, direction, body, head]);

  const enter = direction === "prev" ? -TURN_OFFSET : TURN_OFFSET;

  const bodyStyle = useAnimatedStyle(() => ({
    // Reaches full opacity well before the spring settles, so what you notice
    // is the movement rather than the fade.
    opacity: Math.min(1, body.value * 1.6),
    transform: [{ translateX: (1 - body.value) * enter }],
  }));

  const headStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, head.value * 1.6),
    transform: [{ translateX: (1 - head.value) * enter }],
  }));

  const last = index === total - 1;

  return (
    <View style={styles.screen}>
      {/* Where you are, and how you did. Replaces a fill bar that only ever
          said "22%" — with one segment per question the set shows your own
          pattern as it builds. */}
      <View style={styles.progressRow}>
        <Text style={[styles.count, { color: theme.muted }]}>
          {index + 1} of {total}
        </Text>

        {total <= STRIP_MAX ? (
          <View style={styles.strip}>
            {segments.map((segment, i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  // HEIGHT says where you are, COLOUR says how you did. An
                  // earlier version marked the current segment with a 2px
                  // accent border, which at 6px tall filled the bar solid and
                  // was indistinguishable from the amber "Partly" sitting next
                  // to it — the two channels have to stay separate.
                  i === index ? styles.segmentNow : null,
                  {
                    backgroundColor:
                      segment ?? (i === index ? withAlpha(theme.text, 0.25) : theme.soft),
                  },
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.bar, { backgroundColor: theme.soft }]}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.round(((index + 1) / total) * 100)}%`,
                  backgroundColor: theme.accent,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* The paper head. Difficulty as kicker, then a rule, then the numeral
          with its marks in the right margin — the convention every past paper
          uses, and the thing that says "exam question" before a word is
          read. */}
      <Animated.View style={headStyle}>
        {difficulty ? (
          <Text style={[styles.kicker, { color: theme.muted }]}>{difficulty}</Text>
        ) : null}

        <View style={[styles.rule, { backgroundColor: theme.border }]} />

        <View style={styles.head}>
          <Text style={[styles.numeral, { color: theme.muted }]}>{index + 1}</Text>

          {marks !== null ? (
            <Text style={[styles.marks, { color: theme.muted }]}>
              {marks} {marks === 1 ? "mark" : "marks"}
            </Text>
          ) : null}
        </View>
      </Animated.View>

      {/* The whole body travels with the turn, not just the question text —
          previously the reveal button stayed put while the stem slid past it. */}
      <Animated.View style={[styles.body, bodyStyle]}>{children}</Animated.View>

      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          onPress={onPrev}
          disabled={index === 0}
          style={[
            styles.navBtn,
            { borderColor: theme.border, opacity: index === 0 ? 0.4 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color={theme.muted} />
          <Text style={[styles.navText, { color: theme.muted }]}>Previous</Text>
        </Pressable>

        {/* The last question does not dead-end on a disabled button — it
            offers the thing you came for. */}
        <Pressable
          accessibilityRole="button"
          onPress={last ? onFinish : onNext}
          style={[styles.navBtn, styles.navPrimary, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.navText, { color: theme.onAccent }]}>
            {last ? "See results" : "Next"}
          </Text>
          <MaterialCommunityIcons
            name={last ? "flag-checkered" : "arrow-right"}
            size={18}
            color={theme.onAccent}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
    // The turn translates content past the screen gutter. Without clipping
    // here the page gains horizontal overflow mid-animation and the head's
    // rule visibly runs off the right edge. Wide content still scrolls:
    // RichText gives .katex-display its own overflow-x, and the grid table
    // carries its own horizontal ScrollView.
    overflow: "hidden",
  },
  body: {
    gap: spacing.lg,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  count: {
    ...typeScale.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  segmentNow: {
    height: 10,
    borderRadius: 5,
  },
  bar: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    flex: 1,
  },
  barFill: {
    height: "100%",
    borderRadius: radius.pill,
  },

  kicker: {
    ...typeScale.kicker,
    textTransform: "uppercase",
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  numeral: {
    ...typeScale.display,
  },
  marks: {
    ...typeScale.micro,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  nav: {
    flexDirection: "row",
    gap: spacing.md,
  },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 46,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  navPrimary: {
    borderColor: "transparent",
  },
  navText: {
    ...typeScale.body,
    fontWeight: weight.bold,
  },
});
