-- notify_me(): let a student's own app write a notification for that student.
--
-- WHY THIS EXISTS
-- The three in-app triggers (practice streak, study reminder, weekly report)
-- could only ever raise a popup. If it was missed, it was gone -- nothing
-- reached the notifications list, because the client has no insert path into
-- public.notifications and should not be given one. A blanket INSERT policy on
-- that table would let any authenticated user write a notification addressed to
-- anyone, or a broadcast addressed to everyone.
--
-- This is the narrow alternative: a SECURITY DEFINER function that can write
-- exactly one shape of row -- a personal notification, for the caller, of a
-- known type. The caller never names the recipient; auth.uid() does.
--
-- DEDUPE IS PART OF THE CONTRACT, NOT A CONVENIENCE
-- Every caller is a trigger that fires on app open. "You are on a 6 day streak"
-- must not produce a row each time the app is opened that day. Rather than have
-- three callers each invent their own guard, the window lives here: pass
-- p_dedupe_hours and a row of the same type inside that window means nothing is
-- written and null comes back. Callers treat null as "already handled".

create or replace function public.notify_me(
  p_type         text,
  p_title        text,
  p_message      text,
  p_action_url   text default null,
  p_dedupe_hours int  default 0
)
returns table (id uuid, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_cols   text := 'user_id, title, message, type, action_url';
  v_vals   text;
  v_type   text;
begin
  -- SECURITY DEFINER runs as the owner, so RLS is bypassed. Every guard that
  -- would normally be a policy has to be written out here instead.
  if v_user is null then
    raise exception 'notify_me: no authenticated user';
  end if;
  -- `notifications.type` may be text or an enum; the base schema is not in this
  -- repository, so neither can be assumed. Passing a text parameter into an enum
  -- column fails without a cast, and comparing them fails too. Reading the
  -- column's actual type and casting to it works for both, and turns a migration
  -- that errors on a wrong guess into one that simply runs.
  select c.udt_name into v_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'notifications'
    and c.column_name  = 'type';

  if v_type is null then
    raise exception 'notify_me: public.notifications has no "type" column';
  end if;

  v_vals := '$1, $2, $3, $4::' || quote_ident(v_type) || ', $5';


  -- An allow-list, mirroring the five preference categories the client knows
  -- how to render. An unknown type would show with a default icon and be
  -- governed by no toggle, which is a notification the student cannot turn off.
  if p_type is null or p_type not in (
    'study_reminder', 'practice_streak', 'material_update',
    'weekly_report',  'activity_update'
  ) then
    raise exception 'notify_me: unknown type %', p_type;
  end if;

  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    raise exception 'notify_me: title and message are required';
  end if;

  -- Same window, same type, same person -> already handled.
  if p_dedupe_hours > 0 and exists (
    select 1
    from public.notifications n
    where n.user_id = v_user
      -- Cast to text rather than the column's own type: this comparison only
      -- needs the two to be the same string, and ::text is valid for both.
      and n.type::text = p_type
      and n.created_at > now() - make_interval(hours => p_dedupe_hours)
  ) then
    return;
  end if;

  -- The base schema is not in this repository, so which optional columns exist
  -- cannot be assumed. Two of them decide whether the row is VISIBLE at all:
  -- fetchNotifications() requires `is_published` to be null or true, so a
  -- column defaulting to false would silently write invisible rows. Setting
  -- them explicitly when present is the difference between this working and
  -- appearing to work.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'is_published'
  ) then
    v_cols := v_cols || ', is_published';
    v_vals := v_vals || ', true';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'is_read'
  ) then
    v_cols := v_cols || ', is_read';
    v_vals := v_vals || ', false';
  end if;

  return query execute format(
    'insert into public.notifications (%s) values (%s) returning id, created_at',
    v_cols, v_vals
  ) using v_user, p_title, p_message, p_type, p_action_url;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon, authenticated and
-- service_role BY NAME through DEFAULT PRIVILEGES, so `revoke ... from public`
-- closes nothing on its own. Four functions shipped callable by anon in this
-- project before that was understood. anon must be named explicitly.
revoke execute on function public.notify_me(text, text, text, text, int)
  from public, anon;

grant execute on function public.notify_me(text, text, text, text, int)
  to authenticated;

-- Supports the dedupe lookup above, which runs on every app open.
create index if not exists notifications_user_type_created_idx
  on public.notifications (user_id, type, created_at desc);
