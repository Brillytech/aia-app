import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { sessionUser } from "./session";
import { localDayKey, localWeekDays, startOfLocalWeek } from "./days";
import { showPopup } from "./notify";
import { category } from "./theme";

/**
 * The week, as the student actually spent it.
 *
 * Everything here is derived from rows the app already writes — no new tables,
 * no new columns. The one number deliberately NOT taken from the database as-is
 * is the streak: `profiles.daily_streak` is incremented whenever the dashboard
 * loads, with no gate on activity, so it counts app opens. A page about how much
 * you studied cannot put that number next to the minutes and call both true.
 * The streak below is consecutive days with recorded learning time.
 */

export type LearningMode = "study" | "practice" | "exam";

export type DayBar = {
  /** `YYYY-MM-DD`, local. */
  key: string;
  /** Mon, Tue… for the axis. */
  label: string;
  minutes: number;
  byMode: Record<LearningMode, number>;
  isToday: boolean;
  isFuture: boolean;
};

export type WeeklyReport = {
  days: DayBar[];
  minutesThisWeek: number;
  minutesLastWeek: number;
  byMode: Record<LearningMode, number>;
  questionsAnswered: number;
  /** Mean score across the week's finished sessions, or null with none. */
  accuracy: number | null;
  xp: number;
  /** Consecutive days ending today with any recorded learning time. */
  streakDays: number;
  topicsCompleted: number;
  /** True when the week is genuinely empty — the page says so rather than drawing zero. */
  isEmpty: boolean;
};

const MODES: LearningMode[] = ["study", "practice", "exam"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Far enough back to cover last week's comparison and any plausible streak. */
const LOOKBACK_DAYS = 90;
const MAX_LOGS = 3000;

function emptyModes(): Record<LearningMode, number> {
  return { study: 0, practice: 0, exam: 0 };
}

function asMode(value: unknown): LearningMode | null {
  const clean = String(value || "").toLowerCase();

  return (MODES as string[]).includes(clean) ? (clean as LearningMode) : null;
}

export async function loadWeeklyReport(userId: string): Promise<WeeklyReport> {
  const weekStart = startOfLocalWeek();
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);

  const weekStartIso = weekStart.toISOString();

  const [logs, practiceAnswers, examAnswers, practiceScores, examScores, xpRows, topics] =
    await Promise.all([
      // One query covers the chart, last week's total AND the streak — all three
      // are the same rows sliced differently.
      supabase
        .from("user_activity_logs")
        .select("mode, duration_seconds, created_at")
        .eq("user_id", userId)
        .gte("created_at", lookback.toISOString())
        .order("created_at", { ascending: false })
        .limit(MAX_LOGS),
      supabase
        .from("practice_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("selected_answer", "is", null)
        .gte("created_at", weekStartIso),
      supabase
        .from("exam_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("selected_answer", "is", null)
        .gte("created_at", weekStartIso),
      supabase
        .from("practice_attempts")
        .select("score_percent")
        .eq("user_id", userId)
        .gte("created_at", weekStartIso),
      supabase
        .from("exam_attempts")
        .select("score_percent")
        .eq("user_id", userId)
        .gte("created_at", weekStartIso),
      supabase
        .from("xp_events")
        .select("xp")
        .eq("user_id", userId)
        .gte("created_at", weekStartIso),
      supabase
        .from("user_topic_progress")
        .select("topic_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("completed", true)
        .gte("completed_at", weekStartIso),
    ]);

  // --- minutes, by day and by mode -----------------------------------------
  const perDay = new Map<string, Record<LearningMode, number>>();

  for (const row of logs.data || []) {
    const key = localDayKey((row as any).created_at);
    if (!key) continue;

    const mode = asMode((row as any).mode);
    if (!mode) continue;

    const seconds = Number((row as any).duration_seconds) || 0;
    const bucket = perDay.get(key) || emptyModes();

    bucket[mode] += seconds;
    perDay.set(key, bucket);
  }

  const todayKey = localDayKey(new Date());
  const weekKeys = localWeekDays();

  const days: DayBar[] = weekKeys.map((key, index) => {
    const seconds = perDay.get(key) || emptyModes();
    const byMode = {
      study: Math.round(seconds.study / 60),
      practice: Math.round(seconds.practice / 60),
      exam: Math.round(seconds.exam / 60),
    };

    return {
      key,
      label: DAY_LABELS[index],
      minutes: byMode.study + byMode.practice + byMode.exam,
      byMode,
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });

  const byMode = emptyModes();
  for (const day of days) {
    for (const mode of MODES) byMode[mode] += day.byMode[mode];
  }
  const minutesThisWeek = byMode.study + byMode.practice + byMode.exam;

  const lastWeekKeys = localWeekDays(lastWeekStart);
  const minutesLastWeek = lastWeekKeys.reduce((sum, key) => {
    const seconds = perDay.get(key);
    if (!seconds) return sum;

    return sum + Math.round((seconds.study + seconds.practice + seconds.exam) / 60);
  }, 0);

  // --- streak ---------------------------------------------------------------
  // Walks back from today over the same rows. A day counts when anything was
  // logged on it, whatever the mode.
  const active = new Set([...perDay.entries()].filter(([, s]) => s.study + s.practice + s.exam > 0).map(([k]) => k));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  let streakDays = 0;
  while (active.has(localDayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // --- the rest -------------------------------------------------------------
  const scores = [
    ...(practiceScores.data || []),
    ...(examScores.data || []),
  ]
    .map((row: any) => Number(row.score_percent))
    .filter((n) => Number.isFinite(n));

  const questionsAnswered = (practiceAnswers.count || 0) + (examAnswers.count || 0);
  const xp = (xpRows.data || []).reduce((sum: number, row: any) => sum + (Number(row.xp) || 0), 0);
  const topicsCompleted = topics.count || 0;

  return {
    days,
    minutesThisWeek,
    minutesLastWeek,
    byMode,
    questionsAnswered,
    accuracy: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
    xp,
    streakDays,
    topicsCompleted,
    isEmpty: minutesThisWeek === 0 && questionsAnswered === 0 && topicsCompleted === 0,
  };
}

// ---------------------------------------------------------------------------
// The Monday nudge
// ---------------------------------------------------------------------------

const SEEN_KEY = "lasu_scholar_weekly_report_seen";

/**
 * Offers last week's report, once, on the first open of a new week.
 *
 * Keyed by the week rather than by a timestamp: the stored value is the Monday
 * the report was last offered for, so a second open on the same Monday — or on
 * the Thursday — matches and stays quiet, and the next Monday does not.
 *
 * Only when the previous week had something in it. A report reading "0 minutes,
 * 0 questions" is not a summary of anything, and offering it is the app talking
 * to itself.
 */
export async function maybeOfferWeeklyReport(): Promise<boolean> {
  const thisWeekKey = localDayKey(startOfLocalWeek());

  const seen = await AsyncStorage.getItem(SEEN_KEY);
  if (seen === thisWeekKey) return false;

  const user = await sessionUser();
  if (!user) return false;

  const lastWeekStart = new Date(startOfLocalWeek());
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

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

  return showPopup({
    key: "weekly_report",
    kicker: "Weekly report",
    title: "Your week in review",
    message: "Last week is ready — time studied, questions answered and where it went.",
    icon: "chart-timeline-variant",
    accent: category.purple,
    href: "/weekly-report",
    actionLabel: "View report",
  });
}
