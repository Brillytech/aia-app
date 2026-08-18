import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Username rules and the availability check behind them.
 *
 * Nothing in the app used to stop two people claiming the same handle — both
 * write paths trimmed the input and wrote it straight to `profiles`. The
 * leaderboard and the shared result card both display it, so duplicates are
 * not cosmetic: two rows reading "ade" are genuinely unresolvable.
 *
 * IMPORTANT: this check is advisory only. Two people typing the same name at
 * the same moment both see "available" and both save. The guarantee has to
 * come from the database:
 *
 *   create unique index profiles_username_lower_key
 *     on public.profiles (lower(username));
 *
 * `isDuplicateUsernameError` below turns that index's rejection into a message
 * a student can act on, so the two halves are meant to ship together.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Strips the decorative "@" people type and surrounding space. */
export function normalizeUsername(raw: string) {
  return raw.trim().replace(/^@+/, "");
}

/**
 * Format check, run before any network call. Returns null when valid.
 *
 * The character set is deliberately narrow: it keeps handles readable, and it
 * means the availability query never has to reason about characters that mean
 * something to Postgres.
 */
export function usernameFormatError(raw: string): string | null {
  const value = normalizeUsername(raw);

  if (!value) return "Please enter a username.";
  if (value.length < USERNAME_MIN) {
    return `At least ${USERNAME_MIN} characters.`;
  }
  if (value.length > USERNAME_MAX) {
    return `No more than ${USERNAME_MAX} characters.`;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._]*$/.test(value)) {
    return "Letters, numbers, dots and underscores only.";
  }
  if (/[._]{2,}/.test(value)) {
    return "No repeated dots or underscores.";
  }
  if (/[._]$/.test(value)) {
    return "Cannot end with a dot or underscore.";
  }

  return null;
}

/**
 * True when someone else already holds this handle, case-insensitively.
 *
 * `ilike` is a LIKE match, so `_` and `%` in the needle would act as
 * wildcards — "ade_1" would match a stored "adeX1" and wrongly report the
 * name as taken. They are escaped here, and the rows that come back are
 * compared exactly in JS as a second guard.
 */
export async function isUsernameTaken(raw: string, excludeUserId?: string | null) {
  const value = normalizeUsername(raw);
  if (!value) return false;

  const escaped = value.replace(/([\\%_])/g, "\\$1");

  let query = supabase.from("profiles").select("id, username").ilike("username", escaped).limit(5);

  if (excludeUserId) query = query.neq("id", excludeUserId);

  const { data, error } = await query;

  // Fail open. A network blip should not block someone finishing signup, and
  // the unique index is the thing that actually enforces this.
  if (error) {
    console.log("USERNAME CHECK ERROR:", error.message);
    return false;
  }

  const target = value.toLowerCase();

  return (data || []).some(
    (row: any) => normalizeUsername(String(row.username || "")).toLowerCase() === target,
  );
}

/**
 * Recognises the unique-index rejection so the raw Postgres text
 * ("duplicate key value violates unique constraint …") never reaches a user.
 */
export function isDuplicateUsernameError(error: any) {
  if (!error) return false;
  if (error.code === "23505") return true;

  const text = `${error.message || ""} ${error.details || ""}`.toLowerCase();

  return text.includes("duplicate key") && text.includes("username");
}

export type UsernameStatus =
  | "idle"
  | "invalid"
  | "checking"
  | "available"
  | "taken";

/**
 * Debounced live availability for a username field.
 *
 * `excludeUserId` is the current user on the edit screen, so keeping your own
 * existing handle never reports as taken.
 */
export function useUsernameAvailability(raw: string, excludeUserId?: string | null) {
  const value = normalizeUsername(raw);
  const formatError = value ? usernameFormatError(value) : null;
  const shouldCheck = Boolean(value) && !formatError;

  // Only the network answer is state, and it stores the value it belongs to.
  // Everything else is derived below during render — an empty or malformed
  // field needs no round trip, and setting state for it inside the effect is
  // both a wasted render and what `react-hooks/set-state-in-effect` forbids.
  const [result, setResult] = useState<{ value: string; taken: boolean } | null>(null);

  // Guards against an earlier, slower request resolving after a later one and
  // overwriting the newer answer.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!shouldCheck) return;

    const ticket = ++requestRef.current;

    // Waits for a pause in typing rather than querying per keystroke.
    const timer = setTimeout(async () => {
      const taken = await isUsernameTaken(value, excludeUserId);

      if (ticket !== requestRef.current) return;

      setResult({ value, taken });
    }, 450);

    return () => clearTimeout(timer);
  }, [value, excludeUserId, shouldCheck]);

  // A result for a *different* value means the field has moved on since the
  // last answer, which reads as "checking" — so a stale "available" can never
  // sit under a name nobody has looked up yet.
  const status: UsernameStatus = !value
    ? "idle"
    : formatError
      ? "invalid"
      : result?.value === value
        ? result.taken
          ? "taken"
          : "available"
        : "checking";

  const message =
    formatError ?? (status === "taken" ? "That username is taken." : null);

  return { status, message };
}
