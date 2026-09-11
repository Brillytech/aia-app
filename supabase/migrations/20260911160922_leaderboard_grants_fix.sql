-- Close the four functions that shipped callable by anyone.
--
-- RUN THIS. The two migrations before it are applied and the grant blocks in
-- both were wrong. Measured against the live database with nothing but the
-- anon key that ships inside the client bundle:
--
--   leaderboard()          200 — 3 rows: rank, user_id, display_name,
--                                department, level, avatar_url, xp
--   leaderboard_totals()   200 — 3 rows of user_id and xp, and this one was
--                                meant to be callable by NOBODY
--   username_available()   200 — true
--   my_leaderboard_rank()  200 — 0 rows, because auth.uid() is null for an
--                                anonymous caller, so this one leaks nothing
--                                even though it answers
--
-- The first two matter most. `xp_events` is hidden from anon by row-level
-- security — an anonymous caller genuinely sees zero rows in it — but these
-- functions are SECURITY DEFINER, so they hand over per-student XP totals and
-- names regardless. That is a route into the data that did not exist before
-- the migration created it.
--
-- WHY THE ORIGINAL REVOKE DID NOTHING
-- Both files said `revoke all on function ... from public`, which removes the
-- grant held by the PUBLIC pseudo-role. On this project that was never where
-- the grant came from: Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE
-- on new functions in `public` to `anon`, `authenticated` and `service_role`.
-- Those are explicit grants to named roles, and revoking from PUBLIC does not
-- touch them. The functions were created already open, and the revoke removed
-- a grant that was not the one letting anon in.
--
-- The lesson is the same one the leaderboard itself just taught: a statement
-- that runs without error is not a statement that did what it said. Both files
-- reported "Success. No rows returned".
--
-- Revoking from the named roles is what actually closes them.
revoke execute on function public.leaderboard_totals(text, timestamptz)
  from public, anon, authenticated;

revoke execute on function public.leaderboard(text, timestamptz, int, int)
  from public, anon;

revoke execute on function public.my_leaderboard_rank(text, timestamptz)
  from public, anon;

revoke execute on function public.username_available(text)
  from public, anon;

-- Then hand back only what the app needs, to signed-in callers only.
-- `leaderboard_totals` is deliberately absent: it is an implementation detail
-- of the two functions above, and they reach it as the function owner rather
-- than through a grant.
grant execute on function public.leaderboard(text, timestamptz, int, int) to authenticated;
grant execute on function public.my_leaderboard_rank(text, timestamptz)   to authenticated;
grant execute on function public.username_available(text)                 to authenticated;

-- NOT DONE HERE, ON PURPOSE
-- The underlying cause is the project's default privileges, which will do this
-- again to the next function anyone creates in `public`:
--
--   alter default privileges in schema public revoke execute on functions from anon;
--
-- That is a project-wide change affecting every future function and anything
-- already relying on anon-callable RPCs, so it is a decision rather than a fix
-- and it is not being made inside a leaderboard migration.
