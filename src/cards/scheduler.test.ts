/**
 * Run with: node --test src/cards/scheduler.test.ts
 *
 * No test framework. Node strips the types and runs the file directly, so
 * there is nothing to install and nothing to configure.
 *
 * Every test pins the clock. `AT` is a Wednesday at noon UTC, chosen so it
 * sits well clear of the 4am rollover in either direction — a fixture an
 * hour either side of the boundary would make half of these pass or fail on
 * the arithmetic of the fixture rather than on the scheduler.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CONFIG,
  dayBoundary,
  intervalLabel,
  isStruggling,
  newCard,
  previewMinutes,
  review,
  type CardSchedule,
  type SchedulerConfig,
} from "./scheduler.ts";

const AT = Date.UTC(2026, 9, 14, 12, 0, 0);
const MINUTE = 60_000;

/** UTC throughout, so the day boundary is not the host's business. */
const CONFIG: SchedulerConfig = { ...DEFAULT_CONFIG, utcOffsetMinutes: 0 };

function minutesUntil(card: CardSchedule, from = AT): number {
  assert.ok(card.due !== null, "the card has no due time");
  return (card.due! - from) / MINUTE;
}

/* ── learning steps ──────────────────────────────────────────────────── */

test("Again on a new card is due in 1 minute, back on step 1", () => {
  const after = review(newCard(CONFIG), "again", AT, CONFIG);

  assert.equal(minutesUntil(after), 1);
  assert.equal(after.state, "learning");
  assert.equal(after.stepIndex, 0);
});

test("Hard on the first step is due in 6 minutes and stays on the step", () => {
  const after = review(newCard(CONFIG), "hard", AT, CONFIG);

  assert.equal(minutesUntil(after), 6);
  assert.equal(after.stepIndex, 0);
});

test("Hard on a later step repeats that step", () => {
  const onStepTwo = review(newCard(CONFIG), "good", AT, CONFIG);
  assert.equal(onStepTwo.stepIndex, 1);

  const after = review(onStepTwo, "hard", AT, CONFIG);

  assert.equal(minutesUntil(after), 10);
  assert.equal(after.stepIndex, 1, "Hard must not advance the step");
});

test("Good moves to the next step, due in 10 minutes", () => {
  const after = review(newCard(CONFIG), "good", AT, CONFIG);

  assert.equal(minutesUntil(after), 10);
  assert.equal(after.state, "learning");
  assert.equal(after.stepIndex, 1);
});

test("Good twice graduates to review with a 1 day interval", () => {
  const once = review(newCard(CONFIG), "good", AT, CONFIG);
  const twice = review(once, "good", AT, CONFIG);

  assert.equal(twice.state, "review");
  assert.equal(twice.intervalDays, 1);
  assert.equal(twice.due, dayBoundary(AT, 1, CONFIG));
  assert.equal(twice.ease, 250, "graduating must not move the ease");
});

test("Easy graduates from step one at the easy interval", () => {
  const after = review(newCard(CONFIG), "easy", AT, CONFIG);

  assert.equal(after.state, "review");
  assert.equal(after.intervalDays, CONFIG.easyInterval);
});

/* ── review cards ────────────────────────────────────────────────────── */

function reviewCard(over: Partial<CardSchedule> = {}): CardSchedule {
  return {
    ...newCard(CONFIG),
    state: "review",
    intervalDays: 10,
    ease: 250,
    reps: 3,
    due: AT,
    ...over,
  };
}

test("Good on a review card multiplies the interval by the ease", () => {
  const after = review(reviewCard(), "good", AT, CONFIG);

  assert.equal(after.intervalDays, 25, "10 days at 2.5x");
  assert.equal(after.ease, 250, "Good leaves the ease alone");
  assert.equal(after.due, dayBoundary(AT, 25, CONFIG));
});

test("Hard on a review card uses 1.2x and drops the ease 15", () => {
  const after = review(reviewCard(), "hard", AT, CONFIG);

  assert.equal(after.intervalDays, 12);
  assert.equal(after.ease, 235);
});

test("Easy uses the ease plus the bonus, and raises the ease 15", () => {
  const after = review(reviewCard(), "easy", AT, CONFIG);

  assert.equal(after.intervalDays, Math.round(10 * 2.5 * 1.3));
  assert.equal(after.ease, 265);
});

/* ── lapses ──────────────────────────────────────────────────────────── */

test("a lapse relearns at 10 minutes, drops the ease 20, and resets to 1 day", () => {
  const after = review(reviewCard({ intervalDays: 30 }), "again", AT, CONFIG);

  assert.equal(after.state, "relearning");
  assert.equal(minutesUntil(after), 10);
  assert.equal(after.ease, 230);
  assert.equal(after.lapses, 1);
  assert.equal(after.intervalDays, 1, "Anki's new-interval of 0, floored at the minimum");
});

test("a relearning card graduates back to the interval its lapse left", () => {
  const lapsed = review(reviewCard({ intervalDays: 30 }), "again", AT, CONFIG);
  const back = review(lapsed, "good", AT + 10 * MINUTE, CONFIG);

  assert.equal(back.state, "review");
  assert.equal(back.intervalDays, 1);
  assert.equal(back.ease, 230, "graduating does not undo the lapse penalty");
});

test("Again inside relearning returns to the first relearning step", () => {
  const lapsed = review(reviewCard(), "again", AT, CONFIG);
  const again = review(lapsed, "again", AT + MINUTE, CONFIG);

  assert.equal(again.state, "relearning");
  assert.equal(minutesUntil(again, AT + MINUTE), 10);
  assert.equal(again.lapses, 1, "a second Again in relearning is not a second lapse");
});

/* ── ease floor ──────────────────────────────────────────────────────── */

test("ease never falls below the floor, however many lapses", () => {
  let card = reviewCard({ ease: 150 });

  for (let i = 0; i < 10; i++) {
    card = review(card, "again", AT, CONFIG);
    card = { ...card, state: "review", intervalDays: 10 };
  }

  assert.equal(card.ease, CONFIG.easeFloor);
  assert.ok(card.ease >= 130);
});

test("Hard repeated also stops at the floor", () => {
  let card = reviewCard({ ease: 140 });
  card = review(card, "hard", AT, CONFIG);

  assert.equal(card.ease, 130);
});

/* ── the day boundary ────────────────────────────────────────────────── */

test("a card due in 1 day lands on the next rollover, not 24 hours later", () => {
  const atNoon = Date.UTC(2026, 9, 14, 12, 0, 0);
  const due = dayBoundary(atNoon, 1, CONFIG);

  assert.equal(due, Date.UTC(2026, 9, 15, 4, 0, 0));
});

test("before the rollover, the card still belongs to the previous day", () => {
  const atOneAm = Date.UTC(2026, 9, 14, 1, 0, 0);
  const due = dayBoundary(atOneAm, 1, CONFIG);

  assert.equal(due, Date.UTC(2026, 9, 14, 4, 0, 0), "three hours later, not twenty-seven");
});

test("the rollover follows the configured offset, not the host", () => {
  const lagos: SchedulerConfig = { ...CONFIG, utcOffsetMinutes: 60 };
  const atNoonUtc = Date.UTC(2026, 9, 14, 12, 0, 0);

  // 4am in UTC+1 is 3am UTC.
  assert.equal(dayBoundary(atNoonUtc, 1, lagos), Date.UTC(2026, 9, 15, 3, 0, 0));
});

/* ── clocks that misbehave ───────────────────────────────────────────── */

test("a clock jumping backwards does not crash or corrupt the card", () => {
  const graduated = review(review(newCard(CONFIG), "good", AT, CONFIG), "good", AT, CONFIG);
  const yearEarlier = AT - 365 * 86_400_000;

  const after = review(graduated, "good", yearEarlier, CONFIG);

  assert.equal(after.state, "review");
  assert.ok(Number.isFinite(after.due!));
  assert.ok(after.intervalDays >= 1);
  assert.equal(after.lastReviewedAt, yearEarlier);
});

test("a card reviewed long after it was due schedules from now, not from due", () => {
  const card = reviewCard({ due: AT - 90 * 86_400_000 });
  const after = review(card, "good", AT, CONFIG);

  assert.equal(after.due, dayBoundary(AT, 25, CONFIG), "the backlog does not shorten the interval");
});

test("a NaN clock is rejected rather than stored", () => {
  const after = review(newCard(CONFIG), "good", Number.NaN, CONFIG);

  assert.ok(Number.isNaN(after.due!), "NaN propagates visibly rather than becoming a bogus date");
});

/* ── button captions ─────────────────────────────────────────────────── */

test("the captions match what the scheduler will actually do", () => {
  const card = newCard(CONFIG);

  assert.equal(intervalLabel(card, "again", AT, CONFIG), "<1m");
  assert.equal(intervalLabel(card, "hard", AT, CONFIG), "<6m");
  assert.equal(intervalLabel(card, "good", AT, CONFIG), "<10m");

  // A card that has just graduated sits at 1 day, so Good gives 1 x 2.5
  // rounded, not the 25 that a ten-day card would.
  const graduated = review(review(card, "good", AT, CONFIG), "good", AT, CONFIG);
  assert.equal(graduated.intervalDays, 1);
  assert.equal(intervalLabel(graduated, "good", AT, CONFIG), "3d");
});

test("a caption never disagrees with the scheduling behind it", () => {
  const card = review(newCard(CONFIG), "good", AT, CONFIG);

  for (const rating of ["again", "hard", "good", "easy"] as const) {
    const predicted = previewMinutes(card, rating, AT, CONFIG);
    const actual = (review(card, rating, AT, CONFIG).due! - AT) / MINUTE;

    assert.equal(predicted, actual, `${rating} caption and scheduling disagree`);
  }
});

/* ── struggling ──────────────────────────────────────────────────────── */

test("a card that has never lapsed and holds its ease is not struggling", () => {
  assert.equal(isStruggling(newCard(CONFIG), CONFIG), false);
  assert.equal(isStruggling(reviewCard(), CONFIG), false);
});

test("Hard alone marks a card as struggling, and Easy clears it again", () => {
  const hard = review(reviewCard(), "hard", AT, CONFIG);
  assert.equal(hard.ease, 235);
  assert.equal(isStruggling(hard, CONFIG), true);

  // 235 -> 250 -> 265: one Easy reaches the starting ease, which is the
  // threshold, so the card leaves on the first Easy.
  const recovered = review(hard, "easy", AT, CONFIG);
  assert.equal(recovered.ease, 250);
  assert.equal(isStruggling(recovered, CONFIG), false, "ease-only cards can recover");
});

test("a lapsed card recovers once its ease climbs back", () => {
  let card = review(reviewCard(), "again", AT, CONFIG);

  assert.equal(card.lapses, 1);
  assert.equal(card.ease, 230);
  assert.equal(isStruggling(card, CONFIG), true, "a lapse drops the ease, so it enters");

  // Two Easys: 230 -> 245 -> 260. The lapse is still on the record and
  // always will be, but it no longer decides the tab.
  card = { ...card, state: "review", intervalDays: 10 };
  card = review(card, "easy", AT, CONFIG);
  assert.equal(isStruggling(card, CONFIG), true, "245 is still under the starting ease");

  card = review({ ...card, intervalDays: 10 }, "easy", AT, CONFIG);
  assert.equal(card.ease, 260);
  assert.equal(card.lapses, 1, "the lapse is still recorded");
  assert.equal(isStruggling(card, CONFIG), false, "and the card has left Struggled");
});

test("the tab is a two-way door: a recovered card can fall back in", () => {
  const recovered = review(reviewCard({ ease: 235 }), "easy", AT, CONFIG);
  assert.equal(isStruggling(recovered, CONFIG), false);

  const slipped = review({ ...recovered, intervalDays: 10 }, "hard", AT, CONFIG);
  assert.equal(slipped.ease, 235);
  assert.equal(isStruggling(slipped, CONFIG), true);
});
