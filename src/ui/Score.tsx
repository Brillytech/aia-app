import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import { radius, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * The score-result vocabulary, shared by exam and by theory.
 *
 * Extracted verbatim from exam.tsx rather than reimplemented: the grade bands
 * and the hero are the pattern a student already recognises from finishing an
 * exam, and two copies of a colour ramp is exactly the kind of thing that
 * drifts. Nothing changed in the move — every style here was used exactly once
 * in exam.tsx before it came across.
 */

/**
 * Bands are mode-independent literals, not theme colours — a grade means the
 * same thing in light and dark, and these are the values the exam result and
 * its share card have always used.
 */
export function getGrade(score: number) {
  if (score >= 70) return { label: "Excellent", color: "#22C55E" };
  if (score >= 60) return { label: "Good", color: "#3B82F6" };
  if (score >= 50) return { label: "Fair", color: "#F97316" };
  return { label: "Needs Improvement", color: "#EF4444" };
}

export function ScoreHero({
  theme,
  dark,
  percent,
  label,
  grade,
  eyebrow,
  eyebrowColor,
  subtitle,
  note,
}: {
  theme: Theme;
  dark: boolean;
  percent: number;
  /** "Final score", "Topic score". */
  label: string;
  grade: { label: string; color: string };
  /** Course code, in the course hue. */
  eyebrow?: string | null;
  eyebrowColor?: string;
  subtitle?: string | null;
  /**
   * A qualifier under the band.
   *
   * Exists for theory, where part of the percentage is the student's own
   * rating of themselves. An unqualified number there would read as an exam
   * result, which it is not.
   */
  note?: ReactNode;
}) {
  return (
    <>
      {eyebrow || subtitle ? (
        <View style={styles.resultCourse}>
          {eyebrow ? (
            <Text style={[styles.resultCode, { color: eyebrowColor || theme.accent }]}>
              {eyebrow}
            </Text>
          ) : null}

          {subtitle ? (
            <Text style={[styles.resultSub, { color: theme.muted }]}>{subtitle}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.scoreHero}>
        <Text style={[styles.scorePercent, { color: grade.color }]}>{percent}%</Text>
        <Text style={[styles.scoreLabel, { color: theme.muted }]}>{label}</Text>

        <View
          style={[
            styles.gradePillBig,
            { backgroundColor: withAlpha(grade.color, dark ? 0.24 : 0.16) },
          ]}
        >
          <MaterialCommunityIcons name="medal-outline" size={18} color={grade.color} />
          <Text style={[styles.gradeText, { color: grade.color }]}>{grade.label}</Text>
        </View>

        {note}

        <View style={[styles.resultTrack, { backgroundColor: theme.soft }]}>
          <View
            style={[
              styles.resultFill,
              { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: grade.color },
            ]}
          />
        </View>
      </View>
    </>
  );
}

export function HeadlineStat({
  theme,
  label,
  value,
  color,
}: {
  theme: Theme;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.flex1}>
      <Text style={[styles.headlineValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.headlineLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

/** The three-across row the headline stats sit in. */
export function HeadlineRow({ children }: { children: ReactNode }) {
  return <View style={styles.headlineRow}>{children}</View>;
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  resultCourse: { alignItems: "center", marginBottom: spacing.sm },
  resultCode: { ...typeScale.micro, letterSpacing: 0.8 },
  resultSub: {
    ...typeScale.body,
    fontWeight: weight.regular,
    marginTop: spacing.xxs,
    textAlign: "center",
  },
  scoreHero: { alignItems: "center", paddingBottom: spacing.xxxl },
  scorePercent: {
    ...typeScale.mega,
  },
  scoreLabel: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
  gradePillBig: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  gradeText: {
    fontSize: 12,
    fontWeight: "900",
  },
  resultTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    alignSelf: "stretch",
    marginTop: spacing.xl,
  },
  resultFill: {
    height: "100%",
    borderRadius: 999,
  },
  headlineValue: { ...typeScale.title },
  headlineLabel: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
  headlineRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
    // ListSection supplies its own bottom margin but not a top one, so any
    // block sitting directly above a section has to space itself — this row
    // had none and collided with the Summary heading beneath it.
    marginBottom: spacing.xxxl,
    paddingHorizontal: spacing.xs,
  },
});
