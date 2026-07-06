-- Row Level Security — the real enforcement mechanism (not just route guards).
-- Model: v1 merges Teacher/Admin, but access is scoped through group ownership
-- (groups.owner_id) so it splits cleanly later. Students see only their own rows;
-- teachers see/write only data for groups they own.
--
-- Helper functions are SECURITY DEFINER so they read profiles/groups WITHOUT
-- triggering the very RLS policies that call them (avoids infinite recursion).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) in ('TEACHER', 'ADMIN'),
    false
  );
$$;

create or replace function owns_group(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from groups g where g.id = gid and g.owner_id = auth.uid()
  );
$$;

-- True when the current teacher owns the group the given student belongs to.
create or replace function teaches_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join groups g on g.id = p.group_id
    where p.id = sid and g.owner_id = auth.uid()
  );
$$;

-- True when the current user is a student member of the given group.
create or replace function in_group(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.group_id = gid
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table profiles                  enable row level security;
alter table groups                    enable row level security;
alter table textbooks                 enable row level security;
alter table units                     enable row level security;
alter table lessons                   enable row level security;
alter table topics                    enable row level security;
alter table tasks                     enable row level security;
alter table task_topics               enable row level security;
alter table questions                 enable row level security;
alter table assignments               enable row level security;
alter table student_task_overrides    enable row level security;
alter table tests                     enable row level security;
alter table test_items                enable row level security;
alter table vocabulary_sets           enable row level security;
alter table vocabulary_items          enable row level security;
alter table vocab_item_topics         enable row level security;
alter table student_vocab_item_state  enable row level security;
alter table attempts                  enable row level security;
alter table attempt_answers           enable row level security;
alter table results                   enable row level security;
alter table result_skill_scores       enable row level security;
alter table result_topics             enable row level security;
alter table badges                    enable row level security;
alter table badge_unlocks             enable row level security;
alter table points_ledger             enable row level security;
alter table streaks                   enable row level security;
alter table weekly_challenges         enable row level security;
alter table feedback                  enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- A student reads their own profile; a teacher reads profiles of students in a
-- group they own (teaches_student). Intentionally narrow: there is no
-- "browse/assign ungrouped students" flow yet. When one is built, add a
-- deliberate clause here (e.g. is_teacher() AND that student is ungrouped)
-- rather than widening this to "every teacher sees every student".
create policy profiles_select on profiles for select
  using (id = auth.uid() or teaches_student(id));
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_teacher_update on profiles for update
  using (teaches_student(id)) with check (teaches_student(id));

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------

create policy groups_select on groups for select
  using (owner_id = auth.uid() or in_group(id));
create policy groups_insert on groups for insert
  with check (is_teacher() and owner_id = auth.uid());
create policy groups_update on groups for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_delete on groups for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Content tables: readable by any authenticated user, writable by teachers.
-- NOTE: per-assignment read gating (students see only assigned/unlocked content)
-- is enforced at the query layer for v1 — see known gaps. RLS guarantees only
-- teachers can write content and only logged-in users can read it.
-- ---------------------------------------------------------------------------

-- textbooks
create policy textbooks_select on textbooks for select using (auth.uid() is not null);
create policy textbooks_write  on textbooks for all using (is_teacher()) with check (is_teacher());
-- units
create policy units_select on units for select using (auth.uid() is not null);
create policy units_write  on units for all using (is_teacher()) with check (is_teacher());
-- lessons
create policy lessons_select on lessons for select using (auth.uid() is not null);
create policy lessons_write  on lessons for all using (is_teacher()) with check (is_teacher());
-- topics
create policy topics_select on topics for select using (auth.uid() is not null);
create policy topics_write  on topics for all using (is_teacher()) with check (is_teacher());
-- tasks
create policy tasks_select on tasks for select using (auth.uid() is not null);
create policy tasks_write  on tasks for all using (is_teacher()) with check (is_teacher());
-- task_topics
create policy task_topics_select on task_topics for select using (auth.uid() is not null);
create policy task_topics_write  on task_topics for all using (is_teacher()) with check (is_teacher());
-- questions
create policy questions_select on questions for select using (auth.uid() is not null);
create policy questions_write  on questions for all using (is_teacher()) with check (is_teacher());
-- tests
create policy tests_select on tests for select using (auth.uid() is not null);
create policy tests_write  on tests for all using (is_teacher()) with check (is_teacher());
-- test_items
create policy test_items_select on test_items for select using (auth.uid() is not null);
create policy test_items_write  on test_items for all using (is_teacher()) with check (is_teacher());
-- vocabulary_sets
create policy vocab_sets_select on vocabulary_sets for select using (auth.uid() is not null);
create policy vocab_sets_write  on vocabulary_sets for all using (is_teacher()) with check (is_teacher());
-- vocabulary_items
create policy vocab_items_select on vocabulary_items for select using (auth.uid() is not null);
create policy vocab_items_write  on vocabulary_items for all using (is_teacher()) with check (is_teacher());
-- vocab_item_topics
create policy vocab_item_topics_select on vocab_item_topics for select using (auth.uid() is not null);
create policy vocab_item_topics_write  on vocab_item_topics for all using (is_teacher()) with check (is_teacher());
-- badges (catalog)
create policy badges_select on badges for select using (auth.uid() is not null);
create policy badges_write  on badges for all using (is_teacher()) with check (is_teacher());

-- ---------------------------------------------------------------------------
-- assignments & overrides
-- ---------------------------------------------------------------------------

create policy assignments_select on assignments for select
  using (owns_group(group_id) or in_group(group_id));
create policy assignments_write on assignments for all
  using (owns_group(group_id)) with check (owns_group(group_id));

create policy overrides_select on student_task_overrides for select
  using (student_id = auth.uid() or teaches_student(student_id));
create policy overrides_write on student_task_overrides for all
  using (teaches_student(student_id)) with check (teaches_student(student_id));

-- ---------------------------------------------------------------------------
-- Student-owned activity: student reads/writes own rows; teacher reads owned
-- students'. Derived scoring rows (results/skill scores/topics/points/badges/
-- streaks) are READ by student+teacher but WRITTEN by the service role only
-- (grading runs server-side) — no anon/authenticated write policy = denied.
-- ---------------------------------------------------------------------------

-- attempts: student may create + read own; teacher reads owned students'.
create policy attempts_select on attempts for select
  using (student_id = auth.uid() or teaches_student(student_id));
create policy attempts_insert on attempts for insert
  with check (student_id = auth.uid());
create policy attempts_update on attempts for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- attempt_answers: scoped through the parent attempt.
create policy attempt_answers_select on attempt_answers for select
  using (exists (
    select 1 from attempts a where a.id = attempt_id
      and (a.student_id = auth.uid() or teaches_student(a.student_id))
  ));
create policy attempt_answers_insert on attempt_answers for insert
  with check (exists (
    select 1 from attempts a where a.id = attempt_id and a.student_id = auth.uid()
  ));
create policy attempt_answers_update on attempt_answers for update
  using (exists (
    select 1 from attempts a where a.id = attempt_id and a.student_id = auth.uid()
  ));

-- results (read-only to clients; written by service role)
create policy results_select on results for select
  using (student_id = auth.uid() or teaches_student(student_id));

create policy result_skill_scores_select on result_skill_scores for select
  using (exists (
    select 1 from results r where r.id = result_id
      and (r.student_id = auth.uid() or teaches_student(r.student_id))
  ));

create policy result_topics_select on result_topics for select
  using (exists (
    select 1 from results r where r.id = result_id
      and (r.student_id = auth.uid() or teaches_student(r.student_id))
  ));

-- vocabulary state: student reads/writes own; teacher reads owned students'.
create policy svis_select on student_vocab_item_state for select
  using (student_id = auth.uid() or teaches_student(student_id));
create policy svis_insert on student_vocab_item_state for insert
  with check (student_id = auth.uid());
create policy svis_update on student_vocab_item_state for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- badges/points/streak unlocks: read-only to clients; written by service role.
create policy badge_unlocks_select on badge_unlocks for select
  using (student_id = auth.uid() or teaches_student(student_id));
create policy points_ledger_select on points_ledger for select
  using (student_id = auth.uid() or teaches_student(student_id));
create policy streaks_select on streaks for select
  using (student_id = auth.uid() or teaches_student(student_id));

-- ---------------------------------------------------------------------------
-- weekly_challenges & feedback
-- ---------------------------------------------------------------------------

create policy challenges_select on weekly_challenges for select
  using (group_id is null or in_group(group_id) or owns_group(group_id));
create policy challenges_write on weekly_challenges for all
  using (owns_group(group_id)) with check (owns_group(group_id));

create policy feedback_select on feedback for select
  using (student_id = auth.uid() or teaches_student(student_id) or author_id = auth.uid());
create policy feedback_insert on feedback for insert
  with check (is_teacher() and author_id = auth.uid() and teaches_student(student_id));
create policy feedback_update on feedback for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
