import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { category, Theme, useThemeMode } from "../theme";
import { PageHeader } from "../ui/PageHeader";
import { Row, Rows } from "../ui/Rows";
import { Screen } from "../ui/Screen";
import { SkeletonBar } from "../ui/Skeleton";
import { layout, radius, spacing, type, weight, withAlpha } from "../ui/tokens";
import { loadWeeklyReport, type DayBar, type LearningMode, type WeeklyReport } from "../weeklyReport";

/** Tall enough to make a short day legible, short enough to fit above the fold. */
const CHART_HEIGHT = 132;

const MODE_LABEL: Record<LearningMode, string> = {
  study: "Study",
  practice: "Practice",
  exam: "Exam",
};

/** The same hues these three modes wear everywhere else in the app. */
const MODE_COLOR: Record<LearningMode, string> = {
  study: category.blue,
  practice: category.orange,
  exam: category.red,
};

function formatDuration(minutes: number) {
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * How this week compares with last.
 *
 * Returns null when last week was empty — "up 100%" from nothing is arithmetic,
 * not information, and a first week should read as a beginning rather than as a
 * triumph over zero.
 */
function describeChange(thisWeek: number, lastWeek: number) {
  if (lastWeek <= 0) return null;

  const delta = thisWeek - lastWeek;
  if (delta === 0) return { text: "Same as last week", tone: "flat" as const };

  const percent = Math.round((Math.abs(delta) / lastWeek) * 100);

  return {
    text: `${delta > 0 ? "Up" : "Down"} ${percent}% on last week`,
    tone: delta > 0 ? ("up" as const) : ("down" as const),
  };
}

export function Chart({ theme, days }: { theme: Theme; days: DayBar[] }) {
  // One scale for all seven bars, so their heights are comparable. The floor of
  // 1 keeps a week of zeroes from dividing by nothing.
  const peak = Math.max(1, ...days.map((day) => day.minutes));

  return (
    <View style={styles.chart}>
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
                    opacity: day.isFuture ? 0.45 : 1,
                  },
                ]}
              >
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={[styles.chartNote, { color: theme.muted }]}>Minutes studied, Monday to Sunday</Text>
    </View>
  );
}

export function ModeSplit({ theme, report }: { theme: Theme; report: WeeklyReport }) {
  const total = Math.max(1, report.minutesThisWeek);

  return (
    <View style={styles.split}>
      {(Object.keys(MODE_LABEL) as LearningMode[]).map((mode) => {
        const minutes = report.byMode[mode];
        const share = Math.round((minutes / total) * 100);

        return (
          <View key={mode} style={styles.splitRow}>
            <View style={[styles.dot, { backgroundColor: MODE_COLOR[mode] }]} />
            <Text style={[styles.splitLabel, { color: theme.text }]}>{MODE_LABEL[mode]}</Text>

            <View style={[styles.splitTrack, { backgroundColor: withAlpha(theme.text, 0.08) }]}>
              <View
                style={[
                  styles.splitFill,
                  { width: `${minutes > 0 ? Math.max(2, share) : 0}%`, backgroundColor: MODE_COLOR[mode] },
                ]}
              />
            </View>

            <Text style={[styles.splitValue, { color: theme.muted }]}>{formatDuration(minutes)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ReportSkeleton({ theme }: { theme: Theme }) {
  // The bars are the page. Varying their heights keeps the placeholder from
  // reading as a loading bar, and the column widths match the real chart so
  // nothing shifts sideways when the data lands.
  const heights = [58, 96, 34, 120, 72, 20, 88];

  return (
    <>
      <View style={styles.hero}>
        <SkeletonBar theme={theme} width={132} height={38} rounded={8} />
        <SkeletonBar theme={theme} width={168} height={13} style={styles.heroSkelNote} />
      </View>

      <View style={styles.chart}>
        <View style={styles.bars}>
          {heights.map((height, index) => (
            <View key={index} style={styles.column}>
              <View style={styles.track}>
                <SkeletonBar theme={theme} width="100%" height={height} rounded={radius.xs} />
              </View>
              <SkeletonBar theme={theme} width={26} height={10} style={styles.barLabelSkel} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.split}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={styles.splitRow}>
            <SkeletonBar theme={theme} width={8} height={8} />
            <SkeletonBar theme={theme} width={58} height={12} />
            <View style={styles.splitTrack}>
              <SkeletonBar theme={theme} width={`${70 - index * 20}%`} height={6} />
            </View>
            <SkeletonBar theme={theme} width={38} height={12} />
          </View>
        ))}
      </View>

      <Rows theme={theme} title="This week">
        {[0, 1, 2, 3, 4].map((index) => (
          <View key={index} style={styles.statSkelRow}>
            <SkeletonBar theme={theme} width={20} height={20} rounded={6} />
            <View style={styles.statSkelBody}>
              <SkeletonBar theme={theme} width={index % 2 ? 120 : 148} height={14} />
            </View>
            <SkeletonBar theme={theme} width={46} height={13} />
          </View>
        ))}
      </Rows>
    </>
  );
}

export default function WeeklyReportPage() {
  const { theme } = useThemeMode();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      setReport(await loadWeeklyReport(user.id));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const change = report ? describeChange(report.minutesThisWeek, report.minutesLastWeek) : null;
  const changeColor =
    change?.tone === "up" ? theme.success : change?.tone === "down" ? theme.muted : theme.muted;

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        theme={theme}
        title="Weekly report"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
      >
        {loading ? (
          <ReportSkeleton theme={theme} />
        ) : !report ? null : report.isEmpty ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing logged this week</Text>
            <Text style={[styles.emptyText, { color: theme.muted }]}>
              Study time, questions and topics all appear here once the week has something in it.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={[styles.heroValue, { color: theme.text }]}>
                {formatDuration(report.minutesThisWeek)}
              </Text>
              <Text style={[styles.heroNote, { color: changeColor }]}>
                {change ? change.text : "Your first week on record"}
              </Text>
            </View>

            <Chart theme={theme} days={report.days} />

            <ModeSplit theme={theme} report={report} />

            <Rows theme={theme} title="This week">
              <Row
                theme={theme}
                icon="comment-question-outline"
                iconColor={category.yellow}
                label="Questions answered"
                value={String(report.questionsAnswered)}
                chevron={false}
              />
              <Row
                theme={theme}
                icon="target"
                iconColor={category.green}
                label="Average score"
                value={report.accuracy === null ? "—" : `${report.accuracy}%`}
                secondary={report.accuracy === null ? "No finished sessions yet" : undefined}
                chevron={false}
              />
              <Row
                theme={theme}
                icon="star-four-points"
                iconColor={category.purple}
                label="XP earned"
                value={String(report.xp)}
                chevron={false}
              />
              <Row
                theme={theme}
                icon="fire"
                iconColor={category.orange}
                label="Current streak"
                value={report.streakDays === 1 ? "1 day" : `${report.streakDays} days`}
                secondary="Days in a row with study time"
                chevron={false}
              />
              <Row
                theme={theme}
                icon="check-circle-outline"
                iconColor={category.blue}
                label="Topics completed"
                value={String(report.topicsCompleted)}
                chevron={false}
              />
            </Rows>
          </>
        )}
      </PageHeader>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    // PageHeader applies no padding of its own — this style IS the content's
    // padding, and leaving it out bled the first and last bars of the chart
    // off both edges of the screen. Same two values every other page uses.
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
    gap: spacing.xxl,
  },

  hero: {
    gap: spacing.xs,
  },
  heroValue: {
    ...type.mega,
    fontSize: 44,
    lineHeight: 48,
  },
  heroNote: {
    ...type.body,
    fontWeight: weight.medium,
  },
  heroSkelNote: {
    marginTop: spacing.sm,
  },

  chart: {
    gap: spacing.md,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  column: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  track: {
    height: CHART_HEIGHT,
    width: "100%",
    justifyContent: "flex-end",
  },
  fill: {
    width: "100%",
    borderTopLeftRadius: radius.xs,
    borderTopRightRadius: radius.xs,
  },
  barValue: {
    ...type.micro,
    letterSpacing: 0,
  },
  // Kept in the layout rather than removed, so every bar starts at the same
  // baseline whether or not it has a number above it.
  barValueHidden: {
    opacity: 0,
  },
  barLabel: {
    ...type.micro,
    letterSpacing: 0.3,
  },
  barLabelSkel: {
    marginTop: spacing.xs,
  },
  chartNote: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },

  split: {
    gap: spacing.md,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  splitLabel: {
    ...type.caption,
    letterSpacing: 0,
    width: 62,
  },
  splitTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  splitFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  splitValue: {
    ...type.caption,
    letterSpacing: 0,
    width: 58,
    textAlign: "right",
  },

  statSkelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  statSkelBody: {
    flex: 1,
  },

  empty: {
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
  },
  emptyTitle: {
    ...type.title,
  },
  emptyText: {
    ...type.body,
    fontWeight: weight.regular,
  },
});
