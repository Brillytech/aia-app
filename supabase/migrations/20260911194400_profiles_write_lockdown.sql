-- profiles: stop any signed-in user from rewriting anyone else's row.
--
-- SAFE TO RUN NOW. This file only touches INSERT and UPDATE. The read side is
-- in 20260911194500_profiles_read_lockdown.sql, which must NOT be run until the
-- client stops reading other students' profiles — see that file.
--
-- WHAT THE POLICIES ACTUALLY SAY TODAY
-- Row-level security is enabled on `profiles`, which reads as protected. The
-- policies are permissive, so they are OR-ed together, and two of them answer
-- `true` for everybody:
--
--   Authenticated can update profiles    UPDATE  {authenticated}  qual: true
--   Allow admins update profile roles    UPDATE  {public}         qual: true
--   Users can update own profile         UPDATE  {public}         qual: (auth.uid() = id)
--
-- The third is the correct one and it is doing nothing, because the first two
-- already said yes. Any signed-in student can rewrite any other student's
-- username, full name, department and level. The second is worse than its name:
-- it is not scoped to admins in any way — `{public}` with `true` is everyone,
-- including anon.
--
-- `profiles.role` holds 'student' (15 rows) and 'super_admin' (2), so "rewrite
-- any row" includes "promote anybody, including yourself".
--
-- The app itself never needed any of this. Every write in the codebase is the
-- caller's own row: .eq("id", user.id), .eq("id", profile.id), or an upsert
-- keyed on user.id. The admin repo is the only plausible user of a cross-row
-- update, so the replacement below is genuinely scoped to admins rather than
-- simply dropped.


-- ---------------------------------------------------------------------------
-- 1. What "admin" means, once
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is not optional here. A policy ON profiles that reads FROM
-- profiles re-enters the same policy and recurses until Postgres gives up. The
-- function runs as its owner, so the lookup inside it is not subject to the
-- policy that calls it.
--
-- Matches 'super_admin', which is what the two admin rows actually hold, and
-- 'admin' as well so a future value does not silently lock those users out.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------------
-- 2. The two policies that said yes to everyone
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated can update profiles" on public.profiles;
drop policy if exists "Allow admins update profile roles" on public.profiles;


-- ---------------------------------------------------------------------------
-- 3. Own row, and admins
-- ---------------------------------------------------------------------------
-- Recreated rather than left alone: the existing "Users can update own profile"
-- has the right USING clause, but its WITH CHECK was not in the policy dump and
-- a null WITH CHECK on an UPDATE policy falls back to USING. Stating both makes
-- it explicit that you cannot move a row to somebody else's id either.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Same reasoning for INSERT: the dump showed qual null, and for INSERT the
-- clause that matters is WITH CHECK, which was not visible. Without one, a row
-- can be inserted for any id at all.
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- What "Allow admins update profile roles" was named for, actually scoped.
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 4. `role` is not yours to set
-- ---------------------------------------------------------------------------
-- Closing the cross-row hole above still leaves self-promotion: your own row is
-- yours to update, and `role` is a column on it. A policy cannot express "every
-- column except this one", and a column-level REVOKE would break signup, which
-- legitimately writes role: 'student' in its upsert.
--
-- So the value is pinned instead of forbidden. A non-admin changing `role` has
-- the change quietly dropped rather than raising: signup re-sends 'student' for
-- a row that already says 'student', which is not a change at all, and an error
-- there would break a flow that is doing nothing wrong.
--
-- INSERT is covered too, or the first write of a profile could simply arrive
-- claiming to be an admin.
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'student';
  elsif new.role is distinct from old.role then
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_role();


-- AFTER RUNNING, these should all still work and are worth clicking through:
--   * completing a profile for a new account (insert path, writes role)
--   * editing your own profile from Edit profile (update path)
--   * changing your avatar from Profile (update path)
-- And this should now fail: any attempt to update a row that is not yours.
