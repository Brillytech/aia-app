-- app_reviews: own row only, plus admins.
--
-- WHAT IS WRONG
-- The table is readable with the anon key that ships in the public JS bundle.
-- The open policy is narrower than the ones found on the other tables -- it
-- exposes only `status = 'approved'` rows rather than everything -- but the
-- columns it exposes are the problem, not the row count: `user_id` sits beside
-- `display_name`, `department`, `level` and the review text, which ties a named
-- student to an opinion they wrote about the app.
--
-- WHY CLOSING IT COSTS NOTHING TODAY
-- Nothing in this application reads app_reviews. The only reference anywhere in
-- the client is a single insert in src/app/(tabs)/profile.tsx. The public read
-- therefore serves no feature that exists; it serves either the admin app,
-- which connects with service_role and bypasses RLS entirely, or a testimonials
-- page that has not been built.
--
-- IF TESTIMONIALS ARE WANTED LATER, DO NOT REOPEN THIS TABLE.
-- Expose a view that selects display_name, rating and review and omits user_id
-- altogether. A policy cannot hide a column; only a view or a function can. The
-- moment the raw table is public again, so is the link between a student and
-- their review.
--
-- THE SWEEP IS UNCONDITIONAL HERE, UNLIKE 20260925000000
-- That migration matched policies whose USING clause was literally `true`. This
-- one cannot: the open policy's qual is a real expression (`status = 'approved'`),
-- so a condition match would skip it and report success over a table that was
-- still open. Every existing policy is dropped instead, and section 2 then
-- states the complete set outright -- which is safe precisely because the full
-- intended behaviour is written below rather than partly inherited.

-- ---------------------------------------------------------------------------
-- 1. Clear whatever is there
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  dropped int := 0;
begin
  for r in
    select p.policyname, p.cmd, p.roles::text as roles, p.qual
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'app_reviews'
  loop
    raise notice 'DROPPING policy "%" on app_reviews (cmd=%, roles=%, using=%)',
      r.policyname, r.cmd, r.roles, coalesce(r.qual, '(none)');

    execute format('drop policy %I on public.app_reviews', r.policyname);
    dropped := dropped + 1;
  end loop;

  raise notice 'removed % polic(ies) from app_reviews; the set below is now the whole rule', dropped;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The complete rule
-- ---------------------------------------------------------------------------

alter table public.app_reviews enable row level security;

-- Submitting a review. Two conditions, not one.
--
-- `auth.uid() = user_id` stops a review being filed under someone else's name.
--
-- The status check is the less obvious half. The client sends
-- `status: "pending"` and the admin app moderates from there, but nothing in
-- the database enforced that -- an authenticated user could post a review with
-- `status: 'approved'` and walk straight past moderation into whatever surface
-- displays approved reviews. Moderation that the client alone enforces is not
-- moderation.
drop policy if exists "app_reviews_insert_own_pending" on public.app_reviews;
create policy "app_reviews_insert_own_pending"
  on public.app_reviews for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and coalesce(status, 'pending') = 'pending'
  );

-- Reading your own. The app does not do this today; it is here so that "you
-- have already submitted a review" is possible later without reopening
-- anything, and because a student being unable to see what they wrote about
-- themselves is a strange rule to encode deliberately.
drop policy if exists "app_reviews_select_own" on public.app_reviews;
create policy "app_reviews_select_own"
  on public.app_reviews for select
  to authenticated
  using (auth.uid() = user_id);

-- Moderation. FOR ALL, because approving a review is an UPDATE and removing an
-- abusive one is a DELETE, and both are things an admin has to be able to do.
-- Redundant for a service_role connection, which bypasses RLS regardless, but
-- it means an admin signed in as a normal user is not locked out of their own
-- moderation queue.
drop policy if exists "app_reviews_admin_all" on public.app_reviews;
create policy "app_reviews_admin_all"
  on public.app_reviews for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No UPDATE or DELETE policy for students, deliberately. Editing a review after
-- it has been approved would let approved text be swapped for anything at all,
-- and the app offers neither action.
