-- ---------------------------------------------------------------------------
-- 0032_revoke_attempt_writes.sql
-- Close the attempt-reopen / forged-grade bypass left open by attempts_update
-- and the attempt_answers write policies.
--
-- LIVE VULNERABILITY (verified against production today):
--   has_table_privilege('authenticated', 'public.attempts', 'UPDATE') = true
--   has_table_privilege('authenticated', 'public.attempts', 'INSERT') = true
--     (the INSERT half is already closed by 0028_revoke_attempt_insert.sql,
--     which is pending deploy — this migration does not touch INSERT and does
--     not duplicate or contradict 0028; see the note below.)
--
--   0002_rls.sql:181-182 defines:
--     create policy attempts_update on attempts for update
--       using (student_id = auth.uid()) with check (student_id = auth.uid());
--   That policy restricts which ROW a student may touch (their own), but
--   places NO restriction on which COLUMNS the update may change. RLS is a
--   row-level filter, not a column-level one, so nothing in Postgres stops a
--   signed-in student from issuing, straight over PostgREST:
--
--     PATCH /rest/v1/attempts?id=eq.<their-own-attempt-id>
--     { "submitted_at": null }
--
--   which reopens a completed attempt: start_share_attempt() then treats it
--   as resumable instead of refusing, destroying the one-attempt-per-student-
--   per-test guarantee that migrations 0008/0025/0028 exist to enforce.
--   Setting `test_id` (or `html_test_id`) to another test's id is equally
--   reachable and would satisfy `tests_select`'s (0025) "an attempt row
--   proves the link" check for a test the student was never given, exposing
--   that test's row including its share_token.
--
--   The same shape exists on `attempt_answers`. 0002_rls.sql:191-198's
--   `attempt_answers_insert`/`attempt_answers_update` policies key only off
--   the PARENT attempt's ownership (`student_id = auth.uid()` via a subquery
--   on `attempts`), with no restriction on `is_correct` or `awarded_points`.
--   A student could INSERT or UPDATE rows in this table to forge a graded
--   answer directly. Nothing in the app reads attempt_answers back today
--   (confirmed by grep — no `.from("attempt_answers")` call exists anywhere
--   in src/), so this half is latent rather than live. Closed anyway, on the
--   same "why leave a bypass a policy alone can't stop" logic as `attempts`.
--
-- WHY RLS ALONE WAS INSUFFICIENT:
--   RLS policies gate ROWS, not COLUMNS or which SQL verb is even reachable.
--   `attempts_update`'s `using`/`with check` clauses only ever ask "is this
--   the caller's own row?" — they say nothing about which fields the caller
--   may set on it. The only way to take away the ability to touch specific
--   verbs entirely is the table-level GRANT underneath RLS, which is exactly
--   what 0018_lock_privileged_columns.sql and 0028_revoke_attempt_insert.sql
--   already did for other columns/verbs on these tables. This migration
--   applies the same technique to the two verbs 0028 didn't cover: UPDATE and
--   DELETE on `attempts`, and INSERT/UPDATE/DELETE on `attempt_answers`.
--
-- WRITE-SITE AUDIT (grep 'from("attempts")' / 'from("attempt_answers")' across
-- src/, every result classified by which Supabase client performs it):
--   src/app/api/tests/html/submit/route.ts   -- createAdminClient() (service_role)
--   src/app/api/admin/students/[id]/route.ts -- createAdminClient() (service_role)
--   src/lib/data/activity-exp.ts             -- createAdminClient() (service_role)
--   src/lib/data/submit.ts                   -- createAdminClient() (service_role)
--   src/lib/data/publish-test.ts             -- createAdminClient() (service_role)
--   src/lib/data/my-attempts.ts              -- createClient() (session), SELECT only
--   src/lib/data/hosted-tests.ts             -- createClient() (session), SELECT only
--   attempt_answers                          -- zero direct app writes; only written
--                                                inside finalize_test_attempt (0019,
--                                                SECURITY DEFINER, runs as its owner)
--   Every UPDATE/INSERT/DELETE against `attempts` in the app goes through
--   createAdminClient() (service_role) or through finalize_test_attempt /
--   start_share_attempt / start_share_html_attempt (all SECURITY DEFINER).
--   Both are unaffected by revoking authenticated/anon grants: service_role
--   bypasses grants entirely (0030), and a SECURITY DEFINER function runs
--   with the privileges of its owner, not its caller. The only session-client
--   (createClient()) touches found were SELECTs. No legitimate write breaks.
--
-- DELETE on `attempts`: also revoked here, for two independent reasons.
--   1. Grep across src/ and supabase/migrations/*.sql finds no `.delete()`
--      call against `attempts` anywhere, admin or session client — nothing
--      legitimately deletes an attempt row as any role.
--   2. 0002_rls.sql defines only attempts_select/attempts_insert/
--      attempts_update — there is no attempts_delete policy at all, so with
--      RLS enabled a DELETE would already affect zero rows for every caller
--      regardless of table grant (default-deny when no policy matches the
--      operation). Revoking the grant on top is defense in depth: it turns a
--      "policy silently no-ops it" guarantee into "the verb isn't reachable
--      over the Data API at all," consistent with how 0028 handled INSERT.
--
-- WHAT STILL WORKS AFTERWARDS:
--   * Students keep reading their own attempts and answers (SELECT is
--     untouched on both tables; RLS continues to scope rows to the caller).
--   * start_share_attempt() / start_share_html_attempt() keep minting rows
--     (SECURITY DEFINER, unaffected by these revokes).
--   * finalize_test_attempt() keeps stamping submitted_at on attempts and
--     inserting attempt_answers (SECURITY DEFINER, unaffected).
--   * All admin/server routes keep working (service_role, unaffected).
--
-- Non-destructive: grants are narrowed. No row is read, changed, or dropped.
-- REVOKE is naturally idempotent — safe to re-run on any environment,
-- including production, which has live student data.
--
-- Rollback, if a deployment has to be reverted:
--   grant update on public.attempts to authenticated;
--   grant delete on public.attempts to authenticated;
--   grant insert, update, delete on public.attempt_answers to authenticated;
-- ---------------------------------------------------------------------------

revoke update, delete on public.attempts from authenticated, anon;
revoke insert, update, delete on public.attempt_answers from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Verification — fail loudly if any standing security invariant broke.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Primary fix: authenticated/anon must no longer be able to UPDATE attempts.
  if has_table_privilege('authenticated', 'public.attempts', 'UPDATE') then
    raise exception '0032 invariant violated: authenticated can UPDATE attempts';
  end if;
  if has_table_privilege('anon', 'public.attempts', 'UPDATE') then
    raise exception '0032 invariant violated: anon can UPDATE attempts';
  end if;

  -- Defense in depth: DELETE on attempts also closed, even though 0002_rls.sql
  -- has no attempts_delete policy to exploit.
  if has_table_privilege('authenticated', 'public.attempts', 'DELETE') then
    raise exception '0032 invariant violated: authenticated can DELETE attempts';
  end if;
  if has_table_privilege('anon', 'public.attempts', 'DELETE') then
    raise exception '0032 invariant violated: anon can DELETE attempts';
  end if;

  -- attempt_answers: INSERT/UPDATE/DELETE all closed for authenticated/anon.
  if has_table_privilege('authenticated', 'public.attempt_answers', 'INSERT') then
    raise exception '0032 invariant violated: authenticated can INSERT into attempt_answers';
  end if;
  if has_table_privilege('anon', 'public.attempt_answers', 'INSERT') then
    raise exception '0032 invariant violated: anon can INSERT into attempt_answers';
  end if;
  if has_table_privilege('authenticated', 'public.attempt_answers', 'UPDATE') then
    raise exception '0032 invariant violated: authenticated can UPDATE attempt_answers';
  end if;
  if has_table_privilege('anon', 'public.attempt_answers', 'UPDATE') then
    raise exception '0032 invariant violated: anon can UPDATE attempt_answers';
  end if;
  if has_table_privilege('authenticated', 'public.attempt_answers', 'DELETE') then
    raise exception '0032 invariant violated: authenticated can DELETE attempt_answers';
  end if;
  if has_table_privilege('anon', 'public.attempt_answers', 'DELETE') then
    raise exception '0032 invariant violated: anon can DELETE attempt_answers';
  end if;

  -- Regression guards: SELECT must remain intact on both tables (students
  -- still read their own attempts/answers; RLS scopes the rows).
  if not has_table_privilege('authenticated', 'public.attempts', 'SELECT') then
    raise exception '0032 regression: authenticated lost SELECT on attempts';
  end if;
  if not has_table_privilege('authenticated', 'public.attempt_answers', 'SELECT') then
    raise exception '0032 regression: authenticated lost SELECT on attempt_answers';
  end if;

  -- Regression guard: service_role must retain full access — grading
  -- (finalize_test_attempt's caller context) and every admin route depend on it.
  if not has_table_privilege('service_role', 'public.attempts', 'UPDATE') then
    raise exception '0032 regression: service_role lost UPDATE on attempts';
  end if;
  if not has_table_privilege('service_role', 'public.attempt_answers', 'INSERT') then
    raise exception '0032 regression: service_role lost INSERT on attempt_answers';
  end if;

  raise notice '0032_revoke_attempt_writes.sql: all invariants verified.';
end $$;
