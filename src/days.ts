/**
 * Day and week boundaries, in the student's own timezone.
 *
 * The app's older helpers key days with `toISOString().split("T")[0]`, which is
 * UTC. At UTC+1 that puts anything between midnight and 01:00 into yesterday —
 * so a session at 00:30 on Tuesday counts as Monday, and a streak earned by
 * studying late silently breaks. Anything a student reads as "today", "this
 * week" or "days in a row" is computed here instead, where a day is the day it
 * was where they were sitting.
 *
 * Kept in one file because three callers needed the same four functions and the
 * third copy is where they start to disagree.
 */

/** `YYYY-MM-DD` for the local calendar day a moment falls in. */
export function localDayKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight at the start of the day a moment falls in. */
export function startOfLocalDay(value: Date = new Date()): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return date;
}

/**
 * Local midnight on Monday of the week a moment falls in.
 *
 * Monday, matching every other week boundary in the app — `getWeekStartIso`
 * shifts Sunday back six days rather than forward one, and `xp_events.week_start`
 * is written from it.
 */
export function startOfLocalWeek(value: Date = new Date()): Date {
  const date = startOfLocalDay(value);
  const weekday = date.getDay();
  // getDay() is 0 for Sunday, which belongs to the week that started six days
  // earlier, not the one about to start.
  const backToMonday = weekday === 0 ? 6 : weekday - 1;

  date.setDate(date.getDate() - backToMonday);

  return date;
}

/** The seven local day keys of the week a moment falls in, Monday first. */
export function localWeekDays(value: Date = new Date()): string[] {
  const monday = startOfLocalWeek(value);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);

    return localDayKey(day);
  });
}
