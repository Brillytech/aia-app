import { supabase } from "../lib/supabase";
import { localDayKey, startOfLocalDay } from "./days";

/**
 * How many days in a row the student has practised, derived from the sessions
 * themselves.
 *
 * DELIBERATELY NOT `profiles.daily_streak`
 * That column is not a practice streak. `updateDailyStreak()` on the dashboard
 * runs unconditionally whenever the profile loads, with no gate on activity —
 * open the dashboard on consecutive days and answer nothing and it climbs;
 * practise every day without opening the dashboard and it does not move. A
 * "your streak advanced" message reading that column would be reporting app
 * opens. (That the dashboard shows that number to students as a streak is a
 * separate, live inaccuracy, tracked on its own.)
 *
 * LOCAL DAYS, NOT UTC
 * Some of the app still keys days with `toISOString().split("T")[0]`, which is
 * UTC. At UTC+1 that puts a session at 00:30 on Tuesday into Monday, so
 * practising Monday evening and again just after midnight reads as one day and
 * silently breaks a streak the student earned. A day here is the day it was
 * where they were sitting — `localDayKey` from ./days, which is the shared
 * version the weekly report and the study nudge already use.
 */

/** How far back to look. Well past any streak worth celebrating. */
const WINDOW_DAYS = 120;
const MAX_ROWS = 500;

export type PracticeStreak = {
  /** Consecutive days ending today. Zero when there was no session today. */
  days: number;
  /** True when today's session was the first one today. */
  firstToday: boolean;
};

/**
 * Call AFTER the attempt row for the finished session has been written — the
 * session that just ended has to be in the data for the count to include today.
 */
export async function practiceStreak(userId: string): Promise<PracticeStreak> {
  const since = startOfLocalDay();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const { data, error } = await supabase
    .from("practice_attempts")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error || !data) {
    if (error) console.log("PRACTICE STREAK ERROR:", error.message);

    return { days: 0, firstToday: false };
  }

  const keys = data.map((row: any) => localDayKey(row.created_at)).filter(Boolean);
  const seen = new Set(keys);
  const today = localDayKey(new Date());

  // Walk back a day at a time until a day has no session in it.
  const cursor = startOfLocalDay();

  let days = 0;
  while (seen.has(localDayKey(cursor))) {
    days += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    days,
    firstToday: keys.filter((key) => key === today).length === 1,
  };
}
