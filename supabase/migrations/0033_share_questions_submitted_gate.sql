-- ---------------------------------------------------------------------------
-- 0033 — Close share_test_questions to students who already submitted.
--
-- feat/remove-student-review added an application-level gate in
-- src/app/t/[token]/page.tsx: it calls share_attempt_state() (0032) and
-- refuses to render the question bank if the student's attempt is already
-- submitted. That check never reached the database. share_test_questions()
-- (0031) is itself a public RPC — SECURITY DEFINER, callable directly over
-- PostgREST (`/rest/v1/rpc/share_test_questions`) by any authenticated
-- session holding the share token. A student who finished the test still has
-- both the token and their own JWT, so they could call the RPC straight from
-- the browser and pull every prompt/content row, bypassing page.tsx
-- entirely. There was also a TOCTOU gap even for the app-level gate: the
-- state check and the question fetch were two separate calls, so a
-- submission landing between them still slipped through.
--
-- Fix: push the "already submitted" rule into share_test_questions() itself,
-- so the gate holds no matter how the RPC is invoked, and holds atomically
-- (one query, one snapshot of the data).
--
-- Scope of the new rule — STUDENTS ONLY:
--   * If the caller is a student (profiles.role = 'STUDENT') and holds a
--     submitted attempt (attempts.submitted_at is not null) for this test,
--     the function returns ZERO ROWS. No error — same "quietly nothing"
--     shape as the rest of the 0031/0032 family, so a submitted student
--     learns nothing extra by probing the RPC after the fact.
--   * Teachers/admins are untouched. is_teacher() callers keep previewing
--     questions for both published and unpublished tests, exactly as 0031
--     left it. A teacher may have zero attempt rows, or — if a teacher ever
--     sat the test as an exercise — a submitted one; neither case may filter
--     their preview. The new predicate is therefore written as
--     "is_teacher() or (no submitted attempt for this student)", so it never
--     even evaluates the attempt check for a teacher.
--
-- Every existing check (auth required, token match, published-or-teacher) is
-- carried over byte-for-byte from 0031. Return columns, names, order and
-- types are unchanged so callers (share_test_questions(p_token) in
-- TestTaker/route.ts) need no changes. answer_key is still never selected.
--
-- Additive only: this redefines a function and touches no data. No insert,
-- update, delete or truncate statements appear anywhere in this file.
-- ---------------------------------------------------------------------------

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
    -- Submitted-attempt gate (0033). Teachers/admins bypass entirely — the
    -- exists() subquery is only reached for non-teacher callers, so a
    -- teacher with no attempt row (or even a submitted one from testing the
    -- test themselves) never loses their preview.
    and (
      is_teacher()
      or not exists (
        select 1
        from attempts a
        where a.test_id = t.id
          and a.student_id = auth.uid()
          and a.submitted_at is not null
      )
    )
  order by 2;
$$;

-- Grants are unchanged from 0025/0031: `create or replace function` preserves
-- existing privileges, and the shape (revoke public/anon, grant authenticated)
-- was already correct. Re-asserted here anyway so this migration is
-- self-verifying and does not silently depend on 0025 having run first.
revoke all on function share_test_questions(text) from public, anon;
grant execute on function share_test_questions(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'share_test_questions'
  ) then
    raise exception '0033: share_test_questions was not found';
  end if;

  if has_function_privilege('anon', 'public.share_test_questions(text)', 'execute') then
    raise exception '0033: anon must not execute share_test_questions';
  end if;

  if not has_function_privilege('authenticated', 'public.share_test_questions(text)', 'execute') then
    raise exception '0033: authenticated must be able to execute share_test_questions';
  end if;

  raise notice '0033_share_questions_submitted_gate.sql: submitted-attempt gate installed on share_test_questions.';
end $$;
