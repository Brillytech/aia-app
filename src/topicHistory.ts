import { supabase } from "../lib/supabase";

/**
 * Per-topic practice history for one course.
 *
 * DERIVED FROM ANSWERS, NOT ATTEMPTS
 * `practice_attempts` has no topic_id column — that absence is what silently
 * discarded every practice result until it was fixed, and it is also why topic
 * attribution cannot come from there. Each answer row carries `question_id`,
 * and a question knows its topic, so `practice_answers ->
 * questions!inner(topic_id)` is the real relationship.
 *
 * WHY "ANSWERED", NOT "SESSIONS"
 * A session can now span several topics, so sessions-per-topic has no honest
 * value: one session covering four topics is not four sessions, nor is it one
 * session for each. Questions answered and accuracy are exact under any
 * scoping, which is the whole reason to measure at the answer level.
 *
 * A FAILED READ RETURNS NULL
 * Not an empty map. Zeroes would tell a student who has worked through half a
 * course that they had not started it, and the ordering toggle would then sort
 * a list of falsehoods.
 */

const WINDOW_DAYS = 365;
const MAX_ROWS = 8000;

export type TopicProgress = {
  /** Questions answered in this topic, all sessions. */
  answered: number;
  /** Correct answers, for the percentage. */
  correct: number;
  /** Rounded percentage, or null when nothing has been answered. */
  accuracy: number | null;
};

export type TopicHistory = Map<string, TopicProgress>;

export async function loadTopicHistory(
  userId: string,
  courseId: string,
): Promise<TopicHistory | null> {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  // `!inner` makes the embed a join rather than a nested object, which is what
  // lets the course filter apply to the answer rows instead of merely trimming
  // what comes back inside each one.
  const { data, error } = await supabase
    .from("practice_answers")
    .select("is_correct, questions!inner(topic_id, course_id)")
    .eq("user_id", userId)
    .eq("questions.course_id", courseId)
    .gte("created_at", since.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.log("TOPIC HISTORY ERROR:", error.message);

    return null;
  }

  const history: TopicHistory = new Map();

  for (const row of data || []) {
    // An `!inner` embed arrives as an object or a one-element array depending
    // on how the relationship is inferred; both shapes are read.
    const q: any = Array.isArray((row as any).questions)
      ? (row as any).questions[0]
      : (row as any).questions;

    const topicId = q?.topic_id ? String(q.topic_id) : "";
    if (!topicId) continue;

    const entry = history.get(topicId) || { answered: 0, correct: 0, accuracy: null };

    entry.answered += 1;
    if ((row as any).is_correct) entry.correct += 1;

    history.set(topicId, entry);
  }

  for (const entry of history.values()) {
    entry.accuracy = entry.answered > 0
      ? Math.round((entry.correct / entry.answered) * 100)
      : null;
  }

  return history;
}

/** Below this, a topic is worth putting in front of the student. */
export const WEAK_THRESHOLD = 50;

/**
 * Topics worth revisiting: attempted, and scoring under the threshold.
 *
 * Never-attempted topics are deliberately excluded. "Weak" is a judgement that
 * needs evidence, and a topic you have not tried is not one you are bad at —
 * sweeping those in would make the banner's count meaningless on a course
 * barely started.
 */
export function weakTopicIds(history: TopicHistory | null, topicIds: string[]): string[] {
  if (!history) return [];

  return topicIds.filter((id) => {
    const entry = history.get(id);

    return Boolean(entry && entry.accuracy !== null && entry.accuracy < WEAK_THRESHOLD);
  });
}
