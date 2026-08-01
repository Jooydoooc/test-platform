-- ---------------------------------------------------------------------------
-- 0031 — Publish gate for tests.
--
-- Uploading a test no longer makes it usable. A test is created UNPUBLISHED and
-- only becomes openable once an admin publishes it. This sits ON TOP of the
-- link gate from 0025 — it does not replace it:
--
--     unpublished  -> cannot be opened, even with a valid share link
--     published    -> still requires the link an admin sends
--
-- Why the RPCs and not just RLS. The token functions from 0025/0026 are
-- SECURITY DEFINER: they bypass row-level security by design, because holding
-- the token IS the authorisation. A policy alone would therefore not stop an
-- unpublished test being opened by anyone holding its link. The check has to
-- live inside the functions, so every one of them is redefined below with the
-- publish condition added and nothing else changed.
--
-- Why the SELECT policies are left alone. `tests_select` / `html_tests_select`
-- stay attempt-based (0025). A student who has already sat a test keeps reading
-- its row even if it is later unpublished, so results, history and the
-- leaderboard do not break retroactively. Unpublishing blocks ENTRY, not the
-- record of what already happened.
--
-- Teachers and admins bypass the gate everywhere, so they can preview a test
-- before publishing it.
--
-- Backfill: every test that exists when this migration runs is marked
-- published, so nothing changes for current students — in-progress attempts and
-- completed results keep working. Only newly created tests start unpublished.
-- The backfill is guarded so re-running this migration never re-publishes
-- anything an admin has since unpublished.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Columns + one-time backfill.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tests' and column_name = 'published'
  ) then
    alter table tests add column published boolean not null default false;
    -- Existing tests were usable before this migration; keep them usable.
    update tests set published = true;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'html_tests' and column_name = 'published'
  ) then
    alter table html_tests add column published boolean not null default false;
    update html_tests set published = true;
  end if;
end $$;

create index if not exists tests_published_idx on tests (published);
create index if not exists html_tests_published_idx on html_tests (published);

-- ---------------------------------------------------------------------------
-- 2. Token resolution — refuse unpublished tests.
--
--    Each function below is byte-identical to its 0025/0026 definition except
--    for the added publish condition. Teachers/admins bypass it.
-- ---------------------------------------------------------------------------

create or replace function resolve_share_test(p_token text)
returns table (
  id             uuid,
  title          text,
  description    text,
  time_limit_sec int
)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.description, t.time_limit_sec
  from tests t
  where auth.uid() is not null
    and t.share_token::text = p_token
    and (t.published or is_teacher());
$$;

create or replace function resolve_share_html_test(p_token text)
returns table (
  id           uuid,
  title        text,
  storage_path text
)
language sql stable security definer set search_path = public as $$
  select h.id, h.title, h.storage_path
  from html_tests h
  where auth.uid() is not null
    and h.share_token::text = p_token
    and (h.published or is_teacher());
$$;

-- answer_key is still deliberately NOT returned — grading stays server-side.
create or replace function share_test_questions(p_token text)
returns table (
  id       uuid,
  "order"  int,
  format   question_format,
  prompt   text,
  content  jsonb,
  points   int
)
language sql stable security definer set search_path = public as $$
  select
    q.id,
    (ti."order" * 1000 + q."order") as "order",
    q.format,
    q.prompt,
    q.content,
    q.points
  from tests t
  join test_items ti on ti.test_id = t.id
  join questions q on q.task_id = ti.task_id
  where auth.uid() is not null
    and t.share_token::text = p_token
    and (t.published or is_teacher())
  order by 2;
$$;

-- ---------------------------------------------------------------------------
-- 3. Attempt creation — refuse unpublished tests.
--
--    This is the important one: minting an attempt is what opens the read
--    policy from 0025, so an unpublished test must not be startable. The
--    refusal reuses P0002 ('Test not found.') deliberately — a student holding
--    a link to an unpublished test learns nothing about whether it exists.
-- ---------------------------------------------------------------------------

create or replace function start_share_attempt(p_token text)
returns table (
  attempt_id     uuid,
  test_id        uuid,
  started_at     timestamptz,
  submitted_at   timestamptz,
  time_limit_sec int
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_test tests%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  select p.role::text into v_role from profiles p where p.id = v_uid;
  if v_role is distinct from 'STUDENT' then
    raise exception 'Only students take tests.' using errcode = '42501';
  end if;

  select * into v_test from tests t where t.share_token::text = p_token;
  if not found then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;

  -- Publish gate (0031). Students only; the role check above already excluded
  -- teachers, so there is no bypass to add here.
  if not v_test.published then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;

  insert into attempts (student_id, test_id)
  values (v_uid, v_test.id)
  on conflict do nothing;

  return query
    select a.id, v_test.id, a.started_at, a.submitted_at, v_test.time_limit_sec
    from attempts a
    where a.student_id = v_uid and a.test_id = v_test.id;
end;
$$;

create or replace function start_share_html_attempt(p_token text)
returns table (
  attempt_id   uuid,
  html_test_id uuid,
  submitted_at timestamptz
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_test html_tests%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  select * into v_test from html_tests h where h.share_token::text = p_token;
  if not found then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;

  select p.role::text into v_role from profiles p where p.id = v_uid;
  if v_role is distinct from 'STUDENT' then
    -- Not an error: teachers/admins may open the link, they just don't get an
    -- attempt (and therefore no score bridge). They may preview unpublished.
    return;
  end if;

  -- Publish gate (0031), students only — same silent-404 shape as above.
  if not v_test.published then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;

  insert into attempts (student_id, html_test_id)
  values (v_uid, v_test.id)
  on conflict do nothing;

  return query
    select a.id, v_test.id, a.submitted_at
    from attempts a
    where a.student_id = v_uid and a.html_test_id = v_test.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Publishing — ADMIN only, through an RPC.
--
--    Deliberately not a table UPDATE grant. `tests_write` is is_teacher(),
--    which includes TEACHER, and publishing is an admin-only action; a column
--    grant would also hand out UPDATE on a table students must never write.
--    Routing it through a SECURITY DEFINER function keeps the check in one
--    place and leaves `authenticated` with no write privilege on tests at all.
-- ---------------------------------------------------------------------------

create or replace function set_test_published(p_test_id uuid, p_published boolean)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text;
begin
  select p.role::text into v_role from profiles p where p.id = auth.uid();
  if v_role is distinct from 'ADMIN' then
    raise exception 'Only admins publish tests.' using errcode = '42501';
  end if;

  update tests set published = p_published, updated_at = now() where id = p_test_id;
  if not found then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;
  return p_published;
end;
$$;

create or replace function set_html_test_published(p_test_id uuid, p_published boolean)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text;
begin
  select p.role::text into v_role from profiles p where p.id = auth.uid();
  if v_role is distinct from 'ADMIN' then
    raise exception 'Only admins publish tests.' using errcode = '42501';
  end if;

  update html_tests set published = p_published, updated_at = now() where id = p_test_id;
  if not found then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;
  return p_published;
end;
$$;

revoke all on function set_test_published(uuid, boolean) from public, anon;
revoke all on function set_html_test_published(uuid, boolean) from public, anon;
grant execute on function set_test_published(uuid, boolean) to authenticated;
grant execute on function set_html_test_published(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verification — fail loudly if the gate did not take.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tests' and column_name='published'
  ) then
    raise exception '0031: tests.published was not created';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='html_tests' and column_name='published'
  ) then
    raise exception '0031: html_tests.published was not created';
  end if;

  -- New rows must default to unpublished; that is the whole point.
  if (select column_default from information_schema.columns
       where table_schema='public' and table_name='tests' and column_name='published') !~ 'false' then
    raise exception '0031: tests.published must default to false';
  end if;

  -- `authenticated` must not be able to flip the flag directly.
  if has_column_privilege('authenticated','public.tests','published','UPDATE') then
    raise exception '0031: authenticated can UPDATE tests.published directly';
  end if;

  raise notice '0031_publish_gate.sql: publish gate installed.';
end $$;
