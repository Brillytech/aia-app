/**
 * Flashcard scheduling, modelled on Anki's default (SM-2) scheduler.
 *
 * Pure and framework-free on purpose: no React, no Supabase, no `Date.now()`.
 * The clock arrives as an argument so a test can put the card anywhere in
 * time, and the timezone arrives in the config so the day boundary is
 * arithmetic rather than a property of the machine running it.
 *
 * WHERE THIS DEPARTS FROM ANKI, AND WHY
 * Every departure is deliberate and lives in the config, so it can be moved
 * back without touching the logic:
 *
 *  - Hard on the first learning step is 6 minutes. Anki uses the average of
 *    the first two steps, which for 1m/10m is 5.5. Rounded up by decision.
 *  - Easy graduates at 3 days; Anki's default easy interval is 4.
 *  - No fuzz. Anki randomises review intervals a little, and adds up to five
 *    minutes to learning cards, so that cards introduced together do not
 *    stay together forever. Left out because it makes tests non-deterministic
 *    and the decks here are small; `fuzz` is the hook if it is wanted later.
 *  - No maximum interval (Anki caps at 100 years) and no leech handling
 *    (Anki tags or suspends at 8 lapses). `lapses` is recorded, so both can
 *    be added without a migration.
 */

export type CardState = "new" | "learning" | "review" | "relearning";

/** The four Anki buttons. Easy is scheduled but not yet shown in the UI. */
export type Rating = "again" | "hard" | "good" | "easy";

export type CardSchedule = {
  state: CardState;
  /** Which learning or relearning step the card is on. */
  stepIndex: number;
  /** UTC milliseconds. Null only for a card that has never been seen. */
  due: number | null;
  /** Whole days. Zero until the card graduates. */
  intervalDays: number;
  /** Percent, as an integer: 250 is Anki's 2.50. */
  ease: number;
  reps: number;
  lapses: number;
  /** UTC milliseconds. The field conflicts are resolved on. */
  lastReviewedAt: number | null;
};

export type SchedulerConfig = {
  /** Minutes. Anki's default for a new deck is 1m then 10m. */
  learningSteps: number[];
  /** Minutes. Anki's default is a single 10m step. */
  relearningSteps: number[];
  /** Days, on graduating with Good from the last learning step. */
  graduatingInterval: number;
  /** Days, on graduating with Easy from any step. */
  easyInterval: number;
  startingEase: number;
  easeFloor: number;
  /** Points added to ease, by button. Good never moves it. */
  easeDelta: Record<Rating, number>;
  /** Hard on a review card multiplies the interval by this. */
  hardMultiplier: number;
  /** Easy multiplies the Good interval by this on top of ease. */
  easyBonus: number;
  /**
   * What a lapse does to the interval before the floor is applied. Anki's
   * default is 0, so a month-old card comes back tomorrow.
   */
  lapseIntervalMultiplier: number;
  /** Days. No review interval is ever shorter than this. */
  minimumInterval: number;
  /**
   * Minutes. Hard on the FIRST learning step, where Anki would use the
   * average of the first two steps.
   */
  hardFirstStepMinutes: number;
  /** Local hour at which a new day's cards become due. Anki's default is 4. */
  rolloverHour: number;
  /**
   * Minutes east of UTC, as `-new Date().getTimezoneOffset()`. Lives here
   * rather than being read inside, so the day boundary is deterministic.
   */
  utcOffsetMinutes: number;
};

export const DEFAULT_CONFIG: SchedulerConfig = {
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 3,
  startingEase: 250,
  easeFloor: 130,
  easeDelta: { again: -20, hard: -15, good: 0, easy: 15 },
  hardMultiplier: 1.2,
  easyBonus: 1.3,
  lapseIntervalMultiplier: 0,
  minimumInterval: 1,
  hardFirstStepMinutes: 6,
  rolloverHour: 4,
  utcOffsetMinutes: 0,
};

const MINUTE = 60_000;
const DAY = 86_400_000;

export function newCard(config: SchedulerConfig = DEFAULT_CONFIG): CardSchedule {
  return {
    state: "new",
    stepIndex: 0,
    due: null,
    intervalDays: 0,
    ease: config.startingEase,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
  };
}

/**
 * When a card scheduled `days` from `now` becomes due.
 *
 * Anki's day does not start at midnight — it rolls over at 4am, so anything
 * studied at 1am still counts as the previous day. The arithmetic is done in
 * local minutes and converted back, so no Date method that reads the host's
 * timezone is involved.
 */
export function dayBoundary(now: number, days: number, config: SchedulerConfig): number {
  const offset = config.utcOffsetMinutes * MINUTE;
  const local = now + offset;

  const localDayStart = Math.floor(local / DAY) * DAY;
  const hoursIntoDay = (local - localDayStart) / 3_600_000;

  // Before the rollover the card still belongs to yesterday's pile.
  const anchor = hoursIntoDay < config.rolloverHour ? localDayStart - DAY : localDayStart;
  const target = anchor + days * DAY + config.rolloverHour * 3_600_000;

  return target - offset;
}

function clampEase(ease: number, config: SchedulerConfig): number {
  return Math.max(config.easeFloor, Math.round(ease));
}

function clampInterval(days: number, config: SchedulerConfig): number {
  return Math.max(config.minimumInterval, Math.round(days));
}

function stepsFor(state: CardState, config: SchedulerConfig): number[] {
  const steps = state === "relearning" ? config.relearningSteps : config.learningSteps;

  // A deck with no steps graduates immediately, which is Anki's behaviour
  // when the relearning steps are left blank.
  return steps.length > 0 ? steps : [];
}

/**
 * How long until this card is next seen, in minutes, if `rating` is pressed.
 *
 * Exposed so the button captions and the scheduling cannot disagree: both
 * read the same function rather than each doing the arithmetic.
 */
export function previewMinutes(
  card: CardSchedule,
  rating: Rating,
  now: number,
  config: SchedulerConfig = DEFAULT_CONFIG,
): number {
  const next = review(card, rating, now, config);
  if (next.due === null) return 0;

  return Math.max(0, (next.due - now) / MINUTE);
}

/**
 * The caption Anki puts under each button.
 *
 * Under ten minutes it reads in minutes, under a day in hours, then days and
 * months. The leading "<" is Anki's: the figure is the delay you are
 * promised at most, and learning cards can arrive slightly later.
 */
export function intervalLabel(
  card: CardSchedule,
  rating: Rating,
  now: number,
  config: SchedulerConfig = DEFAULT_CONFIG,
): string {
  const minutes = previewMinutes(card, rating, now, config);

  if (minutes < 60) return `<${Math.max(1, Math.round(minutes))}m`;

  const hours = minutes / 60;
  if (hours < 24) return `<${Math.round(hours)}h`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;

  const months = days / 30;
  return months < 12 ? `${months.toFixed(1)}mo` : `${(days / 365).toFixed(1)}y`;
}

/**
 * Apply a rating and return the card's next state.
 *
 * Never mutates its input, and never reads the clock: `now` is the whole of
 * its knowledge of when this is happening.
 */
export function review(
  card: CardSchedule,
  rating: Rating,
  now: number,
  config: SchedulerConfig = DEFAULT_CONFIG,
): CardSchedule {
  const base: CardSchedule = {
    ...card,
    reps: card.reps + 1,
    lastReviewedAt: now,
  };

  if (card.state === "review") return reviewCard(base, rating, now, config);

  return learningCard(base, rating, now, config);
}

/** New, learning and relearning cards all walk a list of minute-steps. */
function learningCard(
  card: CardSchedule,
  rating: Rating,
  now: number,
  config: SchedulerConfig,
): CardSchedule {
  const relearning = card.state === "relearning";
  const steps = stepsFor(card.state, config);
  const graduatedInterval = relearning
    ? // A relearning card returns to the interval its lapse left it with,
      // not to the graduating interval — the lapse already decided that.
      clampInterval(card.intervalDays, config)
    : config.graduatingInterval;

  if (rating === "easy") {
    return graduate(card, config.easyInterval, now, config);
  }

  if (steps.length === 0) {
    return graduate(card, graduatedInterval, now, config);
  }

  if (rating === "again") {
    return {
      ...card,
      state: relearning ? "relearning" : "learning",
      stepIndex: 0,
      intervalDays: card.intervalDays,
      due: now + steps[0] * MINUTE,
    };
  }

  if (rating === "hard") {
    // Anki uses the average of the first two steps here; this uses a
    // configured figure so the published spec and the code agree.
    const delay =
      card.stepIndex === 0 && steps.length >= 2
        ? config.hardFirstStepMinutes
        : steps[Math.min(card.stepIndex, steps.length - 1)];

    return {
      ...card,
      state: relearning ? "relearning" : "learning",
      due: now + delay * MINUTE,
    };
  }

  // Good.
  const nextStep = card.state === "new" ? 1 : card.stepIndex + 1;

  if (nextStep >= steps.length) {
    return graduate(card, graduatedInterval, now, config);
  }

  return {
    ...card,
    state: relearning ? "relearning" : "learning",
    stepIndex: nextStep,
    due: now + steps[nextStep] * MINUTE,
  };
}

function graduate(
  card: CardSchedule,
  days: number,
  now: number,
  config: SchedulerConfig,
): CardSchedule {
  const intervalDays = clampInterval(days, config);

  return {
    ...card,
    state: "review",
    stepIndex: 0,
    intervalDays,
    due: dayBoundary(now, intervalDays, config),
  };
}

function reviewCard(
  card: CardSchedule,
  rating: Rating,
  now: number,
  config: SchedulerConfig,
): CardSchedule {
  if (rating === "again") {
    // A lapse. The interval collapses first, then the relearning steps run;
    // whatever is left here is what the card graduates back to.
    const lapsed = clampInterval(card.intervalDays * config.lapseIntervalMultiplier, config);
    const steps = stepsFor("relearning", config);

    const next: CardSchedule = {
      ...card,
      ease: clampEase(card.ease + config.easeDelta.again, config),
      lapses: card.lapses + 1,
      intervalDays: lapsed,
    };

    if (steps.length === 0) return graduate(next, lapsed, now, config);

    return {
      ...next,
      state: "relearning",
      stepIndex: 0,
      due: now + steps[0] * MINUTE,
    };
  }

  // The interval is computed from the ease the card had coming in; the
  // adjustment applies to the next review, not this one.
  const multiplier =
    rating === "hard"
      ? config.hardMultiplier
      : rating === "easy"
        ? (card.ease / 100) * config.easyBonus
        : card.ease / 100;

  const intervalDays = clampInterval(card.intervalDays * multiplier, config);

  return {
    ...card,
    state: "review",
    stepIndex: 0,
    ease: clampEase(card.ease + config.easeDelta[rating], config),
    intervalDays,
    due: dayBoundary(now, intervalDays, config),
  };
}

/**
 * A card the student is struggling with.
 *
 * Ease alone, deliberately. An earlier version also counted any card that had
 * ever lapsed, which made the tab a one-way door: `lapses` only increments, so
 * a card forgotten once stayed here through any number of perfect answers.
 *
 * Ease moves both ways — Hard takes 15 points off, Easy puts 15 back — so a
 * card enters when it goes badly and leaves when it is genuinely recovered.
 * `lapses` is still recorded and is what a leech rule would read later.
 */
export function isStruggling(card: CardSchedule, config: SchedulerConfig = DEFAULT_CONFIG): boolean {
  return card.ease < config.startingEase;
}
