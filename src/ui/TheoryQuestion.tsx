import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { RichText } from "./RichText";
import type { SelfCheck } from "../theoryScore";
import { radius, shade, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * One theory question, as a page of a question paper.
 *
 * The design follows from what the content is: something you attempt, then
 * mark yourself against. That is why the head borrows the grammar of a printed
 * paper (numeral leading, marks in the right margin) rather than the editorial
 * masthead used on Profile and the course header — a masthead is a SECTION
 * header, and nine of them in a row would flatten the hierarchy they exist to
 * create.
 *
 * MOTION, AND WHY IT IS NOT THE FLASHCARD'S
 * -----------------------------------------
 * The Cards reveal is a 3deg rotateX over 260ms that swaps the card's content.
 * Copying it here would be wrong twice over: it is barely tactile, and it
 * REPLACES the question with the answer. You read a theory answer against the
 * question, point by point, so the question has to stay. The answer unfurls
 * below it instead — the rule draws down as the block opens, the text rises
 * behind it — and the question never moves.
 *
 * Every animation here is skipped wholesale under `prefers-reduced-motion`.
 * This screen had no motion at all before; adding it without an opt-out would
 * be a regression for anyone who needs one.
 */

/** zeta 0.85 — one soft overshoot, settled ~520ms. Weightier than a button. */
const TURN = { mass: 1, damping: 20, stiffness: 140 };

/** zeta 1.00. Critically damped on purpose: a rule that bounces looks broken,
 *  and this value also drives the block's height. */
const DRAW = { mass: 0.8, damping: 26, stiffness: 210 };

/** zeta 0.87 — the answer text, which may overshoot a little. */
const RISE = { mass: 0.9, damping: 20, stiffness: 150 };

/** The numeral and rule trail the stem, so the page assembles rather than
 *  sliding in as one rigid slab. */
const HEAD_DELAY = 60;
const RISE_DELAY = 110;

/** How far the incoming page starts from its resting position. */
const TURN_OFFSET = 46;

/**
 * Past this many questions a segment is a few pixels wide and the strip stops
 * communicating anything, so it falls back to the plain fill bar.
 */
const STRIP_MAX = 15;


const CHECKS: readonly { key: SelfCheck; label: string; icon: any }[] = [
  { key: "missed", label: "Missed it", icon: "close" },
  { key: "partly", label: "Partly", icon: "circle-half-full" },
  { key: "got", label: "Got it", icon: "check" },
];

function checkTone(theme: Theme, key: SelfCheck) {
  if (key === "missed") return theme.error;
  if (key === "partly") return theme.warning;
  return theme.success;
}

export function TheoryQuestion({
  theme,
  html,
  text,
  answerHtml,
  answerText,
  marks,
  difficulty,
  index,
  total,
  segments,
  direction,
  revealed,
  rating,
  onReveal,
  onRate,
  onPrev,
  onNext,
  onFinish,
}: {
  theme: Theme;
  html: string | null;
  text: string | null;
  answerHtml: string | null;
  answerText: string | null;
  marks: number | null;
  difficulty: string | null;
  index: number;
  total: number;
  /** One entry per question, in order. `null` means not yet self-checked. */
  segments: (SelfCheck | null)[];
  /**
   * Which way the last move went, or `null` before any move has happened.
   *
   * `null` is also what gives the very first question a plain swap: the engine
   * is not loaded yet, so holding a slide until it is would mean staring at an
   * empty screen for the length of a chunk download.
   */
  direction: "next" | "prev" | null;
  revealed: boolean;
  rating: SelfCheck | null;
  onReveal: () => void;
  onRate: (rating: SelfCheck) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Called instead of onNext on the last question. */
  onFinish: () => void;
}) {
  const reduce = useReducedMotion();
  const dark = theme.mode === "dark";

  const [stemReady, setStemReady] = useState(false);
  const [answerReady, setAnswerReady] = useState(false);
  const [answerHeight, setAnswerHeight] = useState(0);

  const stem = useSharedValue(0);
  const head = useSharedValue(0);
  const open = useSharedValue(0);
  const body = useSharedValue(0);

  const onStemReady = useCallback(() => setStemReady(true), []);
  const onAnswerReady = useCallback(() => setAnswerReady(true), []);
  const onAnswerLayout = useCallback(
    (event: LayoutChangeEvent) => setAnswerHeight(event.nativeEvent.layout.height),
    [],
  );

  // A new question mounts hidden and offset (the shared values start at 0)
  // and stays there until its content has been sanitized and typeset.
  // Animating first and letting KaTeX land underneath is the flash this
  // avoids. The caller keys this component by question id, so there is no
  // reset to do here — which is also why this is one effect and not two.
  useEffect(() => {
    if (reduce || direction === null) {
      // No motion wanted, or nothing to move from. Arrive in place.
      stem.value = 1;
      head.value = 1;
      return;
    }

    if (!stemReady) return;

    stem.value = withSpring(1, TURN);
    head.value = withDelay(HEAD_DELAY, withSpring(1, TURN));
  }, [stemReady, reduce, direction, stem, head]);

  // The unfurl waits for the same two things the turn does — typeset, and
  // measured — because the block's height is what is being animated and KaTeX
  // changes it.
  useEffect(() => {
    if (!revealed) {
      open.value = reduce ? 0 : withTiming(0, { duration: 140 });
      body.value = reduce ? 0 : withTiming(0, { duration: 120 });
      return;
    }

    if (!answerReady || answerHeight === 0) return;

    if (reduce) {
      open.value = 1;
      body.value = 1;
      return;
    }

    open.value = withSpring(1, DRAW);
    body.value = withDelay(RISE_DELAY, withSpring(1, RISE));
  }, [revealed, answerReady, answerHeight, reduce, open, body]);

  const enter = direction === "prev" ? -TURN_OFFSET : TURN_OFFSET;

  const stemStyle = useAnimatedStyle(() => ({
    // Reaches full opacity well before the spring settles, so what you notice
    // is the movement rather than the fade.
    opacity: Math.min(1, stem.value * 1.6),
    transform: [{ translateX: (1 - stem.value) * enter }],
  }));

  const headStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, head.value * 1.6),
    transform: [{ translateX: (1 - head.value) * enter }],
  }));

  const openStyle = useAnimatedStyle(() => ({
    height: answerHeight * open.value,
  }));

  const ruleStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: open.value }],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, body.value * 1.8),
    transform: [{ translateY: 10 * (1 - body.value) }],
  }));

  const hasAnswer = Boolean(answerHtml || answerText);
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
                    backgroundColor: segment
                      ? checkTone(theme, segment)
                      : i === index
                        ? withAlpha(theme.text, 0.25)
                        : theme.soft,
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
          uses, and the thing that says "theory question" before a word is
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

      <Animated.View style={stemStyle}>
        <RichText theme={theme} html={html} text={text} size={16} onReady={onStemReady} />
      </Animated.View>

      {hasAnswer && !revealed ? (
        // Outlined, not accent-filled. Revealing the answer is the action that
        // ENDS the exercise; making it the loudest thing on screen invites
        // tapping it before attempting. Orange stays on Next.
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptics.tap();
            onReveal();
          }}
          style={({ hovered }: any) => [
            styles.reveal,
            { borderColor: theme.border },
            hovered ? { backgroundColor: withAlpha(theme.text, 0.04) } : null,
          ]}
        >
          <Text style={[styles.revealText, { color: theme.text }]}>Show model answer</Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={theme.muted} />
        </Pressable>
      ) : null}

      {hasAnswer && revealed ? (
        <Animated.View style={[styles.answerClip, openStyle]}>
          {/* Measured, not guessed. The child lays out at its natural height
              inside a clipped parent, which is what lets the parent animate to
              it. */}
          <View onLayout={onAnswerLayout} style={styles.answerMeasure}>
            <View style={styles.answerRow}>
              <Animated.View
                style={[styles.answerRule, { backgroundColor: theme.success }, ruleStyle]}
              />

              <Animated.View style={[styles.answerBody, bodyStyle]}>
                <Text style={[styles.answerLabel, { color: theme.success }]}>Model answer</Text>

                <RichText
                  theme={theme}
                  html={answerHtml}
                  text={answerText}
                  size={15}
                  onReady={onAnswerReady}
                />

              </Animated.View>
            </View>

            {/* Outside the ruled block on purpose: the rule marks the model
                answer, and running it down past this made the rating read as
                part of the answer rather than as your response to it.

                Self-assessment, not grading — nothing is scored and nothing is
                sent anywhere. It colours this question's segment above, so the
                rating has somewhere real to land. */}
            <Animated.View style={[styles.check, bodyStyle]}>
                  <Text style={[styles.checkQuestion, { color: theme.muted }]}>
                    How did you do?
                  </Text>

                  <View style={styles.checkRow}>
                    {CHECKS.map((option) => {
                      const active = rating === option.key;
                      const tone = checkTone(theme, option.key);
                      const ink = dark ? shade(tone, 0.35) : shade(tone, -0.45);

                      return (
                        <Pressable
                          key={option.key}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => {
                            haptics.select();
                            onRate(option.key);
                          }}
                          style={({ hovered }: any) => [
                            styles.checkBtn,
                            { borderColor: theme.border },
                            hovered && !active
                              ? { backgroundColor: withAlpha(theme.text, 0.04) }
                              : null,
                            active
                              ? {
                                  backgroundColor: withAlpha(tone, dark ? 0.28 : 0.14),
                                  borderColor: "transparent",
                                }
                              : null,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={option.icon}
                            size={16}
                            color={active ? ink : theme.muted}
                          />
                          <Text
                            style={[
                              styles.checkText,
                              { color: active ? ink : theme.text },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      ) : null}

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
    // rule visibly runs off the right edge. Wide equations still scroll:
    // RichText gives .katex-display its own overflow-x.
    overflow: "hidden",
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

  reveal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  revealText: {
    ...typeScale.bodyLg,
    fontWeight: weight.bold,
  },

  answerClip: {
    overflow: "hidden",
  },
  answerMeasure: {
    // Absolute so the clipped parent's animated height never feeds back into
    // the child's own layout, which would make the measurement chase itself.
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  answerRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  answerRule: {
    width: 3,
    borderRadius: 2,
    flexGrow: 0,
    flexShrink: 0,
    transformOrigin: "top",
  },
  answerBody: {
    flex: 1,
    minWidth: 0,
  },
  answerLabel: {
    ...typeScale.kicker,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },

  check: {
    marginTop: spacing.xl,
  },
  checkQuestion: {
    ...typeScale.caption,
    letterSpacing: 0,
    marginBottom: spacing.md,
  },
  checkRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  checkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checkText: {
    ...typeScale.caption,
    letterSpacing: 0,
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
