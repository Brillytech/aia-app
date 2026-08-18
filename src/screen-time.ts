import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "../lib/supabase";

/**
 * Wall-clock learning-time tracking for the three learning screens.
 *
 * The old approach measured "activity" — study time only accrued between
 * opening a topic and pressing back, and practice/exam only logged a duration
 * when a session was *submitted*. That undercounted badly: reading a PDF for
 * twenty minutes, or abandoning a practice run halfway, both recorded nothing.
 * (Study recorded nothing at all, in fact — `startStudyTimer()` was never
 * called, so the save always short-circuited on a null start time.)
 *
 * This counts the only thing a student would recognise as time spent: the
 * screen is focused and the app is in the foreground. No idle detection, no
 * interaction heuristic. Leaving the tab, backgrounding the app, or locking
 * the phone stops the clock; coming back starts it again.
 */
export type LearningMode = "study" | "practice" | "exam";

/** Rows are written at most this often, so a crash loses at most a minute. */
const FLUSH_INTERVAL_MS = 60_000;

/**
 * Anything shorter is noise — a mis-tap on the tab bar, or a bounce through
 * the screen on the way somewhere else. Deliberately far below the old 20s
 * floor, which was silently discarding real short sessions.
 */
const MIN_LOGGED_SECONDS = 5;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuidOrNull(value?: string | null) {
  return value && UUID_RE.test(value) ? value : null;
}

/** Monday-anchored week key, matching every other writer of this table. */
function getWeekStartDateKey(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);

  current.setDate(diff);
  current.setHours(0, 0, 0, 0);

  return current.toISOString().split("T")[0];
}

/**
 * Tracks foreground time on a learning screen and writes it to
 * `user_activity_logs`.
 *
 * The ids are read live on every flush rather than captured, so a session that
 * moves between topics attributes each slice to whichever topic was open at
 * the time. Both are optional — time spent browsing the course list still
 * counts, it just lands with a null course/topic.
 *
 * They are separate arguments rather than one options object on purpose: an
 * object literal is a new identity every render, which would make the sync
 * effect below fire on every render of a 3,000-line screen.
 */
export function useScreenTime(
  mode: LearningMode,
  courseId?: string | null,
  topicId?: string | null,
) {
  /** Non-null only while the clock is actually running. */
  const runningSinceRef = useRef<number | null>(null);
  /** Whether this route holds focus, independent of foreground/background. */
  const focusedRef = useRef(false);
  const contextRef = useRef({ courseId, topicId });

  // Synced in an effect rather than assigned during render — with the React
  // Compiler on, a ref write in the render body is a lint error and an
  // ordering hazard. A flush only ever reads this from a timer or a cleanup,
  // both of which run after the commit, so a frame's delay changes nothing.
  useEffect(() => {
    contextRef.current = { courseId, topicId };
  }, [courseId, topicId]);

  /**
   * Banks whatever has accrued. `resume` distinguishes a periodic tick (keep
   * counting) from a pause — blur, or the app leaving the foreground.
   */
  const flush = useCallback(
    async (resume: boolean) => {
      const startedAt = runningSinceRef.current;

      if (startedAt === null) return;

      const seconds = Math.floor((Date.now() - startedAt) / 1000);

      // Reset before the await, not after — otherwise the time the network
      // round-trip takes gets counted a second time on the next flush.
      runningSinceRef.current = resume ? Date.now() : null;

      if (seconds < MIN_LOGGED_SECONDS) return;

      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;

        if (!user) return;

        const { error } = await supabase.from("user_activity_logs").insert({
          user_id: user.id,
          mode,
          course_id: asUuidOrNull(contextRef.current.courseId),
          topic_id: asUuidOrNull(contextRef.current.topicId),
          duration_seconds: seconds,
          week_start: getWeekStartDateKey(),
          created_at: new Date().toISOString(),
        });

        if (error) {
          console.log(`${mode.toUpperCase()} TIME SAVE ERROR:`, error.message);
        }
      } catch (error) {
        console.log(`${mode.toUpperCase()} TIME SAVE ERROR:`, error);
      }
    },
    [mode],
  );

  // Focus drives the clock. The cleanup runs on blur — switching tabs, or
  // pushing a screen on top — as well as on unmount, so both stop the timer
  // and bank whatever had accrued.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      runningSinceRef.current =
        AppState.currentState === "active" ? Date.now() : null;

      const ticker = setInterval(() => flush(true), FLUSH_INTERVAL_MS);

      return () => {
        clearInterval(ticker);
        focusedRef.current = false;
        flush(false);
      };
    }, [flush]),
  );

  // Backgrounding does not blur the route, so focus alone would keep counting
  // while the phone sits locked in a pocket. This is the half that makes the
  // number honest.
  useEffect(() => {
    function handleAppState(next: AppStateStatus) {
      if (next === "active") {
        // Resume only if this screen still holds focus — the app can return
        // to the foreground on a different tab than it left.
        if (focusedRef.current && runningSinceRef.current === null) {
          runningSinceRef.current = Date.now();
        }
        return;
      }

      // "inactive" (call banner, app switcher) and "background" both pause.
      flush(false);
    }

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [flush]);
}
