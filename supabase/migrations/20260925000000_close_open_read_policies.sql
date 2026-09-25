-- Close the wide-open read policies on exam_answers, exam_attempts and
-- notifications.
--
-- THE PATTERN, THE SAME ONE FOUND ON profiles
-- Each table already has a correct "own rows only" policy. Sitting beside it is
-- a leftover from early setup with no restriction at all. Permissive policies
-- are OR-ed, so the loose one decides every request and the careful one never
-- gets a say. Measured from outside with the anon key that ships in the public
-- bundle: exam_answers 645 rows, exam_attempts 14, notifications 2.
--
-- WHY THE DROPS ARE DYNAMIC AND NOT BY NAME
-- The profiles migrations could name their leftovers because the audit output
-- was in hand when they were written. Here the policy names are not known at
-- authoring time, and guessing a name means a `drop policy if exists` that
-- silently matches nothing and leaves the table open while the migration
-- reports success. Matching on the CONDITION instead -- permissive, and a
-- USING clause that is literally true -- targets exactly what is wrong, and
-- RAISE NOTICE prints each policy it removes so there is a record of it.
--
-- INSERT POLICIES ARE EXCLUDED FROM THE SWEEP
-- An INSERT policy has no USING clause at all, so its `qual` is null. Treating
-- null as "unrestricted" would drop the policies that let the app write, which
-- is how a security fix turns into an outage.
--
-- SECTION 2 IS THE SAFETY NET
-- Because the sweep may remove a FOR ALL policy that was quietly carrying the
-- app's writes, every policy the app actually needs is (re)created explicitly
-- below. After this migration each table's permissions are fully described
-- here rather than inherited from whatever happened to survive.

-- ---------------------------------------------------------------------------
-- 1. Remove the unrestricted read policies
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  dropped int := 0;
begin
  for r in
    select p.tablename, p.policyname, p.cmd, p.roles::text as roles, p.qual
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('exam_answers', 'exam_attempts', 'notifications')
      and p.permissive = 'PERMISSIVE'
      -- SELECT and ALL are the commands that expose rows. INSERT is excluded
      -- above; UPDATE and DELETE are left alone so this cannot silently revoke
      -- a write, and section 2 restates the ones that matter anyway.
      and p.cmd in ('SELECT', 'ALL')
      and p.qual is not null
      and btrim(lower(p.qual)) in ('true', '(true)')
  loop
    raise notice 'DROPPING open policy "%" on % (cmd=%, roles=%)',
      r.policyname, r.tablename, r.cmd, r.roles;

    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    dropped := dropped + 1;
  end loop;

  raise notice 'removed % unrestricted read polic(ies)', dropped;
end $$;

-- ---------------------------------------------------------------------------
-- 2. State, in full, what each table actually allows
-- ---------------------------------------------------------------------------
-- Every policy is dropped by name first so re-running this file is safe. That
-- is the step 20260911194500 was missing, which is why a second run of it
-- failed with 42710 on a policy the first run had already created.

alter table public.exam_answers  enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.notifications enable row level security;

-- exam_answers: the app inserts on submit and counts rows for the dashboard,
-- the weekly report and the study nudge. Own rows, both ways.
drop policy if exists "exam_answers_select_own" on public.exam_answers;
create policy "exam_answers_select_own"
  on public.exam_answers for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "exam_answers_insert_own" on public.exam_answers;
create policy "exam_answers_insert_own"
  on public.exam_answers for insert
  to authenticated
  with check (auth.uid() = user_id);

-- exam_attempts: same shape.
drop policy if exists "exam_attempts_select_own" on public.exam_attempts;
create policy "exam_attempts_select_own"
  on public.exam_attempts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "exam_attempts_insert_own" on public.exam_attempts;
create policy "exam_attempts_insert_own"
  on public.exam_attempts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- notifications: NOT simply own-rows. A row with user_id IS NULL is a
-- broadcast every student is meant to see -- fetchNotifications() asks for
-- `user_id.eq.<me>,user_id.is.null` and the list would go empty without it.
-- Read state for those lives in notification_reads, not on the shared row.
--
-- The admin clause is there because the admin app authors these rows; if it
-- connects with a service_role key it bypasses RLS anyway and the clause costs
-- nothing, and if it connects as an admin user it needs this.
drop policy if exists "notifications_select_own_or_broadcast" on public.notifications;
create policy "notifications_select_own_or_broadcast"
  on public.notifications for select
  to authenticated
  using (
    auth.uid() = user_id
    or user_id is null
    or public.is_admin()
  );

-- Marking read. Restricted to rows that are actually yours: a broadcast's
-- is_read column is shared by everyone who can see it, and one student marking
-- an announcement read used to mark it read for the whole school. That bug was
-- fixed in the client by moving to notification_reads; this stops the database
-- from permitting it at all.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No INSERT policy, deliberately. The only client-side writer is notify_me(),
-- which is SECURITY DEFINER and therefore bypasses RLS; the admin app writes
-- with service_role, which also bypasses it. Granting authenticated a direct
-- INSERT here would let any student write a notification addressed to anyone,
-- or a broadcast addressed to everyone -- which is the whole reason notify_me()
-- exists.
