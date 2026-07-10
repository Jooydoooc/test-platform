-- Demo test with real questions, so a share link (/t/<token>) exercises the full
-- flow: single attempt, countdown, server grading, EXP. Idempotent: re-running
-- is a no-op once the demo test exists. created_by points at a real teacher/
-- admin profile (falls back to any profile) to satisfy the FK.

do $$
declare
  owner_id uuid;
  grp_id   uuid;
  task_id  uuid;
  test_id  uuid;
begin
  if exists (select 1 from tests where title = 'Demo Test — Present Simple') then
    return;
  end if;

  select id into owner_id from profiles
    where role in ('TEACHER', 'ADMIN') order by created_at limit 1;
  if owner_id is null then
    select id into owner_id from profiles order by created_at limit 1;
  end if;
  if owner_id is null then
    raise notice 'No profiles exist yet; skipping demo test seed.';
    return;
  end if;

  -- Optional group scoping: attach to the owner's group if they have one.
  select group_id into grp_id from profiles where id = owner_id;

  insert into tasks (title, category, skill_area, instructions, created_by)
    values ('Demo — Present Simple', 'TEST', 'GRAMMAR',
            'Choose the correct option.', owner_id)
    returning id into task_id;

  insert into questions ("order", task_id, format, skill_area, prompt, content, answer_key, points)
  values
    (0, task_id, 'MULTIPLE_CHOICE_SINGLE', 'GRAMMAR',
     'She ___ to school every day.',
     '{"choices":[{"id":"a","text":"go"},{"id":"b","text":"goes"},{"id":"c","text":"going"}]}',
     '{"correct":["b"]}', 1),
    (1, task_id, 'MULTIPLE_CHOICE_SINGLE', 'GRAMMAR',
     'They ___ football on Sundays.',
     '{"choices":[{"id":"a","text":"play"},{"id":"b","text":"plays"},{"id":"c","text":"playing"}]}',
     '{"correct":["a"]}', 1),
    (2, task_id, 'MULTIPLE_CHOICE_SINGLE', 'GRAMMAR',
     'I ___ coffee in the morning.',
     '{"choices":[{"id":"a","text":"drinks"},{"id":"b","text":"drinking"},{"id":"c","text":"drink"}]}',
     '{"correct":["c"]}', 1),
    (3, task_id, 'MULTIPLE_CHOICE_SINGLE', 'GRAMMAR',
     'He ___ not like tea.',
     '{"choices":[{"id":"a","text":"do"},{"id":"b","text":"does"},{"id":"c","text":"is"}]}',
     '{"correct":["b"]}', 1),
    (4, task_id, 'TRUE_FALSE', 'GRAMMAR',
     '"We goes home" is correct.',
     '{"choices":[{"id":"true","text":"True"},{"id":"false","text":"False"}]}',
     '{"correct":["false"]}', 1);

  insert into tests (title, description, skill_scope, purpose, level, group_id, created_by, time_limit_sec)
    values ('Demo Test — Present Simple',
            'A short 5-question grammar test to demo shared links and EXP.',
            'GRAMMAR', 'CUSTOM', 'ELEMENTARY', grp_id, owner_id, 300)
    returning id into test_id;

  insert into test_items (test_id, task_id, "order") values (test_id, task_id, 0);
end $$;
