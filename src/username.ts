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
 * Is this username already somebody else's?
 *
 * WHY THIS IS AN RPC AND NOT A QUERY
 * It used to `select("id, username").ilike(...)` straight off `profiles` —
 * reading OTHER PEOPLE'S ROWS to answer a question about one string. That is
 * the single reason `profiles` still has to be readable by any signed-in user,
 * and it is what kept the read lockdown from being applied while every student
 * name, email and role sat open to anyone holding the bundled anon key.
 *
 * `username_available()` is SECURITY DEFINER, so it can look across the table
 * from inside the database and hand back one boolean. The caller learns whether
 * the name is free and nothing else — not who has it, not how many rows matched.
 *
 * THE CALLER NO LONGER PASSES AN ID
 * The old signature took the current user's id so the check would not trip over
 * their own existing username. The function does that itself with
 * `p.id is distinct from auth.uid()`, which is strictly better: it cannot be
 * passed the wrong id, and it cannot be omitted by a caller that forgets. Both
 * call sites passed their own id, so nothing changes in behaviour — except on
 * the complete-profile screen, which never passed it and therefore used to
 * report your own name back to you as taken.
 */
export async function isUsernameTaken(raw: string) {
  const value = normalizeUsername(raw);
  if (!value) return false;

  const { data, error } = await supabase.rpc("username_available", {
    p_username: value,
  });

  // Fail open. A network blip should not block someone finishing signup, and
  // the unique index on lower(username) is what actually enforces this.
  if (error) {
    console.log("USERNAME CHECK ERROR:", error.message);
    return false;
  }

  // The function answers the opposite question, so only an explicit `false`
  // means taken. Anything unexpected — null, undefined — falls through to the
  // same fail-open rule as an error.
  return data === false;
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
 * The current user is excluded by `username_available()` itself, through
 * `auth.uid()`, so keeping your own existing handle never reports as taken and
 * no caller has to remember to say so.
 */
export function useUsernameAvailability(raw: string) {
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
      const taken = await isUsernameTaken(value);

      if (ticket !== requestRef.current) return;

      setResult({ value, taken });
    }, 450);

    return () => clearTimeout(timer);
  }, [value, shouldCheck]);

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
