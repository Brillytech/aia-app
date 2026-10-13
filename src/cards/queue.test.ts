/**
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildQueue,
  canLearnAhead,
  deckCounts,
  formatCountdown,
  nextDueAt,
  skipToNext,
  type QueueCard,
} from "./queue.ts";
import { DEFAULT_CONFIG, newCard, type CardSchedule, type SchedulerConfig } from "./scheduler.ts";

const AT = Date.UTC(2026, 9, 14, 12, 0, 0);
const MINUTE = 60_000;
const CONFIG: SchedulerConfig = { ...DEFAULT_CONFIG, utcOffsetMinutes: 0 };

function card(id: string, schedule: Partial<CardSchedule> = {}, saved = false): QueueCard {
  return { id, saved, schedule: { ...newCard(CONFIG), ...schedule } };
}

/* ── order ───────────────────────────────────────────────────────────── */

test("learning comes before reviews, and reviews before new", () => {
  const deck = [
    card("new", {}),
    card("review", { state: "review", due: AT - MINUTE, intervalDays: 5 }),
    card("learning", { state: "learning", due: AT - MINUTE }),
  ];

  const ids = buildQueue(deck, AT, { config: CONFIG }).map((c) => c.id);

  assert.deepEqual(ids, ["learning", "review", "new"]);
});

test("within a kind, the longest wait goes first", () => {
  const deck = [
    card("recent", { state: "review", due: AT - MINUTE, intervalDays: 5 }),
    card("ancient", { state: "review", due: AT - 90 * 86_400_000, intervalDays: 5 }),
  ];

  const ids = buildQueue(deck, AT, { config: CONFIG }).map((c) => c.id);

  assert.deepEqual(ids, ["ancient", "recent"], "a backlog drains from the front");
});

test("new cards keep the deck's own order", () => {
  const deck = [card("c"), card("a"), card("b")].map((c) => c);
  const ids = buildQueue(deck, AT, { config: CONFIG }).map((x) => x.id);

  assert.deepEqual(ids, ["c", "a", "b"], "not sorted — the author's order is the order");
});

test("cards due later are left out of the due queue", () => {
  const deck = [
    card("now", { state: "review", due: AT - 1, intervalDays: 3 }),
    card("later", { state: "review", due: AT + 60 * MINUTE, intervalDays: 3 }),
  ];

  assert.deepEqual(buildQueue(deck, AT, { config: CONFIG }).map((c) => c.id), ["now"]);
});

/* ── tabs ────────────────────────────────────────────────────────────── */

test("All shows everything, in the deck's order, due or not", () => {
  const deck = [
    card("a", { state: "review", due: AT + 86_400_000, intervalDays: 9 }),
    card("b", {}),
  ];

  const ids = buildQueue(deck, AT, { tab: "all", config: CONFIG }).map((c) => c.id);

  assert.deepEqual(ids, ["a", "b"], "free browsing hides nothing");
});

test("Saved and Struggled filter to their own cards", () => {
  const deck = [
    card("kept", {}, true),
    // Struggling is ease below the starting value now, not the lapse count.
    card("shaky", { state: "review", ease: 235, lapses: 1, due: AT + 86_400_000, intervalDays: 1 }),
    card("plain", {}),
  ];

  assert.deepEqual(buildQueue(deck, AT, { tab: "saved", config: CONFIG }).map((c) => c.id), ["kept"]);
  assert.deepEqual(
    buildQueue(deck, AT, { tab: "struggled", config: CONFIG }).map((c) => c.id),
    ["shaky"],
  );
});

test("the counts match what each tab would show", () => {
  const deck = [
    card("kept", {}, true),
    card("shaky", { state: "review", ease: 235, lapses: 1, due: AT + 86_400_000, intervalDays: 1 }),
    card("due", { state: "review", due: AT - 1, intervalDays: 4 }),
    card("later", { state: "review", due: AT + 86_400_000, intervalDays: 4 }),
  ];

  const counts = deckCounts(deck, AT, CONFIG);

  assert.equal(counts.all, 4);
  assert.equal(counts.due, 2, "the new card and the overdue review");
  assert.equal(counts.saved, 1);
  assert.equal(counts.struggled, 1);

  for (const tab of ["all", "saved", "struggled", "due"] as const) {
    assert.equal(
      buildQueue(deck, AT, { tab, config: CONFIG }).length,
      counts[tab],
      `the ${tab} count disagrees with the ${tab} queue`,
    );
  }
});

/* ── learn ahead ─────────────────────────────────────────────────────── */

test("the next due time is the soonest card still ahead", () => {
  const deck = [
    card("soon", { state: "learning", due: AT + 4 * MINUTE }),
    card("later", { state: "learning", due: AT + 9 * MINUTE }),
  ];

  assert.equal(nextDueAt(deck, AT), AT + 4 * MINUTE);
});

test("nothing ahead means nothing to count down to", () => {
  assert.equal(nextDueAt([card("done", { state: "review", due: AT - 1, intervalDays: 2 })], AT), null);
  assert.equal(nextDueAt([], AT), null);
});

test("a card minutes away can be pulled forward; one days away cannot", () => {
  const soon = [card("soon", { state: "learning", due: AT + 9 * MINUTE })];
  const tomorrow = [card("tomorrow", { state: "review", due: AT + 86_400_000, intervalDays: 1 })];

  assert.equal(canLearnAhead(soon, AT), true);
  assert.equal(canLearnAhead(tomorrow, AT), false, "learning ahead must not undo the spacing");
});

test("the countdown reads as minutes and seconds", () => {
  assert.equal(formatCountdown(4 * MINUTE + 5000), "4:05");
  assert.equal(formatCountdown(59_000), "0:59");
  assert.equal(formatCountdown(60_000), "1:00");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(-5000), "0:00", "a clock that jumped forward does not go negative");
});

/* ── skipping ────────────────────────────────────────────────────────── */

test("Next card moves the skipped card to the back of the same pass", () => {
  const { queue, index } = skipToNext(["a", "b", "c"], 0);

  assert.deepEqual(queue, ["b", "c", "a"], "the skipped card returns later, not tomorrow");
  assert.equal(index, 0, "and the next card is now under the cursor");
});

test("skipping the last card wraps to the front", () => {
  const { queue, index } = skipToNext(["a", "b", "c"], 2);

  assert.deepEqual(queue, ["a", "b", "c"]);
  assert.equal(index, 2);
});

test("skipping does not touch the schedule", () => {
  const before = card("only", { state: "review", due: AT + 99, intervalDays: 7, ease: 235 });
  const { queue } = skipToNext([before], 0);

  assert.deepEqual(queue[0].schedule, before.schedule, "no grading, no scheduling");
});

test("a deck of one survives being skipped", () => {
  const { queue, index } = skipToNext(["only"], 0);

  assert.deepEqual(queue, ["only"]);
  assert.equal(index, 0);
});
