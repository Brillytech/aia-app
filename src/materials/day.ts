/**
 * The day half of completions, kept free of Supabase so it can be tested.
 *
 * Same split as `src/cards/merge.ts`: the rule with the edge cases lives in a
 * module that imports nothing but the shared day helpers, and the module that
 * talks to the network re-exports it. Otherwise `node --test` has to resolve
 * the Supabase client to check a string.
 */
import { localDayKey } from "../days.ts";

/** Today's local day key. One definition, so callers cannot drift from it. */
export function today(): string {
  return localDayKey(new Date());
}

/**
 * How a finished row reads: "Done today", "Done yesterday", "Done 3 days ago".
 *
 * Counted in whole local days between two day keys rather than in elapsed
 * hours, so something finished at 23:50 reads "yesterday" at 00:10 and not
 * "20 minutes ago". Both arguments are already local day keys — the clock
 * time never enters into it, which is the whole point of storing a date.
 */
export function doneLabel(completedOn: string | null, now: string = today()): string {
  if (!completedOn) return "";
  if (completedOn === now) return "Done today";

  // Parsed at local midnight. A bare "YYYY-MM-DD" would be read as UTC and
  // reintroduce exactly the offset this module exists to avoid.
  const then = new Date(`${completedOn}T00:00:00`);
  const current = new Date(`${now}T00:00:00`);

  if (Number.isNaN(then.getTime()) || Number.isNaN(current.getTime())) return "Done";

  const days = Math.round((current.getTime() - then.getTime()) / 86_400_000);

  if (days === 1) return "Done yesterday";
  if (days > 1 && days < 7) return `Done ${days} days ago`;
  if (days >= 7 && days < 14) return "Done last week";
  if (days >= 14) return `Done ${Math.floor(days / 7)} weeks ago`;

  // A future date can only mean a clock that moved; say the plain thing.
  return "Done";
}
