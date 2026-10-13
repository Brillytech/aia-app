-- Per-card flashcard scheduling, per student.
--
-- WHY A NEW TABLE
-- `user_progress` is keyed (user_id, course_id, topic_id) and holds one
-- `last_quick_card_rating` for a whole topic. There is no per-card storage
-- anywhere in the schema: card_progress, user_card_progress,
-- flashcard_progress, saved_cards, user_saved_questions and
-- user_question_progress were all probed and none exist. Anki-style
-- scheduling needs a row per card, so this is the smallest thing that can
-- hold it.
--
-- `saved` lives on the same row as the schedule rather than in a table of
-- its own. It is independent of scheduling in behaviour — saving a card
-- never changes when it is next due — but it is the same (student, card)
-- key, so a second table would mean a second round trip and a second sync
-- path for one boolean.
--
-- RUN THIS BY HAND IN THE SQL EDITOR, then run
-- supabase/audits/pg_policies_audit.sql and check this table reports
-- RLS enabled with three owner-scoped policies and no open read.

-- One transaction: the table, its indexes, RLS and every policy land
-- together or not at all. A half-applied run that created the table but
-- not the policies would leave a table with RLS on and no way in.
begin;

create table if not exists public.user_card_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- questions.id is uuid: a uuid filter parses against it and a non-uuid
  -- raises 22P02, which only happens on a uuid column. Verified live.
  question_id uuid not null references public.questions (id) on delete cascade,

  -- The scheduler's four states. Constrained so a bad write fails loudly
  -- here rather than arriving in the app as a card that can never be
  -- scheduled again.
  state text not null default 'new',
  step_index integer not null default 0,

  -- UTC. Null only for a card that has never been answered.
  due timestamptz,

  -- Whole days; 0 until the card graduates out of learning.
  interval_days integer not null default 0,

  -- Percent as an integer: 250 is Anki's 2.50. The scheduler floors it at
  -- 130, and the constraint keeps a bad write from going below that.
  ease integer not null default 250,

  reps integer not null default 0,
  lapses integer not null default 0,

  -- Independent of scheduling. The Saved tab reads this.
  saved boolean not null default false,

  -- The field conflicts resolve on: last write wins, by this.
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (user_id, question_id),

  constraint user_card_progress_state_check
    check (state in ('new', 'learning', 'review', 'relearning')),
  constraint user_card_progress_ease_check
    check (ease >= 130),
  constraint user_card_progress_interval_check
    check (interval_days >= 0),
  constraint user_card_progress_step_check
    check (step_index >= 0)
);

-- The queue's main question is "what is due for me, soonest first". Without
-- this it is a sequential scan of the student's whole collection on every
-- deck open.
create index if not exists user_card_progress_due_idx
  on public.user_card_progress (user_id, due);

-- The Saved tab's filter, kept partial so the index holds only the rows it
-- can ever return.
create index if not exists user_card_progress_saved_idx
  on public.user_card_progress (user_id)
  where saved;

alter table public.user_card_progress enable row level security;

-- Owner-scoped, and nothing else. A student reads and writes their own rows
-- and cannot see that anyone else's exist.
--
-- Separate policies per command rather than one FOR ALL: an UPDATE needs
-- both USING (which rows may be touched) and WITH CHECK (what they may be
-- changed into), and writing them apart makes it obvious that the second is
-- present. Without it a student could move a row onto another user_id.
drop policy if exists "user_card_progress_select_own" on public.user_card_progress;
create policy "user_card_progress_select_own"
  on public.user_card_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_card_progress_insert_own" on public.user_card_progress;
create policy "user_card_progress_insert_own"
  on public.user_card_progress
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_card_progress_update_own" on public.user_card_progress;
create policy "user_card_progress_update_own"
  on public.user_card_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_card_progress_delete_own" on public.user_card_progress;
create policy "user_card_progress_delete_own"
  on public.user_card_progress
  for delete
  using (auth.uid() = user_id);

-- No grant to anon. The table is reachable only with a session, which is
-- what every other student-scoped table in this schema now does after the
-- September lockdown.
revoke all on public.user_card_progress from anon;
grant select, insert, update, delete on public.user_card_progress to authenticated;

commit;
