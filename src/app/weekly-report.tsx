import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { readSession } from "../session";
import { Theme, useThemeMode } from "../theme";
import { PageHeader } from "../ui/PageHeader";
import { Screen } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { SkeletonBar } from "../ui/Skeleton";
import { Stat } from "../ui/Stat";
import { layout, radius, spacing, type, weight, withAlpha } from "../ui/tokens";
import {
  loadWeeklyReport,
  MODE_COLOR,
  MODE_LABEL,
  type DayBar,
  type LearningMode,
  type WeeklyReport,
} from "../weeklyReport";

const WEEKS = [
  { value: "this", label: "This week" },
  { value: "last", label: "Last week" },
] as const;

type WeekKey = (typeof WEEKS)[number]["value"];

/** Tall enough to read a short day, short enough to keep the donut in view. */
const CHART_HEIGHT = 120;

/** Donut geometry. The stroke straddles the radius, so the box is 2r + stroke. */
const RING = 64;
const STROKE = 18;
const BOX = RING * 2 + STROKE;
const CIRCUMFERENCE = 2 * Math.PI * RING;

function formatDuration(minutes: number) {
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * How the week compares with the one before it.
 *
 * Null when the earlier week was empty — "up 100%" from nothing is arithmetic,
 * not information, and a first week should read as a beginning.
 */
function describeChange(now: number, before: number) {
  if (before <= 0) return null;

  const delta = now - before;
  if (delta === 0) return { text: "Level with the week before", tone: "flat" as const };

  const percent = Math.round((Math.abs(delta) / before) * 100);

  return {
    text: `${delta > 0 ? "Up" : "Down"} ${percent}% on the week before`,
    tone: delta > 0 ? ("up" as const) : ("down" as const),
  };
}

/**
 * Where the hours went.
 *
 * A ring rather than a filled pie, because the hole can carry the total — one
 * glance then gives both the split and the size of what is being split. Drawn
 * as three concentric circles with stroke dash offsets rather than arc paths:
 * no trigonometry, and each segment stays one element that can be reasoned
 * about on its own.
 */
export function Donut({ theme, report }: { theme: Theme; report: WeeklyReport }) {
  const total = report.minutes;
  const modes = (Object.keys(MODE_LABEL) as LearningMode[]).filter(
    (mode) => report.byMode[mode] > 0,
  );

  let consumed = 0;

  return (
    <View style={styles.donutRow}>
      <View style={styles.donutWrap}>
        <Svg width={BOX} height={BOX}>
          {/* The track, so a thin week still reads as a ring rather than as a
              broken drawing. */}
          <Circle
            cx={BOX / 2}
            cy={BOX / 2}
            r={RING}
            stroke={withAlpha(theme.text, 0.08)}
            strokeWidth={STROKE}
            fill="none"
          />

          {modes.map((mode) => {
            const length = (report.byMode[mode] / Math.max(1, total)) * CIRCUMFERENCE;
            const offset = consumed;
            consumed += length;

            return (
              <Circle
                key={mode}
                cx={BOX / 2}
                cy={BOX / 2}
                r={RING}
                stroke={MODE_COLOR[mode]}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-offset}
                // Starts at twelve o'clock, where a reader expects a ring to
                // begin, rather than at three.
                transform={`rotate(-90 ${BOX / 2} ${BOX / 2})`}
              />
            );
          })}
        </Svg>

        <View style={styles.donutCentre} pointerEvents="none">
          <Text style={[styles.donutTotal, { color: theme.text }]}>{formatDuration(total)}</Text>
          <Text style={[styles.donutCaption, { color: theme.muted }]}>total</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {(Object.keys(MODE_LABEL) as LearningMode[]).map((mode) => {
          const mins = report.byMode[mode];
          const share = total > 0 ? Math.round((mins / total) * 100) : 0;

          return (
            <View key={mode} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: MODE_COLOR[mode] }]} />

              <View style={styles.legendText}>
                <Text style={[styles.legendLabel, { color: theme.text }]}>{MODE_LABEL[mode]}</Text>
                <Text style={[styles.legendMeta, { color: theme.muted }]}>
                  {formatDuration(mins)} · {share}%
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function Chart({ theme, days }: { theme: Theme; days: DayBar[] }) {
  // One scale across all seven bars so their heights compare. The floor of 1
  // keeps a week of zeroes from dividing by nothing.
  const peak = Math.max(1, ...days.map((day) => day.minutes));

  return (
    <View style={styles.bars}>
      {days.map((day) => {
        const height = Math.round((day.minutes / peak) * CHART_HEIGHT);

        return (
          <View key={day.key} style={styles.column}>
            <Text
              style={[
                styles.barValue,
                { color: day.isToday ? theme.accent : theme.muted },
                day.minutes === 0 && styles.barValueHidden,
              ]}
              numberOfLines={1}
            >
              {day.minutes}
            </Text>

            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    height: Math.max(day.minutes > 0 ? 4 : 0, height),
                    backgroundColor: day.isToday ? theme.accent : withAlpha(theme.text, 0.22),
                  },
                ]}
              />
            </View>

            <Text
              style={[
                styles.barLabel,
                {
                  color: day.isToday ? theme.accent : theme.muted,
                  opacity: day.isFuture ? 0.4 : 1,
                },
              ]}
            >
              {day.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function Courses({ theme, report }: { theme: Theme; report: WeeklyReport }) {
  if (report.topCourses.length === 0) return null;

  const peak = Math.max(1, ...report.topCourses.map((course) => course.minutes));

  return (
    <View style={styles.block}>
      <Text style={[styles.blockTitle, { color: theme.text }]}>Where the time went</Text>

      {report.topCourses.map((course, index) => (
        <View key={course.id} style={styles.courseRow}>
          <View style={styles.courseTop}>
            <Text style={[styles.courseName, { color: theme.text }]} numberOfLines={1}>
              {course.code ? `${course.code} · ` : ""}
              {course.title}
            </Text>
            <Text style={[styles.courseMins, { color: theme.muted }]}>
              {formatDuration(course.minutes)}
            </Text>
          </View>

          <View style={[styles.courseTrack, { backgroundColor: withAlpha(theme.text, 0.07) }]}>
            <View
              style={[
                styles.courseFill,
                {
                  width: `${Math.max(3, Math.round((course.minutes / peak) * 100))}%`,
                  // The busiest course wears the accent and the rest recede, so
                  // the ranking is legible before any number is read.
                  backgroundColor: index === 0 ? theme.accent : withAlpha(theme.text, 0.28),
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function ReportSkeleton({ theme }: { theme: Theme }) {
  const heights = [54, 92, 30, 116, 68, 22, 84];

  return (
    <>
      <View style={styles.hero}>
        <SkeletonBar theme={theme} width={146} height={42} rounded={8} />
        <SkeletonBar theme={theme} width={192} height={13} style={styles.heroSkelNote} />
      </View>

      <View style={styles.donutRow}>
        <SkeletonBar theme={theme} width={BOX} height={BOX} rounded={BOX / 2} />

        <View style={styles.legend}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.legendRow}>
              <SkeletonBar theme={theme} width={10} height={10} />
              <View style={styles.legendText}>
                <SkeletonBar theme={theme} width={62} height={13} />
                <SkeletonBar theme={theme} width={84} height={10} style={styles.legendSkelMeta} />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bars}>
        {heights.map((height, i) => (
          <View key={i} style={styles.column}>
            <View style={styles.track}>
              <SkeletonBar theme={theme} width="100%" height={height} rounded={radius.xs} />
            </View>
            <SkeletonBar theme={theme} width={24} height={10} style={styles.barLabelSkel} />
          </View>
        ))}
      </View>

      <View style={styles.tiles}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.tile}>
            <SkeletonBar theme={theme} width={60} height={28} rounded={6} />
            <SkeletonBar theme={theme} width={96} height={11} style={styles.tileSkelLabel} />
          </View>
        ))}
      </View>

      <View style={styles.block}>
        <SkeletonBar theme={theme} width={152} height={18} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.courseRow}>
            <View style={styles.courseTop}>
              <SkeletonBar theme={theme} width={i % 2 ? 150 : 186} height={13} />
              <SkeletonBar theme={theme} width={44} height={11} />
            </View>
            <SkeletonBar theme={theme} width={`${88 - i * 22}%`} height={8} rounded={radius.pill} />
          </View>
        ))}
      </View>
    </>
  );
}

export default function WeeklyReportPage() {
  const { theme } = useThemeMode();
  const params = useLocalSearchParams<{ week?: string }>();

  // The Monday notification links to ?week=last, because it is an offer to look
  // back at a finished week rather than at one that has barely started.
  const [week, setWeek] = useState<WeekKey>(params.week === "last" ? "last" : "this");
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (which: WeekKey) => {
    try {
      // The session read comes first on purpose. Setting state as the very
      // first statement of something an effect calls is a synchronous setState
      // inside that effect, which cascades a render — React's lint rule refuses
      // it, and rightly. Reading the session touches storage, not the network,
      // so nothing is visibly delayed by waiting for it.
      const state = await readSession();
      setLoading(true);

      // Only a confirmed signed-out state sends anyone to the login screen.
      if (state.status === "signed-out") {
        router.replace("/auth/login");
        return;
      }

      if (state.status === "unavailable") return;

      setReport(await loadWeeklyReport(state.user.id, which === "last" ? -1 : 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(week);
  }, [load, week]);

  const change = report ? describeChange(report.minutes, report.minutesBefore) : null;
  const changeColor =
    change?.tone === "up" ? theme.success : change?.tone === "down" ? theme.warning : theme.muted;

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        theme={theme}
        title="Weekly report"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
      >
        <Segmented theme={theme} value={week} options={WEEKS} onChange={setWeek} stretch />

        {loading ? (
          <ReportSkeleton theme={theme} />
        ) : !report ? null : report.isEmpty ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nothing logged {report.offset === 0 ? "this week" : "that week"}
            </Text>
            <Text style={[styles.emptyText, { color: theme.muted }]}>
              Study time, questions and topics all appear here once there is something to report.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={[styles.heroValue, { color: theme.text }]}>
                {formatDuration(report.minutes)}
              </Text>
              <Text style={[styles.heroNote, { color: changeColor }]}>
                {change ? change.text : `${report.rangeLabel} · your first on record`}
              </Text>
            </View>

            <Donut theme={theme} report={report} />

            <Chart theme={theme} days={report.days} />

            <View style={styles.tiles}>
              <View style={styles.tile}>
                <Stat theme={theme} size="major" value={report.questionsAnswered} label="Questions answered" />
              </View>
              <View style={styles.tile}>
                <Stat
                  theme={theme}
                  size="major"
                  value={report.accuracy === null ? "—" : `${report.accuracy}%`}
                  label={report.accuracy === null ? "No scored sessions" : "Average score"}
                />
              </View>
              <View style={styles.tile}>
                <Stat theme={theme} size="major" value={report.xp} label="XP earned" />
              </View>
              <View style={styles.tile}>
                <Stat theme={theme} size="major" value={report.streakDays} label="Day streak" />
              </View>
              <View style={styles.tile}>
                <Stat theme={theme} size="major" value={report.topicsCompleted} label="Topics completed" />
              </View>
              <View style={styles.tile}>
                <Stat
                  theme={theme}
                  size="major"
                  value={report.bestDay ? report.bestDay.label : "—"}
                  label={
                    report.bestDay
                      ? `Busiest day · ${formatDuration(report.bestDay.minutes)}`
                      : "Busiest day"
                  }
                />
              </View>
            </View>

            <Courses theme={theme} report={report} />

            <Text style={[styles.footnote, { color: theme.muted }]}>
              {report.sessions} {report.sessions === 1 ? "session" : "sessions"} logged. The streak
              counts back from today, so it is the same number whichever week you are looking at.
            </Text>
          </>
        )}
      </PageHeader>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    // PageHeader applies no padding of its own — this style IS the content's
    // padding, and leaving it out bled the chart off both edges of the screen.
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
    gap: spacing.xxl,
  },

  hero: { gap: spacing.xs },
  heroValue: { ...type.mega, fontSize: 46, lineHeight: 50 },
  heroNote: { ...type.body, fontWeight: weight.medium },
  heroSkelNote: { marginTop: spacing.sm },

  // --- donut ---------------------------------------------------------------
  donutRow: { flexDirection: "row", alignItems: "center", gap: spacing.xl },
  donutWrap: { width: BOX, height: BOX, alignItems: "center", justifyContent: "center" },
  donutCentre: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  donutTotal: { ...type.section },
  donutCaption: { ...type.micro, letterSpacing: 0.4, marginTop: 1 },
  legend: { flex: 1, minWidth: 0, gap: spacing.md },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: radius.pill },
  legendText: { flex: 1, minWidth: 0 },
  legendLabel: { ...type.caption, letterSpacing: 0 },
  legendMeta: { ...type.micro, letterSpacing: 0, marginTop: 2 },
  legendSkelMeta: { marginTop: spacing.xs },

  // --- day bars ------------------------------------------------------------
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  column: { flex: 1, alignItems: "center", gap: spacing.xs },
  track: { height: CHART_HEIGHT, width: "100%", justifyContent: "flex-end" },
  fill: { width: "100%", borderTopLeftRadius: radius.xs, borderTopRightRadius: radius.xs },
  barValue: { ...type.micro, letterSpacing: 0 },
  // Kept in the layout rather than removed, so every bar shares a baseline
  // whether or not it has a number above it.
  barValueHidden: { opacity: 0 },
  barLabel: { ...type.micro, letterSpacing: 0.3 },
  barLabelSkel: { marginTop: spacing.xs },

  // --- tiles ---------------------------------------------------------------
  tiles: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xl },
  tile: { width: "50%" },
  tileSkelLabel: { marginTop: spacing.sm },

  // --- courses -------------------------------------------------------------
  block: { gap: spacing.md },
  blockTitle: { ...type.section },
  courseRow: { gap: spacing.sm },
  courseTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  courseName: { ...type.caption, letterSpacing: 0, flex: 1, minWidth: 0 },
  courseMins: { ...type.micro, letterSpacing: 0 },
  courseTrack: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  courseFill: { height: "100%", borderRadius: radius.pill },

  footnote: { ...type.micro, letterSpacing: 0, lineHeight: 16 },

  empty: { gap: spacing.sm, paddingVertical: spacing.xxxl },
  emptyTitle: { ...type.title },
  emptyText: { ...type.body, fontWeight: weight.regular },
});
