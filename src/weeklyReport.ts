import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { localDayKey, localWeekDays, startOfLocalWeek } from "./days";
import { notifyAndPopup } from "./notify";
import { sessionUser } from "./session";
import { category } from "./theme";

/**
 * The week, as the student actually spent it.
 *
 * Everything is derived from rows the app already writes — no new tables, no
 * new columns. The one number deliberately NOT taken from the database as-is is
 * the streak: `profiles.daily_streak` is incremented whenever the dashboard
 * loads, with no gate on activity, so it counts app opens. A page about how much
 * you studied cannot put that number next to the minutes and call both true.
 * The streak here is consecutive days with recorded learning time.
 *
 * ANY WEEK, NOT JUST THIS ONE
 * The report used to be hard-wired to the current week while the Monday
 * notification said "last week is ready" — so the one moment it was most likely
 * to be opened was the moment it showed a week that had barely started.
 * `offset` fixes that: 0 is this week, -1 is last week, and the notification
 * now links to -1.
 */

export type LearningMode = "study" | "practice" | "exam";

export type DayBar = {
  /** `YYYY-MM-DD`, local. */
  key: string;
  label: string;
  minutes: number;
  isToday: boolean;
  isFuture: boolean;
};

export type CourseSlice = {
  id: string;
  title: string;
  code: string | null;
  minutes: number;
};

export type WeeklyReport = {
  /** 0 for this week, -1 for last. */
  offset: number;
  rangeLabel: string;
  days: DayBar[];
  minutes: number;
  minutesBefore: number;
  byMode: Record<LearningMode, number>;
  questionsAnswered: number;
  accuracy: number | null;
  xp: number;
  streakDays: number;
  topicsCompleted: number;
  sessions: number;
  /** Busiest day of the week, or null when nothing was logged. */
  bestDay: DayBar | null;
  topCourses: CourseSlice[];
  isEmpty: boolean;
};

const MODES: LearningMode[] = ["study", "practice", "exam"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Far enough back to cover the previous week's comparison and any streak. */
const LOOKBACK_DAYS = 120;
const MAX_LOGS = 4000;
const TOP_COURSES = 4;

export const MODE_COLOR: Record<LearningMode, string> = {
  study: category.blue,
  practice: category.orange,
  exam: category.red,
};

export const MODE_LABEL: Record<LearningMode, string> = {
  study: "Study",
  practice: "Practice",
  exam: "Exam",
};

function emptyModes(): Record<LearningMode, number> {
  return { study: 0, practice: 0, exam: 0 };
}

function asMode(value: unknown): LearningMode | null {
  const clean = String(value || "").toLowerCase();

  return (MODES as string[]).includes(clean) ? (clean as LearningMode) : null;
}

function weekStartFor(offset: number) {
  const start = startOfLocalWeek();
  start.setDate(start.getDate() + offset * 7);

  return start;
}

export async function loadWeeklyReport(userId: string, offset = 0): Promise<WeeklyReport> {
  const weekStart = weekStartFor(offset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);

  const fromIso = weekStart.toISOString();
  const toIso = weekEnd.toISOString();

  const [logs, practiceAnswers, examAnswers, practiceScores, examScores, xpRows, topics] =
    await Promise.all([
      // One query serves the chart, the previous week's comparison, the streak
      // and the course split — the same rows sliced four ways.
      supabase
        .from("user_activity_logs")
        .select("mode, duration_seconds, created_at, course_id")
        .eq("user_id", userId)
        .gte("created_at", lookback.toISOString())
        .order("created_at", { ascending: false })
        .limit(MAX_LOGS),
      supabase
        .from("practice_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("selected_answer", "is", null)
        .gte("created_at", fromIso)
        .lt("created_at", toIso),
      supabase
        .from("exam_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("selected_answer", "is", null)
        .gte("created_at", fromIso)
        .lt("created_at", toIso),
      supabase
        .from("practice_attempts")
        .select("score_percent")
        .eq("user_id", userId)
        .gte("created_at", fromIso)
        .lt("created_at", toIso),
      supabase
        .from("exam_attempts")
        .select("score_percent")
        .eq("user_id", userId)
        .gte("created_at", fromIso)
        .lt("created_at", toIso),
      supabase
        .from("xp_events")
        .select("xp")
        .eq("user_id", userId)
        .gte("created_at", fromIso)
        .lt("created_at", toIso),
      supabase
        .from("user_topic_progress")
        .select("topic_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("completed", true)
        .gte("completed_at", fromIso)
        .lt("completed_at", toIso),
    ]);

  // --- minutes, by day, mode and course ------------------------------------
  const perDay = new Map<string, Record<LearningMode, number>>();
  const perCourse = new Map<string, number>();
  const weekKeys = new Set(localWeekDays(weekStart));
  let sessions = 0;

  for (const row of logs.data || []) {
    const key = localDayKey((row as any).created_at);
    if (!key) continue;

    const mode = asMode((row as any).mode);
    if (!mode) continue;

    const seconds = Number((row as any).duration_seconds) || 0;
    const bucket = perDay.get(key) || emptyModes();
    bucket[mode] += seconds;
    perDay.set(key, bucket);

    if (weekKeys.has(key)) {
      sessions += 1;

      const courseId = (row as any).course_id;
      if (courseId) perCourse.set(courseId, (perCourse.get(courseId) || 0) + seconds);
    }
  }

  const todayKey = localDayKey(new Date());

  const days: DayBar[] = localWeekDays(weekStart).map((key, index) => {
    const seconds = perDay.get(key) || emptyModes();

    return {
      key,
      label: DAY_LABELS[index],
      minutes: Math.round((seconds.study + seconds.practice + seconds.exam) / 60),
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });

  const byMode = emptyModes();
  for (const key of weekKeys) {
    const seconds = perDay.get(key);
    if (!seconds) continue;
    for (const mode of MODES) byMode[mode] += seconds[mode];
  }
  for (const mode of MODES) byMode[mode] = Math.round(byMode[mode] / 60);

  const minutes = byMode.study + byMode.practice + byMode.exam;

  const beforeKeys = localWeekDays(weekStartFor(offset - 1));
  const minutesBefore = beforeKeys.reduce((sum, key) => {
    const seconds = perDay.get(key);
    if (!seconds) return sum;

    return sum + Math.round((seconds.study + seconds.practice + seconds.exam) / 60);
  }, 0);

  // --- streak, always measured to today ------------------------------------
  const active = new Set(
    [...perDay.entries()]
      .filter(([, s]) => s.study + s.practice + s.exam > 0)
      .map(([key]) => key),
  );
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  let streakDays = 0;
  while (active.has(localDayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // --- where the time went -------------------------------------------------
  const courseIds = [...perCourse.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_COURSES)
    .map(([id]) => id);

  let topCourses: CourseSlice[] = [];

  if (courseIds.length) {
    const { data: courseRows } = await supabase
      .from("courses")
      .select("id, title, code")
      .in("id", courseIds);

    const byId = new Map((courseRows || []).map((c: any) => [c.id, c]));

    topCourses = courseIds.map((id) => ({
      id,
      title: byId.get(id)?.title || "Untitled course",
      code: byId.get(id)?.code ?? null,
      minutes: Math.round((perCourse.get(id) || 0) / 60),
    }));
  }

  // --- the rest -------------------------------------------------------------
  const scores = [...(practiceScores.data || []), ...(examScores.data || [])]
    .map((row: any) => Number(row.score_percent))
    .filter((n) => Number.isFinite(n));

  const questionsAnswered = (practiceAnswers.count || 0) + (examAnswers.count || 0);
  const xp = (xpRows.data || []).reduce((sum: number, row: any) => sum + (Number(row.xp) || 0), 0);
  const topicsCompleted = topics.count || 0;

  const withTime = days.filter((day) => day.minutes > 0);
  const bestDay = withTime.length
    ? withTime.reduce((best, day) => (day.minutes > best.minutes ? day : best))
    : null;

  return {
    offset,
    rangeLabel: offset === 0 ? "This week" : "Last week",
    days,
    minutes,
    minutesBefore,
    byMode,
    questionsAnswered,
    accuracy: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
    xp,
    streakDays,
    topicsCompleted,
    sessions,
    bestDay,
    topCourses,
    isEmpty: minutes === 0 && questionsAnswered === 0 && topicsCompleted === 0,
  };
}

// ---------------------------------------------------------------------------
// The Monday nudge
// ---------------------------------------------------------------------------

const SEEN_KEY = "lasu_scholar_weekly_report_seen";

/**
 * Offers last week's report, once, on the first open of a new week.
 *
 * Keyed by the week rather than a timestamp: the stored value is the Monday it
 * was last offered for, so a second open on the same Monday — or the Thursday —
 * matches and stays quiet, and the next Monday does not.
 *
 * The link carries `?week=last`, because this is an offer to look back. Without
 * it the notification said "last week is ready" and opened a report of the week
 * that had barely started.
 */
export async function maybeOfferWeeklyReport(): Promise<boolean> {
  const thisWeekKey = localDayKey(startOfLocalWeek());

  const seen = await AsyncStorage.getItem(SEEN_KEY);
  if (seen === thisWeekKey) return false;

  const user = await sessionUser();
  if (!user) return false;

  const lastWeekStart = weekStartFor(-1);

  const { data, error } = await supabase
    .from("user_activity_logs")
    .select("id")
    .eq("user_id", user.id)
    .gte("created_at", lastWeekStart.toISOString())
    .lt("created_at", startOfLocalWeek().toISOString())
    .limit(1);

  // A failed read is not an empty week; stay quiet and try again next open.
  if (error) return false;

  // Recorded whether or not last week had anything, so an empty week is not
  // re-checked on every open for the next seven days.
  await AsyncStorage.setItem(SEEN_KEY, thisWeekKey);

  if ((data?.length ?? 0) === 0) return false;

  const title = "Your week in review";
  const message = "Last week is ready — time studied, questions answered and where it went.";

  // 144 hours is six days: long enough that one Monday's report cannot be
  // written twice, short enough that next Monday's is never suppressed. The
  // AsyncStorage key above already guards this per device; the window is what
  // guards it on the second device.
  return notifyAndPopup(
    {
      type: "weekly_report",
      title,
      message,
      actionUrl: "/weekly-report?week=last",
      dedupeHours: 144,
    },
    {
      key: "weekly_report",
      kicker: "Weekly report",
      title,
      message,
      icon: "chart-timeline-variant",
      accent: category.purple,
      href: "/weekly-report?week=last",
      actionLabel: "View report",
    },
  );
}
