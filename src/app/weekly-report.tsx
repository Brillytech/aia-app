import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { readSession } from "../session";
import { category, Theme, useThemeMode } from "../theme";
import { useIsDesktop } from "../ui/layout/breakpoints";
import { PieChart, pieChartHeight, type PieSlice } from "../ui/PieChart";
import { PageHeader } from "../ui/PageHeader";
import { Screen } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { SkeletonBar } from "../ui/Skeleton";
import { Stat } from "../ui/Stat";
import { subjectColor } from "../ui/subject";
import { layout, radius, spacing, type, weight, withAlpha } from "../ui/tokens";
import {
  loadWeeklyReport,
  MODE_COLOR,
  MODE_LABEL,
  type DayBar,
  type LearningMode,
  type WeeklyReport,
} from "../weeklyReport";

/** A panel's horizontal padding, which a chart inside one has to allow for. */
const SECTION_PAD = spacing.lg;

/**
 * Where one column becomes two.
 *
 * Below this a panel is the width of the screen and that is correct. Above
 * it, a single column leaves a 560pt chart adrift in a 1200pt card.
 */
const TWO_COL_MIN = 760;

/** Mirrors the root layout's cap; see useContentWidth below. */
const COLUMN_MAX_WIDTH = 480;

/**
 * How wide a chart may draw.
 *
 * The page gutters either side, capped so a pie on a desktop does not become
 * a dinner plate with its labels marooned at the screen edges.
 */
/**
 * The width the page actually gets, which is not the window.
 *
 * Below 1024 the root layout caps the whole app at a 480pt column, so a
 * breakpoint read off the window would flip this page into two columns at
 * 800 while the content was still 480 wide. Two columns therefore only ever
 * happen on desktop, where the cap is lifted — which is the case the long
 * cards were a problem in.
 */
function useContentWidth() {
  const { width } = useWindowDimensions();
  const desktop = useIsDesktop();

  return desktop ? width : Math.min(COLUMN_MAX_WIDTH, width);
}

function useColumns() {
  return useContentWidth() >= TWO_COL_MIN ? 2 : 1;
}

function useChartWidth() {
  const width = useContentWidth();
  const columns = useColumns();

  // The page gutters AND the panel the chart sits in. Counting only the page
  // gutters overflowed every chart by the panel padding, which clipped the
  // right-hand labels clean off at the panel edge.
  // The page gutters, then the panel's own padding, then — in two columns
  // — the half of the row this panel actually occupies and the gutter
  // between the pair. Measuring against the window alone overflowed every
  // chart by whatever it had not accounted for.
  const page = width - layout.screenGutter * 2;
  const panel = columns === 2 ? (page - spacing.md) / 2 : page;
  const available = panel - SECTION_PAD * 2;

  return { width: Math.min(560, Math.max(240, available)) };
}

const WEEKS = [
  { value: "this", label: "This week" },
  { value: "last", label: "Last week" },
] as const;

type WeekKey = (typeof WEEKS)[number]["value"];

/** Tall enough to read a short day, short enough to keep the donut in view. */
const CHART_HEIGHT = 120;

/** Donut geometry. The stroke straddles the radius, so the box is 2r + stroke. */
/** The placeholder disc, near enough to the pie it stands in for. */
const DISC = 150;

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
 * The same pie as the course split below it, so the page teaches its chart
 * once. It replaced a ring with a legend beside it: a legend is read twice,
 * once at the slice and once at the key, matching them up by colour, where a
 * label on a leader line points at what it names.
 *
 * The hole went with the legend. It had carried the total, and the total is
 * already the number at the top of this page in letters an inch tall.
 */
export function Donut({ theme, report }: { theme: Theme; report: WeeklyReport }) {
  const { width } = useChartWidth();

  const slices: PieSlice[] = (Object.keys(MODE_LABEL) as LearningMode[])
    .filter((mode) => report.byMode[mode] > 0)
    .map((mode) => ({
      key: mode,
      label: MODE_LABEL[mode],
      value: report.byMode[mode],
      color: MODE_COLOR[mode],
    }));

  if (slices.length === 0) return null;

  // Minutes, so the figure in each label reads as what it is.
  return <PieChart theme={theme} width={width} slices={slices} unit="m" />;
}

/**
 * One block of the report: a panel, a heading, and the thing itself.
 *
 * Every block used to sit directly on the page background, separated from
 * the next by 24pt of nothing and, in three cases out of five, carrying no
 * heading at all — the bar chart and the statistics grid simply appeared.
 * A panel says where a block starts and stops without spending vertical
 * space to do it, which is how the page got shorter and clearer at once.
 */
function Section({
  theme,
  title,
  note,
  wide,
  children,
}: {
  theme: Theme;
  title: string;
  note?: string;
  /** Spans both columns. For blocks that are lists rather than figures. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const columns = useColumns();
  const width = columns === 1 || wide ? "100%" : "49%";

  return (
    <View style={[styles.section, { width, backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {note ? <Text style={[styles.sectionNote, { color: theme.muted }]}>{note}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/**
 * The week, one slim column a day.
 *
 * It was seven wide blocks with a number over every one — fourteen things
 * to read for a shape the eye takes in at a glance. The bars are narrow now
 * and fully rounded, each standing in a faint full-height track so a quiet
 * day still shows where it sits against a loud one, and only the best day
 * is called out, in a chip above its bar. The other numbers went: the axis
 * says which day and the panel heading says what is counted.
 */
export function Chart({ theme, days }: { theme: Theme; days: DayBar[] }) {
  // One scale across all seven bars so their heights compare. The floor of 1
  // keeps a week of zeroes from dividing by nothing.
  const peak = Math.max(1, ...days.map((day) => day.minutes));
  const best = days.reduce<DayBar | null>(
    (top, day) => (day.minutes > 0 && (!top || day.minutes > top.minutes) ? day : top),
    null,
  );

  return (
    <View style={styles.bars}>
      {days.map((day) => {
        const height = Math.round((day.minutes / peak) * CHART_HEIGHT);
        const isBest = best?.key === day.key;

        return (
          <View key={day.key} style={styles.column}>
            {/* Only the best day carries a figure, the way a chart calls out
                its peak rather than annotating every point. */}
            <View style={styles.chipSlot}>
              {isBest ? (
                <View style={[styles.chip, { backgroundColor: theme.text }]}>
                  <Text style={[styles.chipText, { color: theme.bg }]} numberOfLines={1}>
                    {day.minutes}m
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.track, { backgroundColor: withAlpha(theme.text, 0.05) }]}>
              <View
                style={[
                  styles.fill,
                  {
                    height: Math.max(day.minutes > 0 ? 6 : 0, height),
                    backgroundColor: isBest
                      ? theme.accent
                      : day.isToday
                        ? withAlpha(theme.accent, 0.5)
                        : withAlpha(theme.text, 0.18),
                  },
                ]}
              />
            </View>

            <Text
              style={[
                styles.barLabel,
                {
                  color: day.isToday ? theme.accent : theme.muted,
                  opacity: day.isFuture ? 0.35 : 1,
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
/**
 * A course's own hue, unless another course in this pie already took it.
 *
 * subjectColor() is what gives a course its colour on its Practice tile, so
 * reusing it means a course looks the same wherever the student meets it. It
 * draws from seven category colours across sixty courses though, so
 * collisions are routine — two of the five in a typical week came back the
 * same orange and read as one slice. The real hue is kept where it is free
 * and an unused one taken where it is not: usually matching the tile, never
 * matching the neighbour.
 */
/**
 * A course's colour, de-collided within one list.
 *
 * Shared by the pie and the table below it so a course is the same colour
 * in both; two blocks naming the same five courses in different colours
 * would be worse than no colour at all.
 */
function courseColors(rows: { code: string | null; title: string }[]): string[] {
  const pool = Object.values(category);
  const used = new Set<string>();

  return rows.map((row, index) => {
    const wanted = subjectColor(row, index);

    if (!used.has(wanted)) {
      used.add(wanted);
      return wanted;
    }

    const free = pool.find((colour) => !used.has(colour)) ?? wanted;
    used.add(free);
    return free;
  });
}

/**
 * Which courses the week's questions went to.
 *
 * Colour names the course here, where in the pie above it names the mode. It
 * is the same chart either way, which is the point: one way of showing a
 * split, learned once.
 */
export function QuestionsByCourse({ theme, report }: { theme: Theme; report: WeeklyReport }) {
  const { width } = useChartWidth();
  const named = report.questionsByCourse;

  if (named.length === 0) return null;

  const inNamed = named.reduce((sum, row) => sum + row.questions, 0);
  if (inNamed === 0) return null;

  /**
   * Everything past the top five, as one slice.
   *
   * Both figures come from the same fetched rows, so the remainder cannot go
   * negative and the pie always adds up to the headline count above it.
   * Without this the chart said 84 where the page said 121.
   */
  const other = Math.max(0, report.questionsAnswered - inNamed);
  const colours = courseColors(named);

  const slices: PieSlice[] = [
    ...named.map((row, index) => ({
      key: row.id,
      label: row.code || row.title,
      longLabel: row.title,
      value: row.questions,
      color: colours[index],
    })),
    // "Other" is not a course, so it is given no identity — just a grey.
    ...(other > 0
      ? [{ key: "other", label: "Other", value: other, color: withAlpha(theme.text, 0.22) }]
      : []),
  ];

  return <PieChart theme={theme} width={width} slices={slices} />;
}

/**
 * Where the time went.
 *
 * Five full-width grey bars stacked down the panel was the heaviest block
 * on the page, and it repeated a shape the pies above had already used
 * twice. This is a table instead: rank, the course in its own colour, the
 * time, the share. The colour is the one it wears in the pie above, so the
 * two blocks read as one account of the week rather than two lists of the
 * same courses.
 *
 * The bar survives as a hairline under each row. It carries the comparison
 * without being the row.
 */
export function Courses({ theme, report }: { theme: Theme; report: WeeklyReport }) {
  if (report.topCourses.length === 0) return null;

  const total = Math.max(
    1,
    report.topCourses.reduce((sum, course) => sum + course.minutes, 0),
  );
  const colours = courseColors(report.topCourses);

  return (
    <View style={styles.courseList}>
      {report.topCourses.map((course, index) => (
        <View key={course.id}>
          <View style={styles.courseRow}>
            <Text style={[styles.courseRank, { color: theme.muted2 }]}>{index + 1}</Text>

            <View style={[styles.courseDot, { backgroundColor: colours[index] }]} />

            <View style={styles.flex1}>
              <Text style={[styles.courseCode, { color: theme.text }]} numberOfLines={1}>
                {course.code || course.title}
              </Text>
              {course.code ? (
                <Text style={[styles.courseTitle, { color: theme.muted }]} numberOfLines={1}>
                  {course.title}
                </Text>
              ) : null}
            </View>

            <View style={styles.courseFigures}>
              <Text style={[styles.courseTime, { color: theme.text }]}>
                {formatDuration(course.minutes)}
              </Text>
              <Text style={[styles.courseShare, { color: theme.muted }]}>
                {Math.round((course.minutes / total) * 100)}%
              </Text>
            </View>
          </View>

          <View style={[styles.courseRule, { backgroundColor: withAlpha(theme.text, 0.06) }]}>
            <View
              style={[
                styles.courseRuleFill,
                {
                  width: `${Math.max(4, Math.round((course.minutes / total) * 100))}%`,
                  backgroundColor: colours[index],
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A panel's placeholder: the heading bar, then whatever stands in below. */
function SkelSection({
  theme,
  titleWidth,
  children,
}: {
  theme: Theme;
  titleWidth: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <SkeletonBar theme={theme} width={titleWidth} height={17} />
      <SkeletonBar theme={theme} width={titleWidth - 36} height={10} style={styles.sectionNoteSkel} />
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** A disc with label stubs either side, at the height the real pie will take. */
function PieSkel({ theme, width, slices }: { theme: Theme; width: number; slices: number }) {
  const perSide = Math.ceil(slices / 2);

  return (
    <View style={[styles.pieSkel, { height: pieChartHeight(width, slices) }]}>
      <View style={styles.pieSkelSide}>
        {Array.from({ length: perSide }).map((_, i) => (
          <SkeletonBar key={i} theme={theme} width={72} height={26} rounded={7} />
        ))}
      </View>

      <SkeletonBar theme={theme} width={DISC} height={DISC} rounded={DISC / 2} />

      <View style={[styles.pieSkelSide, styles.pieSkelRight]}>
        {Array.from({ length: slices - perSide }).map((_, i) => (
          <SkeletonBar key={i} theme={theme} width={72} height={26} rounded={7} />
        ))}
      </View>
    </View>
  );
}

function ReportSkeleton({ theme }: { theme: Theme }) {
  const heights = [54, 92, 30, 116, 68, 22, 84];
  const { width: chartWidth } = useChartWidth();

  return (
    <>
      <View style={styles.hero}>
        <SkeletonBar theme={theme} width={146} height={42} rounded={8} />
        <SkeletonBar theme={theme} width={192} height={13} style={styles.heroSkelNote} />
      </View>

        <SkeletonBar theme={theme} width={160} height={18} />

      <SkelSection theme={theme} titleWidth={92}>
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
      </SkelSection>

      <SkelSection theme={theme} titleWidth={168}>
        <PieSkel theme={theme} width={chartWidth} slices={3} />
      </SkelSection>

      <SkelSection theme={theme} titleWidth={188}>
        <PieSkel theme={theme} width={chartWidth} slices={6} />
      </SkelSection>

      <SkelSection theme={theme} titleWidth={152}>
        <View style={styles.tiles}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.tile}>
              <SkeletonBar theme={theme} width={60} height={28} rounded={6} />
              <SkeletonBar theme={theme} width={96} height={11} style={styles.tileSkelLabel} />
            </View>
          ))}
        </View>
      </SkelSection>

      <SkelSection theme={theme} titleWidth={176}>
        <View style={styles.courseList}>
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
      </SkelSection>
    </>
  );
}

/**
 * The report itself, once there is one.
 *
 * Separate from the route so it can be rendered against any week — the page
 * around it needs a session and a round trip before it will show anything,
 * which made the layout impossible to look at while building it.
 */
export function ReportBody({ theme, report }: { theme: Theme; report: WeeklyReport }) {
  const change = describeChange(report.minutes, report.minutesBefore);
  const changeColor =
    change?.tone === "up" ? theme.success : change?.tone === "down" ? theme.warning : theme.muted;

  return (
    <>
  <View style={styles.hero}>
    <Text style={[styles.heroValue, { color: theme.text }]}>
      {formatDuration(report.minutes)}
    </Text>
    <Text style={[styles.heroNote, { color: changeColor }]}>
      {change ? change.text : `${report.rangeLabel} · your first on record`}
    </Text>
  </View>

  <View style={styles.grid}>
  <Section theme={theme} title="Each day" note="Minutes logged, Monday to Sunday">
    <Chart theme={theme} days={report.days} />
  </Section>

  <Section
    theme={theme}
    title="How the time split"
    note={`${formatDuration(report.minutes)} across study, practice and exam`}
  >
    <Donut theme={theme} report={report} />
  </Section>

  <Section
    theme={theme}
    title="Questions by course"
    note={`${report.questionsAnswered} answered this week`}
  >
    <QuestionsByCourse theme={theme} report={report} />
  </Section>

  <Section theme={theme} title="The week in numbers">
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
  </Section>

  {report.topCourses.length > 0 ? (
    <Section theme={theme} title="Where the time went" note="Your busiest courses">
      <Courses theme={theme} report={report} />
    </Section>
  ) : null}
  </View>

  <Text style={[styles.footnote, { color: theme.muted }]}>
    {report.sessions} {report.sessions === 1 ? "session" : "sessions"} logged. The streak
    counts back from today, so it is the same number whichever week you are looking at.
  </Text>
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
          <ReportBody theme={theme} report={report} />
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
    // Panels carry their own padding now, so the page between them needs far
    // less: 24 of empty background between five unbounded blocks was most of
    // what made this page feel like scattered pieces.
    gap: spacing.md,
  },

  hero: { gap: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  heroValue: { ...type.mega, fontSize: 44, lineHeight: 48 },
  heroNote: { ...type.body, fontWeight: weight.medium, letterSpacing: 0 },
  heroSkelNote: { marginTop: spacing.sm },

  // --- donut ---------------------------------------------------------------
  pieSkel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  pieSkelSide: { gap: spacing.xl, flex: 1 },
  pieSkelRight: { alignItems: "flex-end" },

  // --- day bars ------------------------------------------------------------
  // --- the week's bars -----------------------------------------------------
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  // A fixed slot above every column so the chip on one bar does not shift
  // the other six down.
  // The slot reserves the height; the chip itself is taken out of the flow
  // so it can be wider than the 40pt column it sits over. Left in flow it
  // was squeezed to the column width and "1h 32m" broke across two lines.
  chipSlot: { height: 22, width: "100%", alignItems: "center", justifyContent: "flex-end" },
  chip: {
    position: "absolute",
    bottom: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  chipText: { fontSize: 10, lineHeight: 13, fontWeight: weight.bold, letterSpacing: 0 },
  column: { flex: 1, alignItems: "center", gap: 6 },
  // Narrow and fully rounded, standing in a faint full-height track. The
  // old bar filled its column edge to edge with only its top corners
  // rounded, which is the block the reference chart is not.
  track: { height: CHART_HEIGHT, width: 12, borderRadius: radius.pill, justifyContent: "flex-end", overflow: "hidden" },
  fill: { width: "100%", borderRadius: radius.pill },
  // Kept in the layout rather than removed, so every bar shares a baseline
  // whether or not it has a number above it.
  barLabel: { ...type.micro, fontWeight: weight.medium, letterSpacing: 0.3 },
  barLabelSkel: { marginTop: spacing.xs },

  // --- tiles ---------------------------------------------------------------
  tiles: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.lg },
  tile: { width: "50%" },
  tileSkelLabel: { marginTop: spacing.sm },

  // --- courses -------------------------------------------------------------
  // Panels flow into however many columns fit; each row is as tall as its
  // tallest panel, which is what keeps the two columns aligned.
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    rowGap: spacing.md,
  },
  section: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SECTION_PAD,
    paddingVertical: spacing.lg,
  },
  sectionTitle: { ...type.section, fontSize: 16, lineHeight: 21, letterSpacing: -0.1 },
  sectionNote: { ...type.micro, fontWeight: weight.regular, letterSpacing: 0, marginTop: 3 },
  sectionBody: { marginTop: spacing.lg },
  sectionNoteSkel: { marginTop: 6 },
  // --- where the time went -------------------------------------------------
  courseList: { gap: spacing.lg },
  flex1: { flex: 1, minWidth: 0 },
  courseRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  courseRank: { ...type.micro, fontWeight: weight.bold, letterSpacing: 0, width: 12 },
  courseDot: { width: 8, height: 8, borderRadius: 4 },
  courseCode: { ...type.caption, letterSpacing: 0 },
  courseTitle: { ...type.micro, fontWeight: weight.regular, letterSpacing: 0, marginTop: 1 },
  courseFigures: { alignItems: "flex-end" },
  courseTime: { ...type.caption, letterSpacing: 0 },
  courseShare: { ...type.micro, fontWeight: weight.regular, letterSpacing: 0, marginTop: 1 },
  courseRule: { height: 3, borderRadius: 2, overflow: "hidden", marginTop: spacing.sm },
  courseRuleFill: { height: 3, borderRadius: 2 },
  courseTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },

  footnote: { ...type.micro, fontWeight: weight.regular, letterSpacing: 0, lineHeight: 16 },

  empty: { gap: spacing.sm, paddingVertical: spacing.xxxl },
  emptyTitle: { ...type.title },
  emptyText: { ...type.body, fontWeight: weight.regular },
});
