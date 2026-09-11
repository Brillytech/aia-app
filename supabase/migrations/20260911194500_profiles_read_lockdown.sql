-- profiles: own row only, plus admins.
--
-- ########################################################################
-- ##  DO NOT RUN YET.                                                   ##
-- ##                                                                    ##
-- ##  Two places in the app still read other students' profile rows      ##
-- ##  directly, and this breaks both the moment it runs:                 ##
-- ##                                                                    ##
-- ##    src/app/leaderboard.tsx  .in("id", userIds)  -> the board shows  ##
-- ##        "Student ####" for everyone, the bug just fixed, again       ##
-- ##    src/username.ts         .ilike("username")   -> every handle     ##
-- ##        reads as available, and signup collides on the unique index  ##
-- ##                                                                    ##
-- ##  Both have replacements already applied to this database —          ##
-- ##  leaderboard() and username_available() — but the client does not   ##
-- ##  call them yet. Run this only after that client change ships.       ##
-- ##                                                                    ##
-- ##  Requires 20260911194400 first: the admin policy below uses         ##
-- ##  is_admin(), which that file creates.                               ##
-- ########################################################################
--
-- WHAT THE POLICIES SAY TODAY
-- Row-level security is on, and three SELECT policies are OR-ed together:
--
--   Allow admins read admin profiles   SELECT  {public}  qual: true
--   Allow public read profiles count   SELECT  {public}  qual: true
--   Users can view own profile         SELECT  {public}  qual: (auth.uid() = id)
--
-- The third is the intended rule and never gets a say, because the first two
-- answer `true` for everyone. Neither is what its name suggests: the first is
-- not scoped to admins or to admin profiles, and the second is not limited to a
-- count — RLS grants access to rows, not to aggregates, so a `true` SELECT
-- policy hands over every column of every row.
--
-- Measured with only the anon key from the client bundle: all 17 profiles,
-- including `email`. That is what has been coming up repeatedly, and it is the
-- last piece of it.
--
-- If a public student count is genuinely wanted somewhere, it needs a
-- SECURITY DEFINER function returning a number — the same shape as
-- username_available() — not a policy that exposes rows and hopes only counts
-- are asked for.
drop policy if exists "Allow admins read admin profiles" on public.profiles;
drop policy if exists "Allow public read profiles count" on public.profiles;

-- Restated rather than relied upon: the existing one is correct, but it is
-- addressed to {public}, which includes anon. Narrowing it to authenticated
-- costs nothing — auth.uid() is null for anon, so the clause already excluded
-- them — and makes the intended audience readable at a glance.
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- What the first dropped policy was named for.
create policy "Admins can read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());


-- AFTER RUNNING, with only the anon key, `select * from profiles` should return
-- zero rows rather than 17. The leaderboard should still show real names — via
-- leaderboard(), not via profiles — and username availability should still work
-- via username_available(). If either shows placeholder names or says every
-- handle is free, the client change did not ship and this was run too early.
