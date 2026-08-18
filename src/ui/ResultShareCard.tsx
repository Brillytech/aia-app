import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { radius, spacing, type, weight, withAlpha } from "./tokens";
import { Wordmark } from "./Wordmark";

/**
 * Session date for the card footer, e.g. "18 Aug 2026, 14:32". Lives here
 * rather than in each screen so both cards stamp time identically.
 */
export function formatShareDate(date = new Date()) {
  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" });
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day} ${month} ${date.getFullYear()}, ${hours}:${minutes}`;
}

/**
 * The image a student posts after finishing a practice or exam session.
 *
 * Replaces two separate implementations: practice hand-rolled a ~200-line
 * card carrying its own hardcoded `sharePalette` of hex values that ignored
 * the active theme entirely, and exam had no card at all — it shared a wall
 * of plain text. Both now render this.
 *
 * Every colour resolves from the live `Theme`, so a card generated in dark
 * mode is dark and one generated in light mode is light, and a palette change
 * anywhere in the app carries into what people share.
 *
 * Deliberately static: no `withTiming`, no shared values. `ViewShot` captures
 * whatever is on screen at that instant, so an animated ring could be caught
 * mid-sweep and shipped showing the wrong number.
 */
export function ResultShareCard({
  theme,
  mode,
  accent,
  courseCode,
  courseTitle,
  topicTitle,
  username,
  percent,
  bandLabel,
  bandColor,
  correct,
  total,
  wrong,
  timeLabel,
  xp,
  dateLabel,
}: {
  theme: Theme;
  /** "Practice" or "Exam" — sets the chip. */
  mode: string;
  /** The course hue, used for the ring sweep and the mode chip. */
  accent: string;
  courseCode: string;
  courseTitle?: string | null;
  topicTitle?: string | null;
  username: string;
  percent: number;
  bandLabel: string;
  bandColor: string;
  correct: number;
  total: number;
  wrong: number;
  timeLabel: string;
  xp: number;
  dateLabel: string;
}) {
  const dark = theme.mode === "dark";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      {/* A single wash of the course hue behind the header. One soft tint
          instead of the old card's two stacked "glow" rectangles, which
          fought each other and muddied everything behind them. */}
      <View
        style={[
          styles.wash,
          { backgroundColor: withAlpha(accent, dark ? 0.18 : 0.1) },
        ]}
      />

      {/* A solid hairline of the course hue across the top edge. Small, but it
          is what makes the crop read as a designed card rather than a
          screenshot of a panel. */}
      <View style={[styles.topStripe, { backgroundColor: accent }]} />

      <View style={styles.header}>
        <Wordmark theme={theme} compact />

        <View
          style={[styles.modeChip, { backgroundColor: withAlpha(accent, dark ? 0.3 : 0.16) }]}
        >
          <Text style={[styles.modeChipText, { color: theme.text }]}>
            {mode.toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={[styles.course, { color: theme.text }]} numberOfLines={1}>
        {courseCode}
        {courseTitle ? (
          <Text style={[styles.courseTitle, { color: theme.muted }]}>
            {"  "}
            {courseTitle}
          </Text>
        ) : null}
      </Text>

      {topicTitle ? (
        <Text style={[styles.topic, { color: theme.muted }]} numberOfLines={1}>
          {topicTitle}
        </Text>
      ) : null}

      {/* Score block: the ring is the one thing that should carry across a
          feed at thumbnail size, so it gets the room and everything else
          lines up beside it. */}
      <View style={styles.scoreRow}>
        <ScoreRing
          percent={percent}
          accent={accent}
          trackColor={withAlpha(theme.text, dark ? 0.14 : 0.09)}
          textColor={theme.text}
          labelColor={theme.muted}
        />

        <View style={styles.scoreMeta}>
          <View
            style={[styles.band, { backgroundColor: withAlpha(bandColor, dark ? 0.26 : 0.14) }]}
          >
            <MaterialCommunityIcons name="medal-outline" size={13} color={bandColor} />
            <Text style={[styles.bandText, { color: bandColor }]}>{bandLabel}</Text>
          </View>

          <Text style={[styles.scoreLine, { color: theme.text }]}>
            {correct}
            <Text style={[styles.scoreLineRest, { color: theme.muted }]}>
              {" / "}
              {total} correct
            </Text>
          </Text>

          <Text style={[styles.scoreSub, { color: theme.muted }]}>
            {wrong === 0 ? "Nothing missed" : `${wrong} missed`}
          </Text>
        </View>
      </View>

      {/* Two chips, not a three-up stat strip. The strip repeated the time and
          the question count that the score block above already states, and a
          card people read at thumbnail size cannot afford to say anything
          twice. Everything here appears exactly once. */}
      <View style={styles.chips}>
        <Chip theme={theme} icon="clock-outline" label={timeLabel} tint={accent} />
        <Chip theme={theme} icon="star-four-points" label={`+${xp} XP`} tint={accent} />
      </View>

      {/* Who and when. Without this a shared card is an anonymous statistic —
          the name is the reason anyone posts one. */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Text style={[styles.footerUser, { color: theme.text }]} numberOfLines={1}>
          {username}
          <Text style={[styles.footerDate, { color: theme.muted2 }]}>
            {"  ·  "}
            {dateLabel}
          </Text>
        </Text>

        <Text style={[styles.footerLink, { color: accent }]}>lasuscholar.com</Text>
      </View>
    </View>
  );
}

/** Static sweep — see the note on animation in the card's docblock. */
function ScoreRing({
  percent,
  accent,
  trackColor,
  textColor,
  labelColor,
}: {
  percent: number;
  accent: string;
  trackColor: string;
  textColor: string;
  labelColor: string;
}) {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      <View style={styles.ringCenter}>
        <Text style={[styles.ringPercent, { color: textColor }]}>{Math.round(clamped)}%</Text>
        <Text style={[styles.ringLabel, { color: labelColor }]}>SCORE</Text>
      </View>
    </View>
  );
}

function Chip({
  theme,
  icon,
  label,
  tint,
}: {
  theme: Theme;
  icon: IconName;
  label: string;
  tint: string;
}) {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: withAlpha(tint, theme.mode === "dark" ? 0.18 : 0.1),
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={14} color={tint} />
      <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed width so the captured PNG is the same shape every time, rather than
  // inheriting whatever the host screen's layout happens to be.
  card: {
    width: 340,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    overflow: "hidden",
  },
  wash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 128,
  },
  topStripe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  modeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  modeChipText: {
    ...type.micro,
    letterSpacing: 1,
  },
  course: {
    ...type.section,
    letterSpacing: -0.3,
  },
  courseTitle: {
    ...type.body,
    fontWeight: weight.regular,
  },
  topic: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  scoreMeta: {
    flex: 1,
  },
  ringCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercent: {
    ...type.section,
    letterSpacing: -0.6,
  },
  ringLabel: {
    ...type.micro,
    fontWeight: weight.medium,
    letterSpacing: 0.8,
  },
  band: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  bandText: {
    ...type.micro,
    letterSpacing: 0.4,
  },
  scoreLine: {
    ...type.title,
    letterSpacing: -0.5,
    marginTop: spacing.sm,
  },
  scoreLineRest: {
    ...type.body,
    fontWeight: weight.semi,
  },
  scoreSub: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: {
    ...type.caption,
    letterSpacing: 0,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  footerUser: {
    ...type.caption,
    flex: 1,
  },
  footerDate: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  footerLink: {
    ...type.caption,
    letterSpacing: 0,
  },
});
