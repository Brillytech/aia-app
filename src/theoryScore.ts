/**
 * Scoring a topic that mixes self-rated theory with auto-graded grids.
 *
 * THE ONE RULE
 * ------------
 * Every question contributes its own `marks`, scaled by an achievement
 * fraction between 0 and 1. Only the SOURCE of that fraction differs:
 *
 *   theory  fraction = rating / 5      (missed 0, partly 3, got 5)
 *   grid    fraction = correctCells / totalCells
 *
 * so there is no per-type branch in the arithmetic, and adding a third kind of
 * question later means producing a fraction, not editing this file.
 *
 * WHY MARKS-WEIGHTED RATHER THAN FLAT 0/3/5
 * -----------------------------------------
 * The question screen prints marks in the right margin as the thing that says
 * "theory question". A 15-mark essay scoring the same as a 5-mark definition
 * would contradict what the student is looking at. Flat points also make the
 * unit incomparable across types: grids would swing a topic simply by having
 * more cells, and cells are not marks.
 *
 * A question with no marks falls back to DEFAULT_MARKS, which is 5 — so on
 * rows that never set the column this degrades to exactly the flat reading.
 *
 * UNATTEMPTED COUNTS AGAINST YOU
 * ------------------------------
 * `fraction: null` earns nothing but still contributes its marks to the total,
 * matching how exam scoring counts unanswered questions into `total_questions`.
 * `attempted` is reported separately so the summary can say so out loud.
 */

export type SelfCheck = "missed" | "partly" | "got";

/** The button values. Self-assessment, not grading. */
export const RATING_POINTS: Record<SelfCheck, number> = {
  missed: 0,
  partly: 3,
  got: 5,
};

export const RATING_SCALE = 5;

/** Weight for a question whose `marks` column is null or non-positive. */
export const DEFAULT_MARKS = 5;

/** Where a fraction came from. Drives the self-assessed / auto-graded split,
 *  which the summary shows rather than hides. */
export type ScoreSource = "self" | "auto";

export type ScoredItem = {
  id: string;
  /** From the question row. Null or <= 0 falls back to DEFAULT_MARKS. */
  marks: number | null;
  /** 0..1 achieved, or null when the question was never attempted. */
  fraction: number | null;
  source: ScoreSource;
};

export type TopicScore = {
  earned: number;
  possible: number;
  /** 0..100, rounded. Zero when there is nothing to score. */
  percent: number;
  self: { earned: number; possible: number };
  auto: { earned: number; possible: number };
  attempted: number;
  total: number;
};

/** 0..1 for a self-rating, or null when the student has not rated it yet. */
export function ratingFraction(rating: SelfCheck | null | undefined): number | null {
  if (!rating) return null;

  return RATING_POINTS[rating] / RATING_SCALE;
}

/** What a question is worth, with the fallback applied. */
export function marksFor(item: { marks: number | null }): number {
  return typeof item.marks === "number" && item.marks > 0 ? item.marks : DEFAULT_MARKS;
}

/** Marks earned on one question. Unattempted earns nothing. */
export function earnedFor(item: ScoredItem): number {
  if (item.fraction === null) return 0;

  // Clamped rather than trusted: a grid reporting more correct cells than it
  // has would otherwise push a topic past 100%.
  const fraction = Math.max(0, Math.min(1, item.fraction));

  return marksFor(item) * fraction;
}

export function scoreTopic(items: ScoredItem[]): TopicScore {
  const empty = { earned: 0, possible: 0 };
  const self = { ...empty };
  const auto = { ...empty };

  let earned = 0;
  let possible = 0;
  let attempted = 0;

  for (const item of items) {
    const marks = marksFor(item);
    const got = earnedFor(item);

    earned += got;
    possible += marks;
    if (item.fraction !== null) attempted += 1;

    const bucket = item.source === "auto" ? auto : self;
    bucket.earned += got;
    bucket.possible += marks;
  }

  return {
    earned,
    possible,
    percent: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    self,
    auto,
    attempted,
    total: items.length,
  };
}

/** "18" / "18.5" — marks are usually whole, so only show a decimal when the
 *  weighting actually produced one. */
export function formatMarks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
