-- ---------------------------------------------------------------------------
-- 0032 — Read-only completion check for the share-link entry point.
--
-- /t/<token> (src/app/t/[token]/page.tsx) needs to answer "has this student
-- already submitted this test?" during the Server Component render, BEFORE
-- fetching questions — a student who already submitted must never have the
-- question bank serialized into the RSC payload.
--
-- That check was briefly implemented by calling start_share_attempt() (0031)
-- during render. That RPC is a MUTATING create-or-resume: it inserts the
-- attempt row and anchors started_at (the exam timer). Next.js can render a
-- dynamic route speculatively (<Link prefetch>, router.prefetch(), RSC
-- prefetch requests), so a render-time call to a mutating RPC risks minting a
-- student's attempt — and starting their exam clock — before they ever press
-- "Begin". This migration adds a STABLE, read-only sibling that reports
-- attempt/submission state without inserting anything, so the render-time
-- gate can go back to being a pure read. Attempt CREATION stays exactly where
-- it was: the client-side start_share_attempt() call in TestTaker.
--
-- Modelled on start_share_attempt / share_test_questions (0031) so it is
-- exactly as strict:
--   * authenticated only (raises on no session, same as start_share_attempt)
--   * non-students get a benign empty result, not an error (matches
--     start_share_html_attempt's "teachers may preview, no attempt" shape)
--   * token must match a row; unpublished tests are invisible to students
--   * never leaks whether a test exists to an unauthorized/wrong-token caller
--     — a bad or unpublished token just yields no rows, the same shape as
--     "no attempt yet", not an error
-- ---------------------------------------------------------------------------

create or replace function share_attempt_state(p_token text)
returns table (
  submitted_at timestamptz,
  result_id    uuid
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_role    text;
  v_test_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  select p.role::text into v_role from profiles p where p.id = v_uid;
  if v_role is distinct from 'STUDENT' then
    -- Not an error: teachers/admins previewing a link have no attempt to
    -- report on. Same convention as start_share_html_attempt.
    return;
  end if;

  -- Unpublished (or nonexistent) tests are invisible here, same as every
  -- other token RPC in 0031 — a student holding such a link learns nothing.
  select t.id into v_test_id
  from tests t
  where t.share_token::text = p_token
    and t.published;

  if v_test_id is null then
    return;
  end if;

  return query
    select a.submitted_at, r.id
    from attempts a
    left join results r on r.attempt_id = a.id
    where a.student_id = v_uid and a.test_id = v_test_id;
end;
$$;

revoke all on function share_attempt_state(text) from public, anon;
grant execute on function share_attempt_state(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'share_attempt_state'
  ) then
    raise exception '0032: share_attempt_state was not created';
  end if;

  if has_function_privilege('anon', 'public.share_attempt_state(text)', 'execute') then
    raise exception '0032: anon must not execute share_attempt_state';
  end if;

  if not has_function_privilege('authenticated', 'public.share_attempt_state(text)', 'execute') then
    raise exception '0032: authenticated must be able to execute share_attempt_state';
  end if;

  raise notice '0032_share_attempt_state.sql: read-only completion check installed.';
end $$;
