/**
 * `doneLabel` only. The rest of the module is network calls; this is the part
 * with a day boundary in it, which is the part this app keeps getting wrong.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { doneLabel } from "./day.ts";

test("today reads as today", () => {
  assert.equal(doneLabel("2026-10-14", "2026-10-14"), "Done today");
});

test("yesterday is singular", () => {
  assert.equal(doneLabel("2026-10-13", "2026-10-14"), "Done yesterday");
});

test("two to six days back are counted in days", () => {
  assert.equal(doneLabel("2026-10-12", "2026-10-14"), "Done 2 days ago");
  assert.equal(doneLabel("2026-10-08", "2026-10-14"), "Done 6 days ago");
});

test("a week back is a week, not seven days", () => {
  assert.equal(doneLabel("2026-10-07", "2026-10-14"), "Done last week");
});

test("beyond a fortnight it counts whole weeks", () => {
  assert.equal(doneLabel("2026-09-30", "2026-10-14"), "Done 2 weeks ago");
});

test("nothing completed has no label at all", () => {
  assert.equal(doneLabel(null), "");
});

/**
 * The boundary this whole feature exists to get right.
 *
 * A material finished at 23:50 must read "yesterday" at 00:10, not "today"
 * and not "20 minutes ago". Because the stored value is already a local day
 * key, the label is a difference of calendar days and the clock time never
 * enters into it.
 */
test("a late-night completion rolls over at local midnight", () => {
  // Marked 2026-10-13 at 23:50 local -> stored as 2026-10-13.
  assert.equal(doneLabel("2026-10-13", "2026-10-13"), "Done today");
  // Twenty minutes later it is the 14th where the student is sitting.
  assert.equal(doneLabel("2026-10-13", "2026-10-14"), "Done yesterday");
});

/**
 * Month and year ends are where naive date arithmetic breaks: subtracting
 * day numbers rather than real dates would make 1 Oct minus 1 day read as
 * day zero.
 */
test("it counts across a month end", () => {
  assert.equal(doneLabel("2026-09-30", "2026-10-01"), "Done yesterday");
});

test("it counts across a year end", () => {
  assert.equal(doneLabel("2025-12-31", "2026-01-01"), "Done yesterday");
});

test("a date in the future says only that it is done", () => {
  // A clock that moved backwards; better plain than negative.
  assert.equal(doneLabel("2026-10-20", "2026-10-14"), "Done");
});
