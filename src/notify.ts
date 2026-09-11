import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";
import { category, type Theme } from "./theme";
import type { IconName } from "./ui/alerts";

/**
 * Notifications, everywhere except the list that displays them.
 *
 * Three things live here because all three were about to be written twice: the
 * preference toggles, the query that decides which notifications are yours, and
 * the popup that puts one in front of you.
 *
 * Until now the five toggles on the notifications screen wrote to AsyncStorage
 * and nothing read them — five switches that gated nothing. `showPopup` below is
 * the first code in the app that asks.
 */

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export type PreferenceKey =
  | "study_reminders"
  | "practice_streaks"
  | "material_updates"
  | "weekly_report"
  | "activity_updates";

export const PREF_STORAGE_KEY = "lasu_scholar_notification_preferences";

export const DEFAULT_PREFS: Record<PreferenceKey, boolean> = {
  study_reminders: true,
  practice_streaks: true,
  material_updates: true,
  weekly_report: true,
  activity_updates: true,
};

/**
 * Only the keys this version knows about.
 *
 * A device that ever toggled the old Exam alerts switch still has `exam_alerts`
 * in its stored blob, and a plain spread would carry that dead key forward on
 * every save from here on. Missing keys fall back to the default, so a new
 * category arrives switched on rather than undefined.
 */
export async function readPreferences(): Promise<Record<PreferenceKey, boolean>> {
  try {
    const saved = await AsyncStorage.getItem(PREF_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_PREFS };

    const stored = JSON.parse(saved) as Partial<Record<PreferenceKey, boolean>>;
    const next = { ...DEFAULT_PREFS };

    (Object.keys(DEFAULT_PREFS) as PreferenceKey[]).forEach((key) => {
      if (typeof stored[key] === "boolean") next[key] = stored[key] as boolean;
    });

    return next;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// ---------------------------------------------------------------------------
// What a type means
// ---------------------------------------------------------------------------

/** Which toggle governs this notification. Unrecognised types are activity. */
export function preferenceForType(type?: string | null): PreferenceKey {
  const clean = String(type || "").toLowerCase();

  if (clean.includes("streak") || clean.includes("practice")) return "practice_streaks";
  if (clean.includes("material")) return "material_updates";
  if (clean.includes("report") || clean.includes("weekly")) return "weekly_report";
  if (clean.includes("remind") || clean.includes("study")) return "study_reminders";

  return "activity_updates";
}

export function iconForType(type?: string | null): IconName {
  const clean = String(type || "").toLowerCase();

  if (clean.includes("streak")) return "fire";
  if (clean.includes("exam")) return "clipboard-text-clock-outline";
  if (clean.includes("practice")) return "target";
  if (clean.includes("report") || clean.includes("weekly")) return "chart-timeline-variant";
  if (clean.includes("study")) return "book-open-page-variant-outline";
  if (clean.includes("material")) return "file-document-outline";
  if (clean.includes("xp")) return "star-four-points";
  if (clean.includes("warning")) return "alert-outline";

  return "bell-outline";
}

export function colorForType(type: string | null | undefined, theme: Theme) {
  const clean = String(type || "").toLowerCase();

  if (clean.includes("streak")) return category.orange;
  if (clean.includes("exam")) return category.red;
  if (clean.includes("practice")) return category.orange;
  if (clean.includes("report") || clean.includes("weekly")) return category.purple;
  if (clean.includes("study")) return category.blue;
  if (clean.includes("material")) return category.green;
  if (clean.includes("xp")) return category.purple;
  if (clean.includes("warning")) return theme.warning;

  return theme.accent;
}

const KICKERS: Record<PreferenceKey, string> = {
  study_reminders: "Study reminder",
  practice_streaks: "Practice streak",
  material_updates: "New material",
  weekly_report: "Weekly report",
  activity_updates: "Update",
};

export function kickerForType(type?: string | null) {
  return KICKERS[preferenceForType(type)];
}

// ---------------------------------------------------------------------------
// Which notifications are yours
// ---------------------------------------------------------------------------

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type?: string | null;
  is_read?: boolean | null;
  action_url?: string | null;
  created_at?: string | null;
  /** Null marks a broadcast row shared by every student. */
  user_id?: string | null;
};

/**
 * The targeting rules, in one place.
 *
 * The notifications screen and the app-open popup check ask the same question,
 * and a second copy of these five `or` clauses would drift the first time a
 * targeting column changed. A null target means "everyone", so each filter is
 * "unset OR matches me". Values are quoted because department and faculty names
 * contain spaces and commas, which are PostgREST filter syntax.
 */
export async function fetchNotifications(options?: {
  /** Only rows created strictly after this ISO timestamp. */
  since?: string | null;
  limit?: number;
}): Promise<NotificationRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("school, faculty, department, level, role")
    .eq("id", user.id)
    .maybeSingle();

  let query = supabase
    .from("notifications")
    .select("id, title, message, type, is_read, action_url, created_at, user_id")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    // NULL counts as published/never-expiring so rows written before these
    // columns existed keep showing.
    .or("is_published.is.null,is_published.eq.true")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  const targets: [string, string | null | undefined][] = [
    ["target_school", (profile as any)?.school],
    ["target_faculty", (profile as any)?.faculty],
    ["target_department", (profile as any)?.department],
    ["target_level", (profile as any)?.level],
    ["target_role", (profile as any)?.role],
  ];

  targets.forEach(([column, value]) => {
    query = value
      ? query.or(`${column}.is.null,${column}.eq."${String(value).replace(/"/g, '\\"')}"`)
      : query.is(column, null);
  });

  if (options?.since) query = query.gt("created_at", options.since);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (error) {
    console.log("NOTIFICATIONS ERROR:", error.message);
    return [];
  }

  return (data || []) as NotificationRow[];
}

// ---------------------------------------------------------------------------
// The popup
// ---------------------------------------------------------------------------

export type PopupPayload = {
  /** The toggle that governs it. Checked before anything is shown. */
  key: PreferenceKey;
  kicker: string;
  title: string;
  message: string;
  icon: IconName;
  accent: string;
  /** An in-app route, when the notification has somewhere real to go. */
  href?: string | null;
  /** Label for the button that goes there. Ignored without an href. */
  actionLabel?: string;
};

/**
 * A queue rather than a single slot.
 *
 * Finishing a practice session on the first open of a new week can produce two
 * at once. Replacing the visible one would drop whichever arrived first; showing
 * both at once is worse. They wait their turn, and dismissing shows the next.
 */
let queue: PopupPayload[] = [];
const listeners = new Set<() => void>();

function broadcast() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Must return a STABLE reference while nothing has changed, or React will
 * re-render forever. `queue[0]` is the same object until the queue actually
 * moves, and `null` is a constant, so both cases hold.
 */
function currentPopup() {
  return queue[0] ?? null;
}

/**
 * Puts a notification in front of the student, if they asked for that category.
 *
 * Async because the answer lives in AsyncStorage. Callers do not await it — the
 * popup is never the point of the action that triggered it.
 */
export async function showPopup(payload: PopupPayload) {
  const prefs = await readPreferences();

  if (!prefs[payload.key]) return;

  queue = [...queue, payload];
  broadcast();
}

export function dismissPopup() {
  queue = queue.slice(1);
  broadcast();
}

/**
 * `useSyncExternalStore` rather than useState plus an effect.
 *
 * The queue is exactly what that hook is for: state living outside React
 * that the component subscribes to. The effect version also had to seed
 * itself with a synchronous setState, to catch a popup queued before it
 * mounted — which is a cascading render, and which React's lint rule
 * correctly refuses. This has no such gap: the first render reads the queue
 * directly.
 */
export function useNotificationPopup() {
  return useSyncExternalStore(subscribe, currentPopup, currentPopup);
}

// ---------------------------------------------------------------------------
// Notifications written somewhere else
// ---------------------------------------------------------------------------

const WATERMARK_KEY = "lasu_scholar_popup_watermark";

/**
 * Shows the newest notification the student has not already been interrupted
 * about. For announcements and anything else the admin app writes — everything
 * the client creates itself pops from the value it just created, with no query.
 *
 * WHY A WATERMARK AND NOT `is_read`
 * Read state means "opened in the list". A student who never opens that screen
 * would be popped on every launch, forever. The watermark answers the question a
 * popup should actually ask: have I already put this in front of you?
 *
 * It also stops a backlog stampede. Only the newest row is shown and the
 * watermark jumps past the rest, so a week away is one popup, not nine.
 *
 * Per device, deliberately. Two devices means two popups, which is the right
 * trade for not needing a table to store it in.
 */
export async function popExternalNotification() {
  const since = await AsyncStorage.getItem(WATERMARK_KEY);

  if (!since) {
    // First run starts the clock now. A new account should not be greeted by an
    // announcement written before it existed.
    await AsyncStorage.setItem(WATERMARK_KEY, new Date().toISOString());
    return;
  }

  const rows = await fetchNotifications({ since, limit: 1 });
  const row = rows[0];

  if (!row) return;

  // Moved before the toggle check on purpose. A muted category should still
  // count as "seen", or turning it back on months later would deliver an
  // avalanche of things that happened while it was off.
  await AsyncStorage.setItem(WATERMARK_KEY, row.created_at || new Date().toISOString());

  await showPopup(popupFromRow(row));
}

/** Only routes that exist, mirroring the rule the notifications list uses. */
const ROUTES = new Set([
  "/study",
  "/practice",
  "/exam",
  "/past-questions",
  "/leaderboard",
  "/profile",
  "/premium",
  "/settings",
  "/aia-tutorial",
]);

export function popupFromRow(row: NotificationRow): PopupPayload {
  const raw = String(row.action_url || "").trim();
  const route = raw.split("?")[0].replace(/\/+$/, "");
  const href = raw.startsWith("/") && ROUTES.has(route) ? raw : null;

  return {
    key: preferenceForType(row.type),
    kicker: kickerForType(row.type),
    title: row.title,
    message: row.message,
    icon: iconForType(row.type),
    // The theme is not available here, so anything theme-derived resolves to a
    // category hue instead. Every branch that would have needed the theme is a
    // type this path does not produce.
    accent: colorForType(row.type, { warning: category.yellow, accent: category.orange } as Theme),
    href,
    actionLabel: href ? "Open" : undefined,
  };
}
