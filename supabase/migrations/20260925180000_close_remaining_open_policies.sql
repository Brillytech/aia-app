-- admin_logs, practice_answers, practice_attempts: remove the wide-open
-- policies the second pg_policies audit turned up.
--
-- THE SAME PATTERN, A THIRD TIME
-- A correctly-scoped policy with a loose one beside it. Permissive policies are
-- OR-ed, so the loose one answers every request and the careful one never gets
-- a say. This is now the third batch; it is a property of how the project was
-- first set up, not three separate mistakes.
--
-- WHY BEHAVIOURAL PROBING DID NOT FIND THESE
-- Worth writing down, because it is the reason the audit is now the standing
-- check rather than a one-off:
--
--   practice_answers / practice_attempts -- an anon probe read 0 rows from both
--     and they were reported as "0 rows to anon: RLS filtering, or genuinely
--     empty. NOT proven safe." That caveat was correct. An empty table hides an
--     open policy perfectly, right up until it has rows in it.
--
--   admin_logs -- never probed at all. The probe builds its table list by
--     harvesting every from("...") in src/, and no client code references this
--     table, so it was invisible to the only check that had been running.
--
-- WHAT THIS FILE DOES NOT DO
-- It drops the loose policies BY NAME, from the audit output, and leaves the
-- correctly-scoped own-row policies untouched. The previous batch had to sweep
-- by condition because the names were not known; they are known now, and a
-- named drop is the narrower instrument. Section 3 is the only safety net: it
-- adds an own-row SELECT policy ONLY to a table left with no SELECT policy at
-- all, so this cannot take a working read path away with it.

-- ---------------------------------------------------------------------------
-- 1. admin_logs -- policies named for admins that check nothing
-- ---------------------------------------------------------------------------
-- Both were roles=public with USING/CHECK true. The names say admin; the
-- conditions say everyone. Replaced with the real check, the same is_admin()
-- used on profiles and notifications.

alter table public.admin_logs enable row level security;

drop policy if exists "Allow admins create logs" on public.admin_logs;
drop policy if exists "Allow admins read logs"   on public.admin_logs;

drop policy if exists "admin_logs_select_admin" on public.admin_logs;
create policy "admin_logs_select_admin"
  on public.admin_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin_logs_insert_admin" on public.admin_logs;
create policy "admin_logs_insert_admin"
  on public.admin_logs for insert
  to authenticated
  with check (public.is_admin());

-- No UPDATE or DELETE policy. An audit log that can be edited or erased by the
-- people it records is not an audit log. A service_role connection bypasses RLS
-- and can still administer the table directly if it ever genuinely needs to.

-- ---------------------------------------------------------------------------
-- 2. practice_answers / practice_attempts -- drop the loose read policies
-- ---------------------------------------------------------------------------
-- Each already has a correctly-scoped own-row SELECT policy beside these, which
-- is deliberately left in place. Nothing here touches INSERT: the app writes to
-- both on every finished session, and those policies are not the problem.

drop policy if exists "Allow public read practice answers"  on public.practice_answers;
drop policy if exists "Allow public read practice attempts" on public.practice_attempts;

-- ---------------------------------------------------------------------------
-- 3. Safety net -- only fires if a table was left with no way to read it
-- ---------------------------------------------------------------------------
-- The audit says a correctly-scoped policy survives on each. This verifies that
-- rather than trusting it: if a table now has no SELECT policy, its own-row
-- rule is created, because losing the dashboard, the weekly report and the
-- study nudge would be a worse outcome than a redundant policy.
--
-- It reports either way, so the run output says plainly which tables were
-- already fine and which needed catching.
--
-- admin_logs is NOT in this list. Section 1 has already given it a SELECT
-- policy, and own-row would be the wrong rule for it regardless -- an audit log
-- is admin-only, and it may not even carry a user_id column to key on.

do $$
declare
  t text;
  remaining int;
begin
  foreach t in array array['practice_answers', 'practice_attempts']
  loop
    select count(*) into remaining
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = t
      and p.cmd in ('SELECT', 'ALL');

    if remaining = 0 then
      raise notice 'NO SELECT POLICY LEFT on % -- creating own-row rule', t;
      execute format(
        'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
        t || '_select_own', t
      );
    else
      raise notice 'OK: % still has % SELECT/ALL polic(ies)', t, remaining;
    end if;
  end loop;
end $$;
