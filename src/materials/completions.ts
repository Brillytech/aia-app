/**
 * "Mark as done" for materials.
 *
 * Server-only, deliberately. The cards store is local-first because a review
 * is answered in a flow that must not stall; marking a material done is one
 * deliberate tap on a small row, so a second offline queue would be more
 * machinery than the feature earns. The caller ticks optimistically and
 * reverts if the write comes back an error.
 *
 * Every day here is the student's LOCAL calendar day, from `localDayKey` — the
 * same helper the streak and the weekly report use. Keying a day with
 * `toISOString()` is the UTC+1 off-by-one this app has already been bitten by:
 * it files anything before 01:00 under yesterday.
 */
import { today } from "./day.ts";
import { supabase } from "../../lib/supabase";
import { sessionUser } from "../session";

export { doneLabel, today } from "./day.ts";

const TABLE = "user_material_completions";
/** Distinct materials ever completed; see the migration for why it is a view. */
const TOTALS_VIEW = "user_material_completion_totals";

export type Completion = {
  materialId: string;
  /** `YYYY-MM-DD`, the local day it was marked. */
  completedOn: string;
};

/** What a row needs to render: the last day it was done, and whether that is today. */
export type MaterialDoneState = {
  doneToday: boolean;
  lastCompletedOn: string | null;
};

export type CompletionMap = Record<string, MaterialDoneState>;


/**
 * The done state for a set of materials.
 *
 * Returns `{}` rather than throwing when there is no session or the read
 * fails: a list that cannot show ticks is still a usable list, and the only
 * cost of being wrong is a tick that appears a moment late.
 */
export async function loadCompletions(materialIds: string[]): Promise<CompletionMap> {
  if (materialIds.length === 0) return {};

  const user = await sessionUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from(TABLE)
    .select("material_id, completed_on")
    .eq("user_id", user.id)
    .in("material_id", materialIds);

  if (error) {
    console.log("COMPLETIONS LOAD ERROR:", error.message);
    return {};
  }

  const now = today();
  const map: CompletionMap = {};

  for (const row of data || []) {
    const id = String((row as any).material_id);
    const on = String((row as any).completed_on).slice(0, 10);
    const existing = map[id];

    map[id] = {
      doneToday: existing?.doneToday || on === now,
      // Several rows can come back for one material — one per day it was
      // finished. The latest is the one the row shows.
      lastCompletedOn:
        existing?.lastCompletedOn && existing.lastCompletedOn > on
          ? existing.lastCompletedOn
          : on,
    };
  }

  return map;
}

/** Insert today's row. Already-marked is success, not an error. */
export async function markDone(materialId: string): Promise<{ ok: boolean; reason?: string }> {
  const user = await sessionUser();
  if (!user) return { ok: false, reason: "signed out" };

  const { error } = await supabase
    .from(TABLE)
    .insert({ user_id: user.id, material_id: materialId, completed_on: today() });

  // 23505 is the unique violation: the row is already there, which is the
  // state the caller wanted. Racing two taps should not surface an error.
  if (error && error.code !== "23505") {
    console.log("MARK DONE FAILED:", error.message);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

/**
 * Remove today's row only.
 *
 * Earlier days are history and stay put — which is what lets an older
 * completion keep reading "Done 3 days ago" under an empty circle.
 */
export async function unmarkToday(materialId: string): Promise<{ ok: boolean; reason?: string }> {
  const user = await sessionUser();
  if (!user) return { ok: false, reason: "signed out" };

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", user.id)
    .eq("material_id", materialId)
    .eq("completed_on", today());

  if (error) {
    console.log("UNMARK FAILED:", error.message);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

/**
 * Distinct materials ever completed — the Profile stat.
 *
 * Counted through the view, with `head: true`, so the server returns a number
 * and no rows at all. The view is `security_invoker`, so this is still the
 * caller's own data and nobody else's.
 */
export async function countCompletedEver(): Promise<number> {
  const user = await sessionUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from(TOTALS_VIEW)
    .select("material_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (error) {
    console.log("COMPLETED EVER COUNT ERROR:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Distinct materials completed today — the dashboard's daily goal.
 *
 * No DISTINCT needed: the primary key is (user_id, material_id, completed_on),
 * so within one day a material can appear at most once and the row count IS
 * the distinct count.
 */
export async function countCompletedToday(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE)
    .select("material_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("completed_on", today());

  if (error) {
    console.log("COMPLETED TODAY COUNT ERROR:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Distinct materials completed across a set of local day keys — the weekly
 * report's window.
 *
 * Counted on the client rather than through the totals view on purpose: a
 * material finished both this week and later has a `max(completed_on)` outside
 * the window being asked about, so the view cannot answer for a PAST week. The
 * rows for seven days are few, and this is correct for any week offset.
 */
export async function countCompletedInDays(userId: string, dayKeys: string[]): Promise<number> {
  if (dayKeys.length === 0) return 0;

  const { data, error } = await supabase
    .from(TABLE)
    .select("material_id, completed_on")
    .eq("user_id", userId)
    .in("completed_on", dayKeys);

  if (error) {
    console.log("COMPLETED IN WEEK ERROR:", error.message);
    return 0;
  }

  return new Set((data || []).map((row: any) => String(row.material_id))).size;
}
