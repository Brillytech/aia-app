-- Backend hardening: username case-collisions and per-user notification reads.
--
-- Both fix defects the app could only ever paper over from the client. See the
-- notes on each block for what was wrong and why the fix lives here.


-- ---------------------------------------------------------------------------
-- 1. Case-insensitive usernames
-- ---------------------------------------------------------------------------
-- `profiles_username_key` already enforces uniqueness, but on the raw column —
-- so "Ade" and "ade" are two different handles as far as Postgres is
-- concerned. The app's availability check is case-insensitive, which means the
-- app is currently stricter than the database: two people racing to claim the
-- same name in different cases both pass the constraint.
--
-- Partial rather than plain: `username` is nullable and two rows currently
-- hold null or blank. A plain index on lower(username) would treat '' as a
-- real value and reject the second blank row.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null and btrim(username) <> '';


-- ---------------------------------------------------------------------------
-- 2. Per-user read state for broadcast notifications
-- ---------------------------------------------------------------------------
-- Notifications with a null `user_id` are one row shared by every student, so
-- `notifications.is_read` on those rows is global: one person opening an
-- announcement marked it read for everybody, and "mark all read" did it to
-- every announcement at once.
--
-- Read state for a shared row cannot live on that row. It belongs in a join
-- table keyed by (user, notification), which is what this is. The client is
-- currently holding this in AsyncStorage as a stopgap; this replaces it with
-- something that survives a reinstall and follows the user across devices.
create table if not exists public.notification_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

-- The screen always asks "which of these ids has this user read", so the
-- primary key's leading user_id column already serves it. This second index
-- serves the reverse question — "who has read this announcement" — which the
-- admin side will want for delivery stats.
create index if not exists notification_reads_notification_idx
  on public.notification_reads (notification_id);

alter table public.notification_reads enable row level security;

-- Every other table in this database has RLS with policies; this one matches.
-- A read receipt is only ever the acting user's own, so all three policies
-- pin user_id to auth.uid() — nobody can read, forge, or clear anyone else's.
drop policy if exists "notification_reads_select_own" on public.notification_reads;
create policy "notification_reads_select_own"
  on public.notification_reads for select
  using (auth.uid() = user_id);

drop policy if exists "notification_reads_insert_own" on public.notification_reads;
create policy "notification_reads_insert_own"
  on public.notification_reads for insert
  with check (auth.uid() = user_id);

drop policy if exists "notification_reads_delete_own" on public.notification_reads;
create policy "notification_reads_delete_own"
  on public.notification_reads for delete
  using (auth.uid() = user_id);
