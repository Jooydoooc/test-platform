-- Lexora schema — canonical entities per CLAUDE_RULES.md + the V2 spec docs.
-- Ported from server/prisma/schema.prisma and adapted for Supabase:
--   * Identity rides on Supabase auth.users; `profiles` (PK = auth uid) is the
--     app-facing user record (the request's `users` table).
--   * groups.owner_id (teacher owner) is added so "teachers only touch groups
--     they own" RLS is real and future-splittable (see 0002_rls.sql).
-- Locked definitions this schema enforces:
--   * Per-skill, never blended: scoring lives in result_skill_scores (one row per skill).
--   * Content created ONCE, assigned to MANY groups (assignments join).
--   * Access is group-level with additive per-student overrides.
--   * Group moves preserve history (attempts/results/streaks reference the user, not the group).
--   * Tunable thresholds live in app config, NOT here.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Teacher and Admin merged for v1 but kept distinct so the role can split later
-- without a data migration. Permission checks read the role (see RLS helpers).
create type role as enum ('STUDENT', 'TEACHER', 'ADMIN');

create type level as enum (
  'BEGINNER', 'ELEMENTARY', 'PRE_IELTS', 'IELTS_INTRODUCTION', 'IELTS_GRADUATION'
);

-- All six skills are first-class and treated equally in progress/trends/ranking.
create type skill_area as enum (
  'GRAMMAR', 'VOCABULARY', 'READING', 'LISTENING', 'WRITING', 'SPEAKING'
);

create type task_category as enum (
  'PRACTICE',        -- untimed, retakeable, does NOT affect rank
  'HOMEWORK',        -- assigned, has due context
  'TEST',            -- timed, scored, single-attempt by default, feeds rank
  'EXTRA_PRACTICE'   -- optional, self-directed, always available
);

create type question_format as enum (
  'MULTIPLE_CHOICE_SINGLE',
  'MULTIPLE_CHOICE_MULTI',
  'GAP_FILL',
  'MATCHING',
  'REORDERING',
  'TRANSLATION_UZ_EN',      -- fuzzy/keyword match; low-confidence queued for teacher check
  'VOCAB_EXAMPLE_SENTENCE', -- auto, word-usage, keyword+pattern
  'WRITING_SENTENCE',       -- AI-graded, grammar accuracy
  'WRITING_EXTENDED',       -- AI-graded essay/paragraph
  'SPEAKING_AUDIO',         -- AI-graded, requires audio infra
  'SHORT_ANSWER',
  'TRUE_FALSE'
);

-- Two independent test dimensions: skill scope + purpose (always one of each).
create type test_skill_scope as enum (
  'GRAMMAR', 'VOCABULARY', 'READING', 'LISTENING', 'MIXED'
);

create type test_purpose as enum (
  'UNIT', 'MONTHLY',
  'PLACEMENT', -- excluded from ranking, streaks, progress trends (diagnostic)
  'CUSTOM'
);

-- Per-student-per-item vocabulary state machine (NOT full SRS). Thresholds in config.
create type vocab_state as enum (
  'NEW',       -- unpracticed
  'LEARNING',  -- < 3 correct
  'REVIEWED',  -- 3+ correct, not yet mastered
  'MASTERED',  -- 3 consecutive correct across >= 2 separate sessions
  'WEAK'       -- last attempt wrong OR < 60% over last 5 (mastered can regress)
);

-- Auto-graded sections finalize immediately; Writing/Speaking stay PENDING_REVIEW
-- until AI scoring completes — never show an incomplete score as final.
create type result_status as enum ('COMPLETED', 'PENDING_REVIEW');

create type assignment_status as enum ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED');

-- ---------------------------------------------------------------------------
-- Identity & grouping
-- ---------------------------------------------------------------------------

create table profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  role           role not null default 'STUDENT',
  first_name     text not null default '',
  last_name      text not null default '',
  group_id       uuid,                 -- students belong to at most one group; teachers none
  last_active_at timestamptz,          -- drives "active" window + falling-behind flag
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  level      level not null,
  owner_id   uuid references profiles (id) on delete set null, -- teacher owner
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_group_fk
  foreign key (group_id) references groups (id) on delete set null;

create index profiles_group_idx on profiles (group_id);
create index profiles_role_idx on profiles (role);
create index groups_level_idx on groups (level);
create index groups_owner_idx on groups (owner_id);

-- ---------------------------------------------------------------------------
-- Textbook hierarchy: Book -> Unit -> Lesson (optional) -> Topic (reusable tag)
-- ---------------------------------------------------------------------------

create table textbooks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  level      level,
  created_at timestamptz not null default now()
);

create table units (
  id          uuid primary key default gen_random_uuid(),
  textbook_id uuid not null references textbooks (id) on delete cascade,
  title       text not null,
  "order"     int not null default 0
);
create index units_textbook_idx on units (textbook_id);

-- Lesson is OPTIONAL — some books skip it.
create table lessons (
  id      uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id) on delete cascade,
  title   text not null,
  "order" int not null default 0
);
create index lessons_unit_idx on lessons (unit_id);

-- Topic is a reusable cross-book tag shared by tasks AND vocabulary items.
-- Enables topic-level weak-area tracking (sharper than skill-level).
create table topics (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- ---------------------------------------------------------------------------
-- Content: Task (created once) + Questions. Tests reuse the same content.
-- ---------------------------------------------------------------------------

create table tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      task_category not null,
  skill_area    skill_area not null,
  unit_id       uuid references units (id) on delete set null,   -- optional placement
  lesson_id     uuid references lessons (id) on delete set null,
  instructions  text,          -- shown to students
  teacher_notes text,          -- teacher-only (MUST stay separate from instructions)
  time_limit_sec int,          -- for TEST/HOMEWORK timed contexts (null = untimed)
  created_by    uuid not null references profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tasks_category_idx on tasks (category);
create index tasks_skill_idx on tasks (skill_area);
create index tasks_unit_idx on tasks (unit_id);

create table task_topics (
  task_id  uuid not null references tasks (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  primary key (task_id, topic_id)
);

create table questions (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks (id) on delete cascade,
  "order"    int not null default 0,
  format     question_format not null,
  skill_area skill_area not null,
  prompt     text not null,
  content    jsonb not null default '{}',  -- options/pairs/media refs
  answer_key jsonb not null default '{}',  -- auto: accepted answers; AI: scoring rubric
  points     int not null default 1
);
create index questions_task_idx on questions (task_id);

-- ---------------------------------------------------------------------------
-- Assignment: one content item -> many groups, additive per-student overrides
-- ---------------------------------------------------------------------------

create table assignments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks (id) on delete cascade,
  group_id    uuid not null references groups (id) on delete cascade,
  status      assignment_status not null default 'ASSIGNED',
  due_at      timestamptz,   -- homework due context
  assigned_at timestamptz not null default now(),
  unique (task_id, group_id)
);
create index assignments_group_idx on assignments (group_id);

-- Additive per-student grants (grant EXTRA content; never restrict below baseline).
create table student_task_overrides (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  task_id    uuid not null references tasks (id) on delete cascade,
  granted_at timestamptz not null default now(),
  unique (student_id, task_id)
);
create index student_task_overrides_student_idx on student_task_overrides (student_id);

-- ---------------------------------------------------------------------------
-- Tests: reuse Task/Question content in a timed, scored context.
-- Classified by TWO independent dimensions: skill scope + purpose.
-- ---------------------------------------------------------------------------

create table tests (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text not null default '',
  skill_scope    test_skill_scope not null default 'MIXED',
  purpose        test_purpose not null default 'CUSTOM',
  level          level,
  group_id       uuid references groups (id) on delete set null, -- not required for PLACEMENT
  time_limit_sec int,
  created_by     uuid not null references profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tests_group_idx on tests (group_id);

-- Ordered inclusion of reusable Tasks into a Test (content reuse, not duplication).
create table test_items (
  id      uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests (id) on delete cascade,
  task_id uuid not null references tasks (id),
  "order" int not null default 0,
  unique (test_id, task_id)
);
create index test_items_test_idx on test_items (test_id);

-- ---------------------------------------------------------------------------
-- Vocabulary: Set (assignable, created once) -> Item -> per-student state
-- ---------------------------------------------------------------------------

create table vocabulary_sets (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  level      level,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table vocabulary_items (
  id               uuid primary key default gen_random_uuid(),
  set_id           uuid not null references vocabulary_sets (id) on delete cascade,
  word             text not null,
  meaning_en       text not null,
  translation_uz   text not null default '',
  synonym          text,
  example_sentence text,
  collocation      text,
  pronunciation    text,  -- IPA by default
  audio_url        text,  -- optional
  word_form        text
);
create index vocabulary_items_set_idx on vocabulary_items (set_id);

create table vocab_item_topics (
  item_id  uuid not null references vocabulary_items (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  primary key (item_id, topic_id)
);

-- Per-student-per-item tracking (recall accuracy per word), NOT set completed/not.
create table student_vocab_item_state (
  id                        uuid primary key default gen_random_uuid(),
  student_id                uuid not null references profiles (id) on delete cascade,
  item_id                   uuid not null references vocabulary_items (id) on delete cascade,
  state                     vocab_state not null default 'NEW',
  consecutive_correct       int not null default 0,
  distinct_sessions_correct int not null default 0,
  total_attempts            int not null default 0,
  correct_attempts          int not null default 0,
  last_five_outcomes        boolean[] not null default '{}',
  last_attempt_at           timestamptz,
  updated_at                timestamptz not null default now(),
  unique (student_id, item_id)
);
create index svis_student_state_idx on student_vocab_item_state (student_id, state);

-- ---------------------------------------------------------------------------
-- Attempts & Results: scored PER SKILL, never blended
-- ---------------------------------------------------------------------------

create table attempts (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references profiles (id) on delete cascade,
  -- An attempt is against a Task (practice/homework) OR a Test — exactly one.
  task_id      uuid references tasks (id),
  test_id      uuid references tests (id),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  constraint attempts_target_ck check (num_nonnulls(task_id, test_id) = 1)
);
create index attempts_student_idx on attempts (student_id);
create index attempts_task_idx on attempts (task_id);
create index attempts_test_idx on attempts (test_id);

create table attempt_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references attempts (id) on delete cascade,
  question_id         uuid not null references questions (id),
  response            jsonb not null default '{}', -- raw answer (text, ids, audio ref)
  is_correct          boolean,   -- null while pending AI review
  awarded_points      int not null default 0,
  needs_teacher_check boolean not null default false, -- fuzzy/low-confidence flag
  ai_feedback         text,
  unique (attempt_id, question_id)
);
create index attempt_answers_attempt_idx on attempt_answers (attempt_id);

create table results (
  id                     uuid primary key default gen_random_uuid(),
  attempt_id             uuid not null unique references attempts (id) on delete cascade,
  student_id             uuid not null references profiles (id) on delete cascade,
  status                 result_status not null default 'COMPLETED',
  excluded_from_progress boolean not null default false, -- true for PLACEMENT tests
  created_at             timestamptz not null default now()
);
create index results_student_created_idx on results (student_id, created_at);

-- Per-skill breakdown of a single result (a mixed test has several rows).
create table result_skill_scores (
  id            uuid primary key default gen_random_uuid(),
  result_id     uuid not null references results (id) on delete cascade,
  skill_area    skill_area not null,
  correct_count int not null,
  total_count   int not null,
  accuracy      double precision not null, -- fraction 0..1; percentage at read time
  unique (result_id, skill_area)
);

-- Mistakes link to Topic (not just skill) so weak-area tracking is topic-level.
create table result_topics (
  id         uuid primary key default gen_random_uuid(),
  result_id  uuid not null references results (id) on delete cascade,
  topic_id   uuid not null references topics (id),
  miss_count int not null default 0,
  unique (result_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Motivation layer (config-driven): Badges, Points, Streak, Challenges, Feedback
-- ---------------------------------------------------------------------------

-- Generic milestone-unlock pattern so new badges need no one-off logic.
create table badges (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,   -- stable identifier referenced by config
  name        text not null,
  description text not null default '',
  skill_area  skill_area,             -- null = cross-skill (streak, most-improved, ...)
  threshold   int not null            -- count within skill/activity type that unlocks
);

create table badge_unlocks (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references profiles (id) on delete cascade,
  badge_id    uuid not null references badges (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (student_id, badge_id)
);
create index badge_unlocks_student_idx on badge_unlocks (student_id);

-- Append-only points ledger. Anti-gaming: unique_key enforces "awarded once per
-- unique meaningful action" (re-reviewing/re-practising mastered gives no points).
create table points_ledger (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  reason     text not null,        -- maps to a configured point-value key
  points     int not null,
  unique_key text,                 -- dedupe key for once-per-action actions
  created_at timestamptz not null default now(),
  unique (student_id, unique_key)
);
create index points_ledger_student_created_idx on points_ledger (student_id, created_at);

-- Streak counts SCHEDULED-SESSION days (odd/even schedule), NOT calendar days.
create table streaks (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null unique references profiles (id) on delete cascade,
  current_length   int not null default 0,
  longest_length   int not null default 0,
  last_session_day date,
  updated_at       timestamptz not null default now()
);

-- System-generated from a rotating template pool by default; teacher can override.
create table weekly_challenges (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references groups (id) on delete cascade,
  template_key text not null,
  title        text not null,
  description  text not null default '',
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  created_at   timestamptz not null default now()
);
create index weekly_challenges_group_idx on weekly_challenges (group_id);

-- Short comments attached to a specific test/task result (v1 feedback), not essays.
create table feedback (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  author_id  uuid not null references profiles (id),
  result_id  uuid references results (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index feedback_student_created_idx on feedback (student_id, created_at);

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile row when a Supabase auth user is created.
-- Role/name default to student + auth metadata; a teacher promotes accounts later.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    'STUDENT'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
