-- Ask whether a handle is free without reading everyone's row.
--
-- Not applied. Safe to run at any time — it only adds a function, and no
-- client code calls it yet.
--
-- WHY THIS EXISTS
-- `isUsernameTaken` in src/username.ts is one of only two places in the whole
-- app that reads a `profiles` row belonging to somebody else. Every other
-- profiles query is `.eq("id", user.id)`. The other one is the leaderboard,
-- and the leaderboard functions in 20260911155128 remove its need to.
--
-- Those two are what stand between the app and locking `profiles` down to
-- own-row reads. This is the second of them: a yes/no question answered in the
-- database, instead of a `select id, username ... ilike` that hands the client
-- other people's rows to compare in JavaScript.
--
-- MATCHES THE CLIENT'S EXISTING RULE EXACTLY
-- `normalizeUsername` trims, then strips leading "@". The comparison is
-- case-insensitive. Both are reproduced below, and only the INPUT is
-- normalised — the stored side stays a bare `lower(username)` so this uses
-- `profiles_username_lower_key` (added in 20260818111249) as an index lookup
-- rather than scanning and normalising every row.
--
-- `auth.uid()` replaces the client's `excludeUserId` argument. Editing your own
-- profile should not report your own handle as taken, and deciding who "you"
-- are is not something the caller should get to assert.
--
-- SECURITY DEFINER so it can see rows the caller cannot. It returns one
-- boolean and never returns a row, an id, or a name.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- Blank has no meaningful answer. The client's format check rejects it
    -- long before this is reached; "not available" is the safe direction for
    -- the case where it somehow is not.
    when coalesce(btrim(regexp_replace(btrim(p_username), '^@+', '')), '') = '' then false
    else not exists (
      select 1
      from public.profiles p
      where lower(p.username) = lower(regexp_replace(btrim(p_username), '^@+', ''))
        and p.id is distinct from auth.uid()
    )
  end;
$$;

-- Both callers — complete-profile and edit-profile — are signed in, so `anon`
-- has no reason to hold this.
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to authenticated;
