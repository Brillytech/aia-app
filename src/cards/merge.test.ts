/**
 * The merge rule, tested on its own.
 *
 * The conflict rule lives in merge.ts precisely so it can be tested without
 * AsyncStorage or Supabase in the room. The rest of store.ts is plumbing
 * around it, and a test that stubbed both would be testing the stubs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { merge, type CardMap, type StoredCard } from "./merge.ts";
import { DEFAULT_CONFIG, newCard } from "./scheduler.ts";

const AT = Date.UTC(2026, 9, 14, 12, 0, 0);
const HOUR = 3_600_000;

function card(lastReviewedAt: number | null, over: Partial<StoredCard> = {}): StoredCard {
  return {
    schedule: { ...newCard(DEFAULT_CONFIG), lastReviewedAt, intervalDays: 5, state: "review" },
    saved: false,
    needsSync: false,
    ...over,
  };
}

test("a card the device has never seen is taken from the server", () => {
  const merged = merge({}, { a: card(AT) });

  assert.deepEqual(Object.keys(merged), ["a"]);
});

test("the later review wins", () => {
  const local: CardMap = { a: card(AT) };
  const remote: CardMap = { a: card(AT + HOUR) };

  assert.equal(merge(local, remote).a.schedule.lastReviewedAt, AT + HOUR);
});

test("an older server copy does not overwrite a newer local one", () => {
  const local: CardMap = { a: card(AT) };
  const remote: CardMap = { a: card(AT - HOUR) };

  assert.equal(merge(local, remote).a.schedule.lastReviewedAt, AT);
});

test("a local card still waiting to sync is never overwritten", () => {
  // The server is newer, but it has not been told about this answer yet —
  // taking its copy would throw away the review the student just gave.
  const local: CardMap = { a: card(AT, { needsSync: true }) };
  const remote: CardMap = { a: card(AT + HOUR) };

  const merged = merge(local, remote);

  assert.equal(merged.a.schedule.lastReviewedAt, AT);
  assert.equal(merged.a.needsSync, true, "and it stays marked");
});

test("a card never reviewed on either side does not throw", () => {
  const merged = merge({ a: card(null) }, { a: card(null) });

  assert.equal(merged.a.schedule.lastReviewedAt, null);
});

test("a server card that has been reviewed beats a local one that has not", () => {
  const merged = merge({ a: card(null) }, { a: card(AT) });

  assert.equal(merged.a.schedule.lastReviewedAt, AT);
});

test("merging does not mutate either side", () => {
  const local: CardMap = { a: card(AT) };
  const remote: CardMap = { a: card(AT + HOUR) };
  const localBefore = JSON.stringify(local);
  const remoteBefore = JSON.stringify(remote);

  merge(local, remote);

  assert.equal(JSON.stringify(local), localBefore);
  assert.equal(JSON.stringify(remote), remoteBefore);
});

test("saved state travels with the winning copy", () => {
  const local: CardMap = { a: card(AT, { saved: true }) };
  const remote: CardMap = { a: card(AT + HOUR, { saved: false }) };

  assert.equal(merge(local, remote).a.saved, false, "the later answer carries its own saved flag");
});
