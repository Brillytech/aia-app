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
import type { SelfCheck } from "../theoryScore";
import { haptics } from "./haptics";
import { QuestionShell } from "./QuestionShell";
import { RichText } from "./RichText";
import { radius, shade, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * A free-text theory question: read it, attempt it on paper, then check
 * yourself against the model answer.
 *
 * The chrome — progress strip, paper head, turn, navigation — belongs to
 * QuestionShell, which grid questions share. What is left here is the part
 * that is specific to prose.
 *
 * WHY THE REVEAL IS NOT THE FLASHCARD'S FLIP
 * -----------------------------------------
 * The Cards reveal is a 3deg rotateX over 260ms that swaps the card's content.
 * Copying it would be wrong twice over: it is barely tactile, and it REPLACES
 * the question with the answer. You read a theory answer against the question,
 * point by point, so the question has to stay. The answer unfurls below it
 * instead — the rule draws down as the block opens, the text rises behind it —
 * and the question never moves.
 *
 * Both animations here are skipped wholesale under `prefers-reduced-motion`.
 */

/** zeta 1.00. Critically damped on purpose: a rule that bounces looks broken,
 *  and this value also drives the block's height. */
const DRAW = { mass: 0.8, damping: 26, stiffness: 210 };

/** zeta 0.87 — the answer text, which may overshoot a little. */
const RISE = { mass: 0.9, damping: 20, stiffness: 150 };

const RISE_DELAY = 110;

const CHECKS: readonly { key: SelfCheck; label: string; icon: any }[] = [
  { key: "missed", label: "Missed it", icon: "close" },
  { key: "partly", label: "Partly", icon: "circle-half-full" },
  { key: "got", label: "Got it", icon: "check" },
];

/** The three colours the whole paper speaks in, self-check or auto-graded. */
export function checkTone(theme: Theme, key: SelfCheck) {
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
  segments: (string | null)[];
  direction: "next" | "prev" | null;
  revealed: boolean;
  rating: SelfCheck | null;
  onReveal: () => void;
  onRate: (rating: SelfCheck) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const reduce = useReducedMotion();
  const dark = theme.mode === "dark";

  const [stemReady, setStemReady] = useState(false);
  const [answerReady, setAnswerReady] = useState(false);
  const [answerHeight, setAnswerHeight] = useState(0);

  const open = useSharedValue(0);
  const body = useSharedValue(0);

  const onStemReady = useCallback(() => setStemReady(true), []);
  const onAnswerReady = useCallback(() => setAnswerReady(true), []);
  const onAnswerLayout = useCallback(
    (event: LayoutChangeEvent) => setAnswerHeight(event.nativeEvent.layout.height),
    [],
  );

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

  return (
    <QuestionShell
      theme={theme}
      index={index}
      total={total}
      segments={segments}
      marks={marks}
      difficulty={difficulty}
      direction={direction}
      ready={stemReady}
      onPrev={onPrev}
      onNext={onNext}
      onFinish={onFinish}
    >
      <RichText theme={theme} html={html} text={text} size={16} onReady={onStemReady} />

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
                      <Text style={[styles.checkText, { color: active ? ink : theme.text }]}>
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
    </QuestionShell>
  );
}

const styles = StyleSheet.create({
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
});
