-- Leaderboard: rank in the database instead of in the browser.
--
-- The screen currently pulls up to 5000 raw `xp_events` rows, sums them per
-- user in JavaScript, fetches every one of those profiles in a single `IN`,
-- sorts, and keeps the top 50. That works at 17 students and fails in four
-- separate ways as it grows:
--
--   * past 50 users the board is simply cut off — nobody outside the top 50
--     can see anyone near them, and "Show more" can never reach them;
--   * past 5000 xp_events the `.limit(5000)` has no `order by`, so the rows
--     that come back are an arbitrary subset and the totals computed from them
--     are wrong, not merely partial — and wrong differently on each load;
--   * around a thousand distinct users the profiles request puts ~37KB of
--     UUIDs in a query string and fails outright;
--   * your own rank is derived from whatever that truncated sample contained.
--
-- All four are the same mistake: aggregating over a table in a client that can
-- only see a page of it. The two functions below do it where the data is.
--
-- Nothing here changes what an event means or how XP is earned; this only
-- reads `xp_events` and `profiles`.


-- ---------------------------------------------------------------------------
-- 1. Indexes for the two range filters
-- ---------------------------------------------------------------------------
-- Both functions filter on a timestamp and then aggregate `xp` grouped by
-- `user_id`. INCLUDE puts those two columns in the index leaf pages, so the
-- weekly and monthly boards can be answered from the index alone rather than
-- visiting the heap for every event row.
--
-- All-time has no filter and will still scan, which is correct: it genuinely
-- has to read every event.
create index if not exists xp_events_week_start_idx
  on public.xp_events (week_start) include (user_id, xp);

create index if not exists xp_events_created_at_idx
  on public.xp_events (created_at) include (user_id, xp);


-- ---------------------------------------------------------------------------
-- 2. The totals, in one place
-- ---------------------------------------------------------------------------
-- Both public functions below need the same per-user sums over the same range.
-- They call this rather than each writing their own copy of the predicate —
-- two places computing the same number and drifting apart is precisely the bug
-- that made the board show one question count in the chooser and a different
-- one in the header.
--
-- `p_since` is supplied by the caller rather than computed here on purpose.
-- The app defines "this week" as local midnight on Monday and "this month" as
-- local midnight on the 1st, converted to UTC. `date_trunc('week', now())`
-- would be UTC midnight, which is a different instant for every student not on
-- UTC — a silent change of meaning buried in a migration. The client keeps
-- owning that definition; this only applies it.
--
-- `p_range` picks the column because the app already does: weekly filters the
-- denormalised `week_start`, everything else filters `created_at`.
--
-- SECURITY DEFINER because row-level security hides other students' events —
-- verified: an anonymous caller sees 0 rows in `xp_events`. A leaderboard is by
-- definition a view across users, so it has to run as the owner. It reads two
-- tables, aggregates, and returns totals; it exposes no event rows.
create or replace function public.leaderboard_totals(
  p_range text,
  p_since timestamptz
)
returns table (user_id uuid, xp bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.user_id, sum(e.xp)::bigint
  from public.xp_events e
  where e.user_id is not null
    and (
      p_since is null
      or (p_range = 'weekly' and e.week_start >= p_since)
      or (p_range is distinct from 'weekly' and e.created_at >= p_since)
    )
  group by e.user_id;
$$;


-- ---------------------------------------------------------------------------
-- 3. A page of the board
-- ---------------------------------------------------------------------------
-- Returns rows already ranked, already named and already paged, so the client
-- asks for page N and renders it.
--
-- TWO ORDERINGS, DELIBERATELY
-- `rank` uses rank() over (xp desc) so students on the same XP share a rank —
-- which is what a leaderboard means. `seq` adds user_id as a tiebreaker to make
-- the sort a total order, and paging uses that. Without it two rows on equal XP
-- have no defined order between pages, so one of them can appear on both page 1
-- and page 2 while the other appears on neither.
--
-- The name is resolved here rather than in the client so there is one rule, and
-- so `email` never has to leave the database. The client's current chain ends
-- in an email prefix; that fallback is dropped here on purpose — one student
-- should not learn another's email address from a leaderboard.
--
-- `p_limit` is clamped. An RPC that will happily return every row on request is
-- the same unbounded query this was meant to replace.
create or replace function public.leaderboard(
  p_range  text        default 'all',
  p_since  timestamptz default null,
  p_limit  int         default 25,
  p_offset int         default 0
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  department   text,
  level        text,
  avatar_url   text,
  xp           bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with totals as (
    select * from public.leaderboard_totals(p_range, p_since)
  ),
  ranked as (
    select
      rank()       over (order by t.xp desc)              as rank,
      row_number() over (order by t.xp desc, t.user_id)   as seq,
      t.user_id,
      t.xp
    from totals t
  )
  select
    r.rank,
    r.user_id,
    coalesce(
      nullif(btrim(p.username), ''),
      nullif(btrim(p.full_name), ''),
      'Student ' || left(r.user_id::text, 4)
    ) as display_name,
    p.department,
    p.level,
    p.avatar_url,
    r.xp
  from ranked r
  left join public.profiles p on p.id = r.user_id
  order by r.seq
  limit  greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;


-- ---------------------------------------------------------------------------
-- 4. Your own rank, however deep you are
-- ---------------------------------------------------------------------------
-- One row about the caller. This is what lets the "You" row be correct without
-- the client holding the whole board: today it can only find you inside the
-- 50 rows it kept, and it prints "of 50" because that is all it has.
--
-- `auth.uid()` still reads the caller's JWT inside a SECURITY DEFINER function,
-- so this cannot be used to read someone else's position — there is no user
-- parameter to pass.
--
-- Returns NO ROWS for a student with no events in the range. That is not an
-- error: they are genuinely unranked this week, and the client should say so
-- rather than showing rank 0.
create or replace function public.my_leaderboard_rank(
  p_range text        default 'all',
  p_since timestamptz default null
)
returns table (
  rank        bigint,
  xp          bigint,
  total_users bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with totals as (
    select * from public.leaderboard_totals(p_range, p_since)
  ),
  ranked as (
    select
      rank() over (order by t.xp desc) as rank,
      t.user_id,
      t.xp
    from totals t
  )
  select r.rank, r.xp, (select count(*) from totals)::bigint
  from ranked r
  where r.user_id = auth.uid();
$$;


-- ---------------------------------------------------------------------------
-- 5. Who may call what
-- ---------------------------------------------------------------------------
-- EXECUTE is granted to PUBLIC by default on new functions, which on a Supabase
-- project means anyone holding the anon key — and that key ships inside the
-- client bundle. Revoked first, then granted only to signed-in callers.
--
-- `leaderboard_totals` is granted to nobody: it is an implementation detail of
-- the two functions above, and they reach it as the owner.
revoke all on function public.leaderboard_totals(text, timestamptz) from public;
revoke all on function public.leaderboard(text, timestamptz, int, int) from public;
revoke all on function public.my_leaderboard_rank(text, timestamptz) from public;

grant execute on function public.leaderboard(text, timestamptz, int, int) to authenticated;
grant execute on function public.my_leaderboard_rank(text, timestamptz) to authenticated;
