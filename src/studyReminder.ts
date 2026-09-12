import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { localDayKey, startOfLocalDay } from "./days";
import { category } from "./theme";
import { showPopup } from "./notify";

/**
 * The nudge for a day with nothing on it yet.
 *
 * WHAT THIS IS, HONESTLY
 * Not a reminder. Without device push nothing can reach a student who is not in
 * the app, so this can only fire once they have already come back — by which
 * point reminding them to come back is moot. What it can still do is catch the
 * moment of arrival on a day where nothing has happened and say what would move
 * the needle. The copy is written for that: a fact and a number, not a scolding.
 *
 * TWO WINDOWS, NOT ONE EVENING CHECK
 * Morning after the first lectures, afternoon into the evening when most
 * self-study actually happens. The gap between them is deliberate — midday is
 * lectures and lunch, and a nudge there competes with the day rather than
 * shaping it. The hard stop at 21:00 is deliberate too: open the app at 23:00
 * having done nothing and a nudge is a reproach at the hour it is least
 * actionable. Missing a whole day is what the streak and the weekly report are
 * for.
 */

type Window = "morning" | "afternoon";

const WINDOWS: { id: Window; from: number; to: number }[] = [
  { id: "morning", from: 9, to: 12 },
  { id: "afternoon", from: 16, to: 21 },
];

const STORAGE_KEY = "lasu_scholar_study_nudge";

/** Dormant accounts are not nagged; this is the line between quiet and gone. */
const ACTIVE_WITHIN_DAYS = 7;

type Ledger = { day: string; windows: Window[] };

/**
 * One record holding the day and which of its windows have already fired.
 *
 * A single "last nudged at" timestamp would have to be compared against window
 * boundaries to mean anything, and a per-window key would need clearing. This
 * shape answers "already nudged in this window?" directly, still answers "how
 * many today?" if that is ever wanted, and resets itself simply by not matching
 * today's date.
 */
async function readLedger(): Promise<Ledger> {
  const today = localDayKey(new Date());

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { day: today, windows: [] };

    const parsed = JSON.parse(raw) as Partial<Ledger>;
    if (parsed?.day !== today) return { day: today, windows: [] };

    return {
      day: today,
      windows: Array.isArray(parsed.windows) ? (parsed.windows as Window[]) : [],
    };
  } catch {
    return { day: today, windows: [] };
  }
}

function currentWindow(now = new Date()): Window | null {
  const hour = now.getHours();

  return WINDOWS.find((w) => hour >= w.from && hour < w.to)?.id ?? null;
}

/**
 * Has anything happened today?
 *
 * Deliberately existence checks rather than counts. The dashboard computes real
 * daily totals for its goal rings, and this is a narrower question — "is the day
 * still empty" — so it asks for one row and stops, rather than borrowing a
 * calculation built for something else.
 */
async function isDayEmpty(userId: string): Promise<boolean> {
  const since = startOfLocalDay().toISOString();

  const [practice, exam, topics] = await Promise.all([
    supabase
      .from("practice_answers")
      .select("id")
      .eq("user_id", userId)
      .not("selected_answer", "is", null)
      .gte("created_at", since)
      .limit(1),
    supabase
      .from("exam_answers")
      .select("id")
      .eq("user_id", userId)
      .not("selected_answer", "is", null)
      .gte("created_at", since)
      .limit(1),
    supabase
      .from("user_topic_progress")
      .select("topic_id")
      .eq("user_id", userId)
      .eq("completed", true)
      .gte("completed_at", since)
      .limit(1),
  ]);

  // An errored query is not an empty day. Failing to read is not evidence that
  // nothing happened, and nudging on a network blip would be worse than silence.
  if (practice.error || exam.error || topics.error) return false;

  return (
    (practice.data?.length ?? 0) === 0 &&
    (exam.data?.length ?? 0) === 0 &&
    (topics.data?.length ?? 0) === 0
  );
}

/** Quiet for a week or more means gone, and a nudge stops being welcome. */
async function isActiveRecently(userId: string): Promise<boolean> {
  const since = new Date();
  since.setDate(since.getDate() - ACTIVE_WITHIN_DAYS);

  const { data, error } = await supabase
    .from("user_activity_logs")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .limit(1);

  if (error) return false;

  return (data?.length ?? 0) > 0;
}

/** How many questions are left to reach today's goal, when there is a goal. */
async function questionsGoal(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("user_goals")
    .select("daily_questions_goal")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const goal = Number((data as any).daily_questions_goal);

  return Number.isFinite(goal) && goal > 0 ? goal : null;
}

/**
 * Call on app open. Cheap when it decides not to fire: the window check and the
 * ledger are both local, so a student opening the app at midday costs nothing.
 */
export async function maybeNudgeStudy(): Promise<boolean> {
  const window = currentWindow();
  if (!window) return false;

  const ledger = await readLedger();
  if (ledger.windows.includes(window)) return false;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return false;

  if (!(await isDayEmpty(user.id))) return false;
  if (!(await isActiveRecently(user.id))) return false;

  // Recorded before the popup, not after. `showPopup` silently does nothing when
  // the category is switched off, and a student who has muted study reminders
  // should not have this query run again on every open for the rest of the day.
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ day: ledger.day, windows: [...ledger.windows, window] }),
  );

  const goal = await questionsGoal(user.id);

  return showPopup({
    key: "study_reminders",
    kicker: "Study reminder",
    title: window === "morning" ? "Nothing yet today" : "Still time today",
    message: goal
      ? `No questions answered yet — ${goal} would hit your daily goal.`
      : "No questions answered yet today. A short session is enough to keep the day going.",
    icon: "book-open-page-variant-outline",
    accent: category.blue,
    href: "/study",
    actionLabel: "Open Study",
  });
}
