-- Vocabulary QuizShell module (Essential Book 1, Unit 1 onward).
--
-- NOTE: this is a deliberately standalone vocab model, separate from the richer
-- vocabulary_sets/vocabulary_items + attempts/results tables in 0001. It keys
-- words directly to a unit and logs flat per-exercise scores, matching the
-- QuizShell spec. It does NOT feed the per-skill results/ranking pipeline.
--
-- RLS mirrors the existing conventions from 0002_rls.sql:
--   * content (words) is readable by any authenticated user, writable by teachers
--     (per-assignment gating stays at the query layer, as elsewhere);
--   * user_progress is private — each user sees and writes only their own rows.
-- Reuses the is_teacher() SECURITY DEFINER helper defined in 0002_rls.sql.

create table words (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references units (id) on delete cascade,
  word           text not null,
  part_of_speech text,
  definition_en  text not null,
  translation_uz text not null,
  examples       jsonb not null default '[]',  -- array of example sentence strings
  created_at     timestamptz not null default now()
);
create index words_unit_idx on words (unit_id);

create table user_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  unit_id        uuid not null references units (id) on delete cascade,
  -- 'learn' | 'mc_definition' | 'mc_translation_en_uz' | 'mc_translation_uz_en'
  -- | 'sentence_order' | 'mc_filling' | 'sentence_making'
  exercise_type  text not null,
  score          int not null,
  total          int not null,
  attempt_number int not null default 1,
  completed_at   timestamptz not null default now()
);
create index user_progress_user_idx
  on user_progress (user_id, unit_id, exercise_type);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table words         enable row level security;
alter table user_progress enable row level security;

-- words: any signed-in user reads; only teachers write (matches content pattern).
create policy words_select on words for select
  using (auth.uid() is not null);
create policy words_write on words for all
  using (is_teacher()) with check (is_teacher());

-- user_progress: strictly own rows.
create policy user_progress_select on user_progress for select
  using (user_id = auth.uid());
create policy user_progress_insert on user_progress for insert
  with check (user_id = auth.uid());
