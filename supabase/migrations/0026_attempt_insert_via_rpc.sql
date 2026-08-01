-- ---------------------------------------------------------------------------
-- Close the attempt-insert bypass in the link-gated test model.
--
-- Migration 0025 made "THE LINK IS THE KEY": a student can only SELECT a test
-- row once they hold an attempt on it, and attempts are supposed to be minted
-- only by presenting a valid share token (start_share_attempt).
--
-- But that was an application convention, not a database rule. `attempts_insert`
-- (0002_rls.sql) only checks `student_id = auth.uid()`, and PostgREST exposes
-- the table directly with the anon key that ships in every client bundle. So:
--
--   POST /rest/v1/attempts  {"student_id":"<self>","test_id":"<uuid>"}
--
-- mints an attempt on a test the student was never sent, which then unlocks
-- tests_select / html_tests_select for that row — title, description and, worst,
-- share_token. UUIDs aren't guessable, so this was never a mass-enumeration
-- hole, but it defeated the gate for any id that leaked.
--
-- Fix (in two steps — this migration is step 1, 0028 is step 2): make the
-- SECURITY DEFINER token functions the ONLY way to create an attempt, by adding
-- the missing hosted-test function here and revoking the direct INSERT grant in
-- 0028, once the app is deployed against it.
--
--   * DB-rail tests   -> start_share_attempt(p_token)       [0025, unchanged]
--   * Hosted HTML     -> start_share_html_attempt(p_token)  [added below]
--   * Vocab XP        -> unaffected: src/lib/data/activity-exp.ts inserts with
--                        the service-role client, which is not `authenticated`.
--
-- Additive and non-destructive: no rows are read, changed or dropped. Only a
-- grant is narrowed, and only for the `authenticated`/`anon` roles.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Token-keyed attempt creation for hosted HTML tests.
--
--    Mirrors start_share_attempt (0025) exactly, against html_tests:
--      * already submitted -> returns the existing row (caller shows review mode)
--      * in progress       -> resumes the same row
--      * none              -> inserts one; the partial unique index from
--                             0014_html_test_attempts makes a concurrent
--                             double-open collapse to a single row
--
--    Only STUDENT profiles mint attempts. A teacher/admin opening the link gets
--    zero rows back and the route serves the test in preview (unscored) mode —
--    previously an admin preview silently created an attempt row for itself.
-- ---------------------------------------------------------------------------

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
    -- attempt (and therefore no score bridge).
    return;
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

revoke all on function start_share_html_attempt(text) from public, anon;
grant execute on function start_share_html_attempt(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Removing the direct INSERT path is DELIBERATELY NOT DONE HERE.
--
--    `revoke insert on attempts from authenticated` lives in
--    0028_revoke_attempt_insert.sql instead, because it is only safe once the
--    application is deployed with the /ht/[token] route calling the RPC above.
--    Applying it against a deployment whose route still inserts directly would
--    stop students from starting hosted tests.
--
--    Ordering: apply this migration -> deploy the app -> apply 0028.
--
--    This migration on its own is purely additive: it adds a function nothing
--    calls yet, and changes no existing behaviour.
-- ---------------------------------------------------------------------------
