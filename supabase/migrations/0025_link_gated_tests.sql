-- ---------------------------------------------------------------------------
-- Link-gated tests.
--
-- Product rule (2026-07-31): joining Lexora stays open — anyone who signs in
-- with Google gets a STUDENT profile and full access to practice, vocabulary,
-- books and the leaderboard. TESTS are the one gated surface: a student may
-- only reach a test through a share link the admin sends them.
--
-- Before this migration the gate did not exist. `tests_select` and
-- `html_tests_select` both read `auth.uid() is not null`, so ANY signed-in
-- student could list every test row — including `share_token` — and simply
-- walk to /t/<token> or /ht/<token>. The Test Center browsed that catalog.
--
-- New model: THE LINK IS THE KEY.
--   * A student can only SELECT a test row once they have an attempt on it
--     (this keeps results/history pages working).
--   * Token -> test resolution moves into SECURITY DEFINER functions, so
--     holding the token is what grants entry. Tokens are unguessable uuids and
--     are no longer readable in bulk by students.
--   * Attempt creation is keyed by TOKEN, not test id — otherwise a student
--     could mint an attempt on a guessed id and thereby unlock the read policy.
--
-- Additive only: no data is dropped, no student rows are touched.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Read policies: teachers/admins see everything; students see only tests
--    they have actually been given (i.e. have an attempt row for).
-- ---------------------------------------------------------------------------

drop policy if exists tests_select on tests;
create policy tests_select on tests for select
  using (
    is_teacher()
    or exists (
      select 1 from attempts a
      where a.test_id = tests.id and a.student_id = auth.uid()
    )
  );

drop policy if exists html_tests_select on html_tests;
create policy html_tests_select on html_tests for select
  using (
    is_teacher()
    or exists (
      select 1 from attempts a
      where a.html_test_id = html_tests.id and a.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Token resolution (SECURITY DEFINER — bypasses the policies above by
--    design; the caller must be signed in AND must present the exact token).
--
--    share_token is compared as text so a malformed path segment returns "not
--    found" instead of raising a uuid cast error.
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
    and t.share_token::text = p_token;
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
    and h.share_token::text = p_token;
$$;

-- Questions for a shared test, resolved by token. answer_key is deliberately
-- NOT returned — grading stays server-side (see src/lib/data/submit.ts).
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
  order by 2;
$$;

revoke all on function resolve_share_test(text) from public, anon;
revoke all on function resolve_share_html_test(text) from public, anon;
revoke all on function share_test_questions(text) from public, anon;
grant execute on function resolve_share_test(text) to authenticated;
grant execute on function resolve_share_html_test(text) to authenticated;
grant execute on function share_test_questions(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Attempt creation, keyed by token.
--
--    This is the actual unlock: presenting a valid token is what lets a student
--    create their single attempt row, which in turn opens the read policy in
--    section 1. Mirrors src/lib/data/attempts.ts startAttempt():
--      * already submitted   -> returns the existing row (caller refuses re-entry)
--      * in progress         -> resumes the same row (server start time preserved)
--      * none                -> inserts one (unique index makes it atomic)
--
--    Only STUDENT rows may take tests; admins resolve to "not a student".
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

  insert into attempts (student_id, test_id)
  values (v_uid, v_test.id)
  on conflict do nothing;

  return query
    select a.id, v_test.id, a.started_at, a.submitted_at, v_test.time_limit_sec
    from attempts a
    where a.student_id = v_uid and a.test_id = v_test.id;
end;
$$;

revoke all on function start_share_attempt(text) from public, anon;
grant execute on function start_share_attempt(text) to authenticated;
