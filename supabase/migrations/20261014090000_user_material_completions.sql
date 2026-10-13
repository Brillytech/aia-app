-- "Mark as done" for materials, per student, per day.
--
-- WHY A NEW TABLE
-- The Materials stat came from `user_progress.materials_opened`, an integer
-- counter incremented on open. Opening is not completing: reopening the same
-- PDF on three different days moved the number three times, and a device-local
-- AsyncStorage gate was the only thing holding it down (same day, same device
-- only — and its catch counted the open on any storage failure).
--
-- A row per completion replaces the counter. Rows can be counted distinctly,
-- scoped to a day or a week, and undone; a counter can do none of those.
--
-- WHY THE DAY IS IN THE KEY
-- One row per material per day, so a material finished again next week is a
-- second row. Today's tick toggles only today's row: an older row still reads
-- "Done <that day>" while the circle sits empty, which is what makes marking
-- it again possible. `completed_on` is the student's LOCAL calendar day,
-- computed by src/days.ts `localDayKey` — never `toISOString()`, which at
-- UTC+1 files anything before 01:00 under yesterday.
--
-- THE OLD DATA IS LEFT ALONE
-- Nothing here drops or rewrites `user_progress.materials_opened`. It simply
-- stops being written and stops being read; the historical values stay where
-- they are. The stat starts from zero rather than being backfilled, because
-- the old counter cannot distinguish an open from a completion and a backfill
-- would import exactly the inflation this replaces. See the column comment at
-- the bottom.
--
-- RUN THIS BY HAND IN THE SQL EDITOR, then run
-- supabase/audits/pg_policies_audit.sql and check this table reports RLS
-- enabled with three owner-scoped policies and no open read.

-- One transaction: the table, the view, the indexes, RLS and every policy
-- land together or not at all. A half-applied run that created the table but
-- not the policies would leave a table with RLS on and no way in.
begin;

create table if not exists public.user_material_completions (
  user_id uuid not null references auth.users (id) on delete cascade,

  -- materials.id is uuid: a uuid filter parses against it and a non-uuid
  -- raises 22P02, which only happens on a uuid column. Verified live.
  material_id uuid not null references public.materials (id) on delete cascade,

  -- A date, not a timestamp. The value IS the student's local calendar day,
  -- already resolved on the client; storing an instant would mean every
  -- reader had to re-derive the day and could re-derive it differently.
  completed_on date not null,

  created_at timestamptz not null default now(),

  -- This is the unique(user_id, material_id, completed_on) constraint: as the
  -- primary key it enforces one row per material per day AND supplies the
  -- index, rather than needing a separate unique index beside it.
  --
  -- Its leading columns also serve (user_id, material_id) lookups — "is this
  -- material done, and when" — so no separate index is created for that pair.
  -- A redundant one would cost every write and serve no read the key cannot.
  primary key (user_id, material_id, completed_on)
);

-- The day- and week-scoped reads: the dashboard's "completed today" and the
-- weekly report's seven-day window. The primary key leads with material_id,
-- so it cannot serve a query that filters on the date alone.
create index if not exists user_material_completions_day_idx
  on public.user_material_completions (user_id, completed_on);

alter table public.user_material_completions enable row level security;

-- Owner-scoped, and nothing else. A student reads and writes their own rows
-- and cannot see that anyone else's exist.
--
-- Separate policies per command rather than one FOR ALL, so each WITH CHECK
-- is visible on its own. There is deliberately NO update policy: a completion
-- is inserted or deleted, never edited, and the absence of the policy is what
-- enforces that.
drop policy if exists "user_material_completions_select_own" on public.user_material_completions;
create policy "user_material_completions_select_own"
  on public.user_material_completions
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_material_completions_insert_own" on public.user_material_completions;
create policy "user_material_completions_insert_own"
  on public.user_material_completions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_material_completions_delete_own" on public.user_material_completions;
create policy "user_material_completions_delete_own"
  on public.user_material_completions
  for delete
  using (auth.uid() = user_id);

-- Distinct materials ever completed — the Profile stat.
--
-- A view rather than an RPC: there is no argument to pass and nothing to
-- compute beyond the grouping, so a function would add a signature, a grant
-- and a search_path to get wrong for no gain. PostgREST can count this with
-- head + count=exact, which transfers no rows at all.
--
-- `security_invoker = true` is the whole point: without it the view would run
-- as its owner and return every student's rows to anyone who could select it.
-- With it the base table's RLS applies to the caller, so this view shows a
-- student only their own materials.
--
-- Deliberately NOT used for the week: a past week's rows cannot be found
-- through max(completed_on), which may fall in a later week. The weekly
-- report reads that week's rows and counts them distinctly on the client.
create or replace view public.user_material_completion_totals
with (security_invoker = true) as
select
  user_id,
  material_id,
  min(completed_on) as first_completed_on,
  max(completed_on) as last_completed_on,
  count(*)::integer as times_completed
from public.user_material_completions
group by user_id, material_id;

-- No grant to anon. Both the table and the view are reachable only with a
-- session, which is what every other student-scoped object in this schema
-- does after the September lockdown.
revoke all on public.user_material_completions from anon;
revoke all on public.user_material_completion_totals from anon;
grant select, insert, delete on public.user_material_completions to authenticated;
grant select on public.user_material_completion_totals to authenticated;

-- Left in place on purpose; see the header. Readers of the schema should know
-- the column is dead rather than assume it is still the source of the stat.
comment on column public.user_progress.materials_opened is
  'DEPRECATED 2026-10-14. Counted material OPENS, not completions, and inflated on reopen across days and devices. No longer written or read by the app; superseded by public.user_material_completions. Retained for history — do not backfill from it, the values cannot distinguish an open from a completion.';

commit;
