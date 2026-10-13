import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "../../lib/supabase";
import { sessionUser } from "../session";
import { blankCard, countPending, merge, type CardMap, type StoredCard } from "./merge.ts";
import { DEFAULT_CONFIG, type SchedulerConfig } from "./scheduler.ts";

// Re-exported so callers import one module, not three.
export { blankCard, countPending, merge, type CardMap, type StoredCard };

/**
 * Where a card's schedule lives.
 *
 * LOCAL FIRST, ALWAYS
 * The device is the record of truth while the app is open. Every review
 * writes to AsyncStorage synchronously-enough to be there before the next
 * frame, then goes to Supabase. If that fails the row is marked and retried
 * — on the next review and on the next app open — and the student is told
 * nothing louder than "will sync later". A dropped connection in the middle
 * of a deck is not an error; it is Tuesday.
 *
 * There is no outbox. A card carries its own `needsSync` flag, which is the
 * same thing for this shape of data and one less moving part: the retry is
 * just "upsert every row that is marked", and a row written twice is
 * harmless because the upsert is keyed on (user, question).
 *
 * CONFLICTS
 * Last write wins on `lastReviewedAt`, compared as UTC milliseconds. Two
 * devices reviewing the same card keep the later answer, which is the one
 * the student gave most recently and therefore the one that reflects what
 * they currently know.
 *
 * CLOCKS
 * `lastReviewedAt` comes from the device, so a wrong clock can win an
 * argument it should lose. Nothing here can fix that — the alternative,
 * trusting the server's clock, loses offline reviews entirely — but the
 * damage is bounded: a card is rescheduled, never lost.
 */

function storageKey(userId: string): string {
  return `cards:v1:${userId}`;
}

function toMillis(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toIso(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;

  return new Date(ms).toISOString();
}

/** A server row becomes a card. Unknown states fall back to new. */
function fromRow(row: any, config: SchedulerConfig): StoredCard {
  const state = ["new", "learning", "review", "relearning"].includes(row?.state)
    ? row.state
    : "new";

  return {
    schedule: {
      state,
      stepIndex: Number(row?.step_index) || 0,
      due: toMillis(row?.due),
      intervalDays: Number(row?.interval_days) || 0,
      ease: Number(row?.ease) || config.startingEase,
      reps: Number(row?.reps) || 0,
      lapses: Number(row?.lapses) || 0,
      lastReviewedAt: toMillis(row?.last_reviewed_at),
    },
    saved: Boolean(row?.saved),
    needsSync: false,
  };
}

function toRow(userId: string, questionId: string, card: StoredCard) {
  return {
    user_id: userId,
    question_id: questionId,
    state: card.schedule.state,
    step_index: card.schedule.stepIndex,
    due: toIso(card.schedule.due),
    interval_days: card.schedule.intervalDays,
    ease: card.schedule.ease,
    reps: card.schedule.reps,
    lapses: card.schedule.lapses,
    saved: card.saved,
    last_reviewed_at: toIso(card.schedule.lastReviewedAt),
    updated_at: new Date().toISOString(),
  };
}

export async function readLocal(userId: string): Promise<CardMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CardMap) : {};
  } catch (error) {
    // A corrupt or unreadable store is an empty one. Losing local schedules
    // is bad; refusing to open the deck is worse, and the server copy comes
    // back on the next merge anyway.
    console.log("CARD STORE READ FAILED:", error);
    return {};
  }
}

export async function writeLocal(userId: string, cards: CardMap): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(cards));
  } catch (error) {
    console.log("CARD STORE WRITE FAILED:", error);
  }
}

/**
 * Pull this student's cards for a set of questions.
 *
 * Returns what it has either way: on a failed fetch the local copy stands,
 * which is the whole point of writing locally first.
 */
export async function loadCards(
  questionIds: string[],
  config: SchedulerConfig = DEFAULT_CONFIG,
): Promise<{ cards: CardMap; online: boolean }> {
  const user = await sessionUser();
  if (!user) return { cards: {}, online: false };

  const local = await readLocal(user.id);
  if (questionIds.length === 0) return { cards: local, online: true };

  const { data, error } = await supabase
    .from("user_card_progress")
    .select("*")
    .eq("user_id", user.id)
    .in("question_id", questionIds);

  if (error) {
    console.log("CARD LOAD ERROR:", error.message);
    return { cards: local, online: false };
  }

  const remote: CardMap = {};
  for (const row of data || []) remote[String(row.question_id)] = fromRow(row, config);

  const merged = merge(local, remote);
  await writeLocal(user.id, merged);

  return { cards: merged, online: true };
}

/**
 * Write one card, then try to send it.
 *
 * Resolves as soon as the local write is done; the caller does not wait on
 * the network. `synced` tells the screen whether to show the quiet
 * "will sync later" marker.
 */
export async function saveCard(
  questionId: string,
  card: StoredCard,
): Promise<{ synced: boolean }> {
  const user = await sessionUser();
  if (!user) return { synced: false };

  const local = await readLocal(user.id);
  local[questionId] = { ...card, needsSync: true };
  await writeLocal(user.id, local);

  const { error } = await supabase
    .from("user_card_progress")
    .upsert(toRow(user.id, questionId, card), { onConflict: "user_id,question_id" });

  if (error) {
    console.log("CARD SAVE DEFERRED:", error.message);
    return { synced: false };
  }

  const after = await readLocal(user.id);
  if (after[questionId]) {
    after[questionId] = { ...after[questionId], needsSync: false };
    await writeLocal(user.id, after);
  }

  return { synced: true };
}

/**
 * Send everything still marked.
 *
 * Called on opening the deck and after each review, so a connection that
 * comes back mid-session catches up without the student doing anything.
 * One upsert for the lot: a hundred deferred cards should not be a hundred
 * round trips.
 */
export async function flushPending(): Promise<{ sent: number; remaining: number }> {
  const user = await sessionUser();
  if (!user) return { sent: 0, remaining: 0 };

  const local = await readLocal(user.id);
  const pending = Object.entries(local).filter(([, card]) => card.needsSync);

  if (pending.length === 0) return { sent: 0, remaining: 0 };

  const { error } = await supabase
    .from("user_card_progress")
    .upsert(
      pending.map(([id, card]) => toRow(user.id, id, card)),
      { onConflict: "user_id,question_id" },
    );

  if (error) {
    console.log("CARD FLUSH DEFERRED:", error.message);
    return { sent: 0, remaining: pending.length };
  }

  for (const [id] of pending) local[id] = { ...local[id], needsSync: false };
  await writeLocal(user.id, local);

  return { sent: pending.length, remaining: 0 };
}
