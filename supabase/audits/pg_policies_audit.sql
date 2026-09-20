-- ===========================================================================
-- FULL RLS / EXPOSURE AUDIT  —  public schema
-- ===========================================================================
-- Paste the whole file into the Supabase SQL editor and run it. READ ONLY:
-- it selects from catalogs and writes nothing.
--
-- It returns ONE result set on purpose. The SQL editor shows only the last
-- statement's output, so four separate queries would mean four round trips.
--
-- WHY POLICIES ALONE ARE NOT THE ANSWER
-- Three independent things decide whether anon can read a table, and checking
-- only the first has already missed real exposure on this project:
--
--   1. Is RLS enabled?  RLS OFF means policies are not consulted AT ALL.
--      A table with perfect policies and RLS off is wide open.
--   2. Is there a GRANT?  RLS filters rows; the grant decides whether the role
--      may touch the table in the first place. No grant = no access, whatever
--      the policies say.
--   3. What do the policies say?  Permissive policies OR together, so a single
--      policy with qual `true` defeats every careful policy beside it.
--
-- Section 4 covers functions, because Supabase grants EXECUTE on new functions
-- to anon BY NAME through DEFAULT PRIVILEGES — `revoke ... from public` closes
-- nothing. Four functions shipped callable by anon here before that was known.
-- ===========================================================================

-- 1. Every table: is RLS on, is it forced, how many policies does it have.
--    Read the "RLS DISABLED" rows first.
select
  '1 TABLE' as section,
  c.relname::text as object,
  case
    when not c.relrowsecurity then '*** RLS DISABLED ***'
    when c.relforcerowsecurity then 'RLS on (forced)'
    else 'RLS on'
  end as detail_a,
  (select count(*)::text from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) || ' policies' as detail_b,
  case
    when not c.relrowsecurity then 'anyone with a grant reads everything'
    when (select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname) = 0
      then 'RLS on with NO policies = denies all (except table owner)'
    else ''
  end as detail_c,
  '' as detail_d
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'

union all

-- 2. Every policy, in full. `qual` is the USING clause, `with_check` the
--    WITH CHECK clause. A qual of `true` on a permissive policy means the
--    whole table is readable by whatever roles the policy names.
select
  '2 POLICY',
  p.tablename::text,
  p.policyname::text,
  p.cmd::text || ' / ' || p.permissive::text || ' / roles=' || array_to_string(p.roles, ','),
  'USING: ' || coalesce(p.qual, '(none)'),
  'CHECK: ' || coalesce(p.with_check, '(none)')
from pg_policies p
where p.schemaname = 'public'

union all

-- 3. Table-level grants to the roles that matter. A table with no row here for
--    `anon` cannot be read by an anonymous visitor regardless of its policies.
select
  '3 GRANT',
  g.table_name::text,
  g.grantee::text,
  string_agg(g.privilege_type, ', ' order by g.privilege_type),
  '',
  ''
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.grantee in ('anon', 'authenticated', 'PUBLIC')
group by g.table_name, g.grantee

union all

-- 4. Functions anon can execute. Anything listed with anon= here is callable
--    by an anonymous visitor holding the publishable anon key.
select
  '4 FUNCTION',
  p.proname::text,
  coalesce(array_to_string(p.proacl, ' | '), 'DEFAULT ACL (inherits — check default privileges)'),
  case when p.prosecdef then 'SECURITY DEFINER' else 'security invoker' end,
  coalesce(pg_get_function_identity_arguments(p.oid), ''),
  ''
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

order by 1, 2, 3;
