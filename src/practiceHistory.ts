import { supabase } from "../lib/supabase";
import type { PracticeProgress } from "./ui/PracticeTile";

/**
 * Per-course practice history, for the course-selection tiles.
 *
 * TWO QUERIES FOR THE WHOLE GRID, NOT TWO PER COURSE
 * A student sees a handful of courses, but doing this per tile would be a
 * request each and a waterfall of them on every open. Both reads below are one
 * round trip covering every course on the screen.
 *
 * WHAT IT CAN AND CANNOT KNOW
 * `practice_attempts` is own-row under RLS, which is exactly right here — this
 * is the student's own history and nobody else's. `topics` is reference data
 * the app already reads elsewhere.
 *
 * There is no history at all today: `practice_attempts` is empty across the
 * whole project, so every course comes back `sessions: 0`. That is a real
 * state, not a failure, and the tile has a first-class design for it.
 *
 * A FAILED READ IS NOT AN EMPTY HISTORY
 * An errored query returns null rather than a map of zeroes. Zeroes would tell
 * every tile to say "Start practising" to a student who has been practising for
 * weeks, which is worse than showing nothing while the data is unavailable.
 */

/** Far enough back to cover any history worth showing on a tile. */
const WINDOW_DAYS = 365;
const MAX_ROWS = 2000;

export type PracticeHistory = Map<string, PracticeProgress>;

export async function loadPracticeHistory(
  userId: string,
  courseIds: string[],
): Promise<PracticeHistory | null> {
  if (courseIds.length === 0) return new Map();

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const [attempts, topics] = await Promise.all([
    supabase
      .from("practice_attempts")
      .select("course_id, topic_id, score_percent")
      .eq("user_id", userId)
      .in("course_id", courseIds)
      .gte("created_at", since.toISOString())
      .limit(MAX_ROWS),
    // Reference data, not per-user. Needed for the denominator of coverage —
    // without it the tile falls back to a session count rather than inventing
    // a fraction.
    supabase.from("topics").select("id, course_id").in("course_id", courseIds),
  ]);

  if (attempts.error) {
    console.log("PRACTICE HISTORY ERROR:", attempts.error.message);

    return null;
  }

  // A missing topic count is survivable; a missing attempt list is not. The
  // tile already handles `topicsTotal: 0` by showing sessions instead.
  if (topics.error) console.log("PRACTICE HISTORY TOPICS ERROR:", topics.error.message);

  const topicsTotal = new Map<string, number>();
  for (const row of topics.data || []) {
    const id = String((row as any).course_id || "");
    if (!id) continue;

    topicsTotal.set(id, (topicsTotal.get(id) || 0) + 1);
  }

  const sessions = new Map<string, number>();
  const scores = new Map<string, number[]>();
  const attemptedTopics = new Map<string, Set<string>>();

  for (const row of attempts.data || []) {
    const courseId = String((row as any).course_id || "");
    if (!courseId) continue;

    sessions.set(courseId, (sessions.get(courseId) || 0) + 1);

    const score = Number((row as any).score_percent);
    if (Number.isFinite(score)) {
      const list = scores.get(courseId) || [];
      list.push(score);
      scores.set(courseId, list);
    }

    // Distinct, because practising one topic ten times is still one topic
    // covered — counting rows here would let repetition fake breadth.
    const topicId = (row as any).topic_id;
    if (topicId) {
      const set = attemptedTopics.get(courseId) || new Set<string>();
      set.add(String(topicId));
      attemptedTopics.set(courseId, set);
    }
  }

  const history: PracticeHistory = new Map();

  for (const courseId of courseIds) {
    const list = scores.get(courseId) || [];

    history.set(courseId, {
      topicsAttempted: attemptedTopics.get(courseId)?.size ?? 0,
      topicsTotal: topicsTotal.get(courseId) ?? 0,
      accuracy: list.length
        ? Math.round(list.reduce((a, b) => a + b, 0) / list.length)
        : null,
      sessions: sessions.get(courseId) ?? 0,
    });
  }

  return history;
}
