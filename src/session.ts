import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/**
 * Whether someone is signed in — answered from storage, not from the network.
 *
 * WHY THIS EXISTS
 * The app asked `supabase.auth.getUser()` 28 times, and 27 of those threw the
 * error away:
 *
 *     const { data: userData } = await supabase.auth.getUser();
 *     const user = userData.user;                      // null on ANY failure
 *
 * `getUser()` makes a network round-trip to /auth/v1/user to validate the token
 * with the server. So an unreachable server, a cold start before the radio is
 * up, or a momentary blip all produced `user === null` — indistinguishable from
 * being signed out. Six screens then redirected to the login page, throwing out
 * a student whose session was sitting intact in local storage the whole time.
 *
 * `getSession()` answers from storage and refreshes only when the token has
 * actually expired, so the ordinary case costs no network at all.
 *
 * THIS IS NOT A WEAKENING
 * Trusting local storage for "should I show the app or the login screen" is
 * fine, because it is not what protects anything. Row-level security decides
 * what data a token can read, server-side, on every request. Someone who forges
 * a storage entry gets the app's chrome and no rows. `getUser()` was being used
 * as a router guard, which is not a job it needs to do.
 *
 * THREE ANSWERS, NOT TWO
 * "Signed out" and "cannot tell right now" are different, and the whole bug was
 * collapsing them into one. Callers that redirect must act only on the first.
 */

export type SessionState =
  | { status: "signed-in"; session: Session; user: User }
  | { status: "signed-out" }
  | { status: "unavailable"; reason: string };

/**
 * One retry before reporting failure, because the common case is a cold start
 * where storage or the refresh endpoint is a moment behind the first render.
 * Short enough not to be felt, long enough to clear that.
 */
const RETRY_MS = 700;

async function attempt(): Promise<SessionState> {
  try {
    const { data, error } = await supabase.auth.getSession();

    // An error here means the stored token needed refreshing and the refresh
    // could not complete. That is "ask again later", not "signed out".
    if (error) return { status: "unavailable", reason: error.message };

    const session = data.session;
    if (!session) return { status: "signed-out" };

    return { status: "signed-in", session, user: session.user };
  } catch (thrown: any) {
    return { status: "unavailable", reason: String(thrown?.message || thrown) };
  }
}

export async function readSession(): Promise<SessionState> {
  const first = await attempt();
  if (first.status !== "unavailable") return first;

  await new Promise((resolve) => setTimeout(resolve, RETRY_MS));

  return attempt();
}

/**
 * The signed-in user, or null.
 *
 * For the many callers that only want an id to filter their own rows by, and
 * already do nothing useful without one. It deliberately flattens "signed out"
 * and "cannot tell" back together — the worst case is skipping one save or one
 * load, which the next open repeats. Anything that REDIRECTS must use
 * `readSession()` and look at the status instead.
 */
export async function sessionUser(): Promise<User | null> {
  const state = await readSession();

  return state.status === "signed-in" ? state.user : null;
}
