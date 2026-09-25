import { supabase } from "../lib/supabase";
import type { PracticeProgress } from "./ui/PracticeTile";

/**
 * Per-course practice history, for the course-selection tiles.
 *
 * WHY COVERAGE COMES FROM THE ANSWERS, NOT THE ATTEMPTS
 * The obvious source would be `practice_attempts.topic_id`. That column does
 * not exist. The first version of this file selected it anyway, and PostgREST
 * rejects the WHOLE select when one name is unknown (42703) — so it returned
 * null on every call and no tile could ever have shown history. Same failure
 * that once made every leaderboard row read "LASU Scholar".
 *
 * Topic is recoverable regardless: every answer row carries `question_id`, and
 * a question knows its topic. `practice_answers -> questions!inner(topic_id)`
 * is the real relationship, verified against the live schema.
 *
 * That turns out to be the better source anyway. Coverage measured from answers
 * is true no matter how a session was scoped, so a session spanning several
 * topics — which nothing in the data model prevents, since the attempt row
 * never recorded a topic — credits all of them rather than none.
 *
 * THREE QUERIES FOR THE WHOLE GRID, NOT THREE PER COURSE
 * A student sees a handful of courses; doing this per tile would be a waterfall
 * on every open. All three below cover every course on the screen at once.
 *
 * A FAILED READ IS NOT AN EMPTY HISTORY
 * An errored attempts query returns null rather than a map of zeroes. Zeroes
 * would tell a student who has practised for weeks that they had not started.
 */

/** Far enough back to cover any history worth showing on a tile. */
const WINDOW_DAYS = 365;
const MAX_ROWS = 2000;
/** Answers outnumber attempts by roughly the question count, so this is higher. */
const MAX_ANSWER_ROWS = 8000;

export type PracticeHistory = Map<string, PracticeProgress>;

export async function loadPracticeHistory(
  userId: string,
  courseIds: string[],
): Promise<PracticeHistory | null> {
  if (courseIds.length === 0) return new Map();

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const [attempts, answered, topics] = await Promise.all([
    // Sessions and accuracy. Note there is no topic_id here — see above.
    supabase
      .from("practice_attempts")
      .select("course_id, score_percent")
      .eq("user_id", userId)
      .in("course_id", courseIds)
      .gte("created_at", since.toISOString())
      .limit(MAX_ROWS),

    // Coverage. `!inner` makes the embed a join rather than a nested object,
    // which is what lets the filter below apply to the answer rows instead of
    // merely trimming what comes back inside each one.
    supabase
      .from("practice_answers")
      .select("question_id, questions!inner(course_id, topic_id)")
      .eq("user_id", userId)
      .in("questions.course_id", courseIds)
      .gte("created_at", since.toISOString())
      .limit(MAX_ANSWER_ROWS),

    // Reference data, for the denominator.
    supabase.from("topics").select("id, course_id").in("course_id", courseIds),
  ]);

  if (attempts.error) {
    console.log("PRACTICE HISTORY ERROR:", attempts.error.message);

    return null;
  }

  // These two are survivable. Without coverage the tile shows a session count;
  // without the topic list it does the same. Neither is worth losing the
  // accuracy figure over.
  if (answered.error) console.log("PRACTICE HISTORY ANSWERS ERROR:", answered.error.message);
  if (topics.error) console.log("PRACTICE HISTORY TOPICS ERROR:", topics.error.message);

  const topicsTotal = new Map<string, number>();
  for (const row of topics.data || []) {
    const id = String((row as any).course_id || "");
    if (!id) continue;

    topicsTotal.set(id, (topicsTotal.get(id) || 0) + 1);
  }

  const sessions = new Map<string, number>();
  const scores = new Map<string, number[]>();

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
  }

  // Distinct, because answering one topic's questions fifty times is still one
  // topic covered — counting rows here would let repetition fake breadth.
  const attemptedTopics = new Map<string, Set<string>>();

  for (const row of answered.data || []) {
    // An `!inner` embed still arrives as an object (or a one-element array,
    // depending on how the relationship is inferred), so both shapes are read.
    const q: any = Array.isArray((row as any).questions)
      ? (row as any).questions[0]
      : (row as any).questions;

    const courseId = String(q?.course_id || "");
    const topicId = q?.topic_id;
    if (!courseId || !topicId) continue;

    const set = attemptedTopics.get(courseId) || new Set<string>();
    set.add(String(topicId));
    attemptedTopics.set(courseId, set);
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
