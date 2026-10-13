import { newCard, type CardSchedule, type SchedulerConfig, DEFAULT_CONFIG } from "./scheduler.ts";

/**
 * The conflict rule, on its own.
 *
 * Separate from store.ts because that file imports Supabase and
 * AsyncStorage, and this is the part with a decision in it. Kept pure, it
 * can be tested for what it does rather than against two stubs.
 */

export type StoredCard = {
  schedule: CardSchedule;
  saved: boolean;
  /** Written on this device but not yet accepted by the server. */
  needsSync: boolean;
};

export type CardMap = Record<string, StoredCard>;

export function blankCard(config: SchedulerConfig = DEFAULT_CONFIG): StoredCard {
  return { schedule: newCard(config), saved: false, needsSync: false };
}

/**
 * Merge what the server has into what the device has.
 *
 * A card the device has not seen is taken as-is. Where both hold it, the
 * later `lastReviewedAt` wins — that is the answer the student gave most
 * recently, so it is the one that reflects what they currently know.
 *
 * The exception is a local card still waiting to sync. The server has not
 * been told about that answer yet, so a newer-looking server row is newer
 * only because this one has not arrived; taking it would throw the review
 * away.
 *
 * `lastReviewedAt` comes from the device, so a wrong clock can win an
 * argument it should lose. Nothing here can fix that — trusting the
 * server's clock instead would discard offline reviews entirely — but the
 * damage is bounded: a card is rescheduled, never lost.
 */
export function merge(local: CardMap, remote: CardMap): CardMap {
  const merged: CardMap = { ...local };

  for (const [id, incoming] of Object.entries(remote)) {
    const mine = merged[id];

    if (!mine) {
      merged[id] = incoming;
      continue;
    }

    if (mine.needsSync) continue;

    const mineAt = mine.schedule.lastReviewedAt ?? -Infinity;
    const theirsAt = incoming.schedule.lastReviewedAt ?? -Infinity;

    if (theirsAt > mineAt) merged[id] = incoming;
  }

  return merged;
}

export function countPending(cards: CardMap): number {
  return Object.values(cards).filter((card) => card.needsSync).length;
}
