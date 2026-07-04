-- Dev-only seed (fallback data), NOT production behavior.
-- Runs with `supabase db reset` locally. Creates two auth users, a group, and a
-- little content so the app isn't empty. Idempotent: safe to re-run.
--
-- Demo logins:  teacher@lexora.dev / lexora123   ·   student@lexora.dev / lexora123

create extension if not exists pgcrypto;

do $$
declare
  teacher_id uuid := '00000000-0000-4000-8000-000000000001';
  student_id uuid := '00000000-0000-4000-8000-000000000002';
  grp_id     uuid;
  task_id    uuid;
  topic_id   uuid;
begin
  -- ---- auth users (local dev only) ------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', teacher_id, 'authenticated', 'authenticated',
     'teacher@lexora.dev', crypt('lexora123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}',
     '{"first_name":"Tara","last_name":"Teacher"}'),
    ('00000000-0000-0000-0000-000000000000', student_id, 'authenticated', 'authenticated',
     'student@lexora.dev', crypt('lexora123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}',
     '{"first_name":"Sam","last_name":"Student"}')
  on conflict (id) do nothing;

  -- The on_auth_user_created trigger creates profiles; set roles/names here.
  update profiles set role = 'TEACHER', first_name = 'Tara', last_name = 'Teacher'
    where id = teacher_id;
  update profiles set role = 'STUDENT', first_name = 'Sam', last_name = 'Student'
    where id = student_id;

  -- ---- group owned by the teacher, student is a member ----------------------
  insert into groups (name, level, owner_id)
    values ('Elementary A', 'ELEMENTARY', teacher_id)
    returning id into grp_id;
  update profiles set group_id = grp_id where id = student_id;

  -- ---- a topic, a task with two questions, and a test ----------------------
  insert into topics (name) values ('Present Simple')
    on conflict (name) do nothing;
  select id into topic_id from topics where name = 'Present Simple';

  insert into tasks (title, category, skill_area, instructions, created_by)
    values ('Present Simple — basics', 'PRACTICE', 'GRAMMAR',
            'Choose the correct option.', teacher_id)
    returning id into task_id;
  insert into task_topics (task_id, topic_id) values (task_id, topic_id);

  insert into questions ("order", task_id, format, skill_area, prompt, content, answer_key, points)
  values
    (0, task_id, 'MULTIPLE_CHOICE_SINGLE', 'GRAMMAR',
     'She ___ to school every day.',
     '{"choices":[{"id":"a","text":"go"},{"id":"b","text":"goes"},{"id":"c","text":"going"}]}',
     '{"correct":["b"]}', 1),
    (1, task_id, 'MULTIPLE_CHOICE_SINGLE', 'GRAMMAR',
     'They ___ football on Sundays.',
     '{"choices":[{"id":"a","text":"play"},{"id":"b","text":"plays"},{"id":"c","text":"plaies"}]}',
     '{"correct":["a"]}', 1);

  insert into tests (title, description, skill_scope, purpose, level, group_id, created_by)
    values ('Elementary Grammar Check', 'A short grammar test.',
            'GRAMMAR', 'UNIT', 'ELEMENTARY', grp_id, teacher_id);

  -- ---- badge catalog (generic milestone unlocks) ---------------------------
  insert into badges (code, name, description, skill_area, threshold) values
    ('grammar_starter',    'Grammar Starter',     'First grammar milestone.',    'GRAMMAR', 1),
    ('vocabulary_builder', 'Vocabulary Builder',  'First vocabulary milestone.', 'VOCABULARY', 1),
    ('reading_climber',    'Reading Climber',     'First reading milestone.',    'READING', 1),
    ('listening_focus',    'Listening Focus',     'First listening milestone.',  'LISTENING', 1),
    ('writing_voice',      'Writing Voice',       'First writing milestone.',    'WRITING', 1),
    ('speaking_confidence','Speaking Confidence', 'First speaking milestone.',   'SPEAKING', 1),
    ('streak_7',           '7-Day Streak',        'Seven scheduled-session days.', null, 7),
    ('unit_master',        'Unit Master',         'Completed every task in a unit.', null, 1)
  on conflict (code) do nothing;
end $$;
