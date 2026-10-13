/**
 * What to show next, and how many of each kind are waiting.
 *
 * Pure, like the scheduler: no React, no storage, and the clock is an
 * argument. The study screen asks it questions; it never asks the screen
 * anything.
 *
 * ORDER
 * Learning cards that are due come first, because they are time-critical —
 * a card promised in one minute is useless in twenty. Then due reviews,
 * oldest first, so a backlog drains from the front. Then new cards, in the
 * order the deck gives them.
 *
 * Anki differs here: it fetches learning cards first for the same reason,
 * but then interleaves reviews and new rather than draining one before the
 * other. With a single topic's deck in front of the student, the simpler
 * order is easier to reason about and was the one specified.
 */

import { isStruggling, type CardSchedule, type SchedulerConfig, DEFAULT_CONFIG } from "./scheduler.ts";

/** A card as the queue sees it: an id, its schedule, and whether it is kept. */
export type QueueCard = {
  id: string;
  schedule: CardSchedule;
  saved: boolean;
};

export type DeckTab = "all" | "due" | "saved" | "struggled";

export type DeckCounts = Record<DeckTab, number>;

function isDue(card: QueueCard, now: number): boolean {
  if (card.schedule.state === "new") return true;

  return card.schedule.due !== null && card.schedule.due <= now;
}

function rank(card: QueueCard): number {
  const state = card.schedule.state;

  if (state === "learning" || state === "relearning") return 0;
  if (state === "review") return 1;

  return 2;
}

/**
 * The cards to study, in order.
 *
 * `order` is the deck's own sequence, used to keep new cards where the
 * author put them — sorting new cards by a due date they do not have would
 * shuffle them arbitrarily.
 */
export function buildQueue(
  cards: QueueCard[],
  now: number,
  options: { tab?: DeckTab; config?: SchedulerConfig } = {},
): QueueCard[] {
  const config = options.config ?? DEFAULT_CONFIG;
  const tab = options.tab ?? "due";

  const pool =
    tab === "all"
      ? cards
      : tab === "saved"
        ? cards.filter((card) => card.saved)
        : tab === "struggled"
          ? cards.filter((card) => isStruggling(card.schedule, config))
          : cards.filter((card) => isDue(card, now));

  // "All" is free browsing: the deck in its own order, nothing hidden.
  if (tab === "all") return [...pool];

  const position = new Map(cards.map((card, index) => [card.id, index]));

  return [...pool].sort((a, b) => {
    const byKind = rank(a) - rank(b);
    if (byKind !== 0) return byKind;

    // Within learning and review, the longest wait goes first.
    const aDue = a.schedule.due ?? Number.POSITIVE_INFINITY;
    const bDue = b.schedule.due ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;

    return (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
  });
}

export function deckCounts(
  cards: QueueCard[],
  now: number,
  config: SchedulerConfig = DEFAULT_CONFIG,
): DeckCounts {
  return {
    all: cards.length,
    due: cards.filter((card) => isDue(card, now)).length,
    saved: cards.filter((card) => card.saved).length,
    struggled: cards.filter((card) => isStruggling(card.schedule, config)).length,
  };
}

/**
 * When the next card becomes available, once nothing is due.
 *
 * Null when the deck holds nothing further — every card is a review days
 * away, or there are no cards at all. The screen uses this for Anki's
 * learn-ahead: a countdown and a "Study now" rather than a dead end.
 */
export function nextDueAt(cards: QueueCard[], now: number): number | null {
  const upcoming = cards
    .filter((card) => card.schedule.due !== null && card.schedule.due > now)
    .map((card) => card.schedule.due as number);

  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

/**
 * Whether the next card is close enough to be worth offering early.
 *
 * Anki's learn-ahead limit is 20 minutes: past that it calls the deck
 * finished rather than pulling tomorrow's reviews forward, which would undo
 * the spacing the scheduler just set.
 */
export const LEARN_AHEAD_LIMIT_MINUTES = 20;

export function canLearnAhead(
  cards: QueueCard[],
  now: number,
  limitMinutes: number = LEARN_AHEAD_LIMIT_MINUTES,
): boolean {
  const next = nextDueAt(cards, now);
  if (next === null) return false;

  return next - now <= limitMinutes * 60_000;
}

/** "4:05" — the countdown under "Next card in". */
export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Skip without grading.
 *
 * Next card must not touch the schedule, and the skipped card has to come
 * back in the same pass rather than being lost until tomorrow — so the move
 * happens in the visible order and never in the stored state.
 */
export function skipToNext<T>(queue: T[], index: number): { queue: T[]; index: number } {
  if (queue.length <= 1) return { queue, index: 0 };

  const next = [...queue];
  const [skipped] = next.splice(index, 1);
  next.push(skipped);

  // The card that was behind the skipped one has slid into its place.
  return { queue: next, index: Math.min(index, next.length - 1) };
}
