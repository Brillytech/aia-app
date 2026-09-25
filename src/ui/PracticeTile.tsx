import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
 * single word, and certainly without having to notice a small arc.
 *
 * A folder is a container you open to read. That is Study, exactly. Practice is
 * a thing you come back to and measure yourself against, so it gets the shape
 * of a scoreboard row instead:
 *
 *   - a colour spine down the left edge, not a folder with a tab
 *   - the course code ABOVE the title in the course colour, not a badge parked
 *     on the right — an inverted hierarchy reads as a different object even at
 *     a glance
 *   - a horizontal coverage bar, not a ring
 *   - the score as a large numeral, the one thing this mode is actually about
 *
 * No part of the silhouette matches Study's. That is the point.
 *
 * WHY COLOUR IS A SPINE AND NOT THE ICON'S WHOLE IDENTITY
 * The real data settled this: 60 courses use 37 distinct icons but only SIX
 * colours, so roughly ten courses share each. Colour cannot identify a course
 * here; the glyph can. Giving colour the spine — an accent, not an identifier —
 * says the right amount.
 *
 * TWO METRICS, EACH LABELLED, KEPT APART
 * The bar is coverage and the numeral is accuracy. An earlier version put both
 * as bare percentages side by side, and a tile reading "13%" next to "94%" told
 * nobody anything. They are separated here by form as well as position — a bar
 * with its own fraction beneath, and a numeral under the words "AVG %" — so
 * neither can be mistaken for the other.
 *
 * NOT STARTED SHOWS NO BAR AND NO NUMBER
 * `practice_attempts` is empty across the whole project, so this is every tile
 * on first use, not an edge case. An empty bar and a 0 would read as failure on
 * a course nobody has touched. The row offers the action instead, and gains its
 * numbers once they are true.
 */

export type PracticeProgress = {
  /** Distinct topics with at least one recorded attempt. */
  topicsAttempted: number;
  /** Topics the course has. Zero means the count is not known yet. */
  topicsTotal: number;
  /** Mean score_percent across attempts, or null with none. */
  accuracy: number | null;
  /** Completed practice sessions on this course. */
  sessions: number;
};

/** Accuracy band. Matches the result screen's thresholds rather than inventing new ones. */
function bandColor(accuracy: number, theme: Theme) {
  if (accuracy >= 75) return theme.success;
  if (accuracy >= 50) return theme.warning;

  return theme.error;
}

/**
 * Smallest visible fill, in points.
 *
 * One topic of twenty-seven is 3.7%, which across a ~180pt bar is under four
 * points — a mark you would read as a rendering artefact rather than as
 * progress. Below this width the bar stops being proportional and simply says
 * "started", which is the honest reading of a single topic anyway.
 *
 * It is a floor, not a fudge: zero coverage still draws nothing at all.
 */
const MIN_FILL = 8;

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
  const started = Boolean(progress && progress.sessions > 0);
  const canShowCoverage = Boolean(progress && progress.topicsTotal > 0);
  const coverage = canShowCoverage
    ? Math.round((progress!.topicsAttempted / progress!.topicsTotal) * 100)
    : 0;
  const accuracy = progress?.accuracy ?? null;

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
      style={({ pressed, hovered }: any) => [
        practiceTileLayout.tile,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          // Deliberately flat and almost still. The previous version lifted 2pt
          // and scaled to 0.985, which on a list of rows read as the whole page
          // twitching. Responsive, not dramatic.
          ...elevation(1, theme.shadow),
          transform: [{ scale: pressed ? 0.997 : 1 }],
          opacity: hovered && !pressed ? 0.94 : 1,
          transitionProperty: "transform, opacity",
          transitionDuration: motion.fast,
        },
      ]}
    >
      <View style={[styles.spine, { backgroundColor: color }]} />

      <View style={styles.inner}>
        <View style={styles.body}>
          {code ? (
            <View style={styles.codeRow}>
              <MaterialCommunityIcons name={icon} size={15} color={color} />
              <Text style={[styles.code, { color }]} numberOfLines={1}>
                {code}
              </Text>
            </View>
          ) : (
            // Every course in the live data has a code, so this is defensive
            // only: without one the glyph still anchors the row.
            <View style={styles.codeRow}>
              <MaterialCommunityIcons name={icon} size={15} color={color} />
            </View>
          )}

          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {started && canShowCoverage ? (
            <View style={styles.barRow}>
              <View style={[styles.track, { backgroundColor: withAlpha(theme.text, 0.1) }]}>
                {/* Nothing at all at zero; a floor once there is anything. */}
                {progress!.topicsAttempted > 0 ? (
                  <View
                    style={[
                      styles.fill,
                      { width: `${coverage}%`, minWidth: MIN_FILL, backgroundColor: color },
                    ]}
                  />
                ) : null}
              </View>
              <Text style={[styles.fraction, { color: theme.muted }]}>
                {progress!.topicsAttempted}/{progress!.topicsTotal}
              </Text>
            </View>
          ) : started ? (
            // Sessions exist but the topic count does not, so a fraction would
            // be invented. The count it can stand behind goes here instead.
            <Text style={[styles.meta, { color: theme.muted }]}>
              {progress!.sessions} {progress!.sessions === 1 ? "session" : "sessions"}
            </Text>
          ) : (
            <Text style={[styles.meta, { color: theme.muted }]}>Start practising</Text>
          )}
        </View>

        <View style={styles.numberCol}>
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
        </View>
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
    // The spine runs to the card's edge, so it has to be clipped by the radius.
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
  spine: { width: 4 },
  inner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  body: { flex: 1, minWidth: 0 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  code: {
    ...typeScale.micro,
    fontWeight: weight.bold,
    letterSpacing: 0.6,
  },
  title: {
    ...typeScale.bodyLg,
    fontWeight: weight.bold,
    marginTop: 2,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
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
