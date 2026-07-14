-- =============================================================================
-- 0018_lock_privileged_columns.sql
-- Security hardening: two critical column-level privilege fixes.
--
-- FINDING #1 (Privilege Escalation):
--   The `profiles_self_update` RLS policy (0002_rls.sql:91-92) allows a student
--   to UPDATE their own profiles row. Row-level policy passes for `id = auth.uid()`,
--   which means a student could call:
--     PATCH /rest/v1/profiles?id=eq.<their-id>  body: { "role": "ADMIN" }
--   and elevate themselves to ADMIN. The RLS USING/WITH CHECK clauses only gate
--   which ROWS can be touched — they say nothing about which COLUMNS are allowed.
--
-- FINDING #2 (Answer-Key Leak):
--   The `questions_select` RLS policy (0002_rls.sql:135) grants SELECT on the
--   entire `questions` row to any authenticated user. The `answer_key` column
--   therefore flows to students via direct PostgREST calls:
--     GET /rest/v1/questions?task_id=eq.<id>&select=answer_key
--   Grading reads answer_key exclusively through the service-role admin client
--   (src/lib/data/submit.ts:79-82, createAdminClient). The user-scoped query in
--   src/lib/data/tests.ts:getTestQuestions deliberately omits answer_key. This
--   REVOKE therefore breaks nothing in the application.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FIX #1 — Privilege Escalation: revoke column-level UPDATE on privileged
-- columns from the `authenticated` role.
--
-- Even when the row-level `profiles_self_update` policy passes, Postgres checks
-- column privileges AFTER row privileges. If the authenticated role lacks UPDATE
-- on a column, the write is rejected regardless of the RLS outcome.
--
-- IMPORTANT: a column-level REVOKE does NOT subtract from a *table-level* grant.
-- Supabase grants `authenticated` table-level privileges by default, so we must
-- first REVOKE the table-level UPDATE, then GRANT UPDATE back on ONLY the safe
-- columns. Omitting `role` and `group_id` from the grant is what actually locks
-- them. `id`, `created_at` are also intentionally excluded (never client-writable).
--
-- The service-role client (used in src/app/api/admin/students/[id]/route.ts:223
-- via createAdminClient) bypasses both RLS and column-level GRANTs, so admin
-- operations that legitimately set role / group_id are unaffected.
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, last_active_at, updated_at)
  ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- FIX #1 (defense-in-depth) — Immutable-field trigger on profiles.
--
-- Column REVOKE above is the primary control. This trigger is belt-and-suspenders:
-- it raises an exception at the DB layer if authenticated users somehow bypass
-- the column privilege check (e.g. via a future GRANT, a misconfigured policy, or
-- a Postgres extension that runs with elevated privileges). The trigger fires
-- BEFORE UPDATE so the row is never written.
--
-- Allow logic:
--   1. service_role callers (auth.role() = 'service_role') are always allowed —
--      they use createAdminClient and own the privileged admin operations.
--   2. Someone editing a DIFFERENT user's row (auth.uid() IS DISTINCT FROM NEW.id)
--      is a teacher/admin using the profiles_teacher_update policy — also allowed.
--   3. Block only when a user is editing THEIR OWN row AND changing role/group_id.
--
-- auth.uid() and auth.role() are standard Supabase/PostgREST helpers that read
-- the JWT claims set on every authenticated request.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_profile_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role callers bypass all restrictions (admin operations).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow a teacher/admin updating someone else's row via profiles_teacher_update.
  -- auth.uid() IS DISTINCT FROM NEW.id means the caller is NOT the row owner.
  IF auth.uid() IS DISTINCT FROM NEW.id THEN
    RETURN NEW;
  END IF;

  -- At this point: the caller is authenticated and is updating their OWN row.
  -- Block any attempt to change role or group_id.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION
      'Privilege escalation blocked: authenticated users may not change their own role. '
      'Finding: 0018_lock_privileged_columns.sql #1.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION
      'Privilege escalation blocked: authenticated users may not change their own group_id. '
      'Finding: 0018_lock_privileged_columns.sql #1.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop before recreate so this migration is safe to re-run (idempotent).
DROP TRIGGER IF EXISTS enforce_profile_immutable_fields ON public.profiles;

CREATE TRIGGER enforce_profile_immutable_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_immutable_fields();

-- ---------------------------------------------------------------------------
-- FIX #2 — Answer-Key Leak: revoke column-level SELECT on answer_key from
-- the `authenticated` role.
--
-- As with FIX #1, a column-level REVOKE cannot subtract from the table-level
-- SELECT that Supabase grants `authenticated` by default. We therefore REVOKE
-- table-level SELECT and GRANT SELECT back on every column EXCEPT answer_key.
--
-- All other columns on `questions` remain readable so that
-- src/lib/data/tests.ts:getTestQuestions (user-scoped client) can still fetch
-- id, task_id, order, format, skill_area, prompt, content, points to render the
-- test UI. Only the answer key is hidden from student/user-scoped queries.
--
-- The service-role client used in src/lib/data/submit.ts:79-82 and
-- src/lib/data/publish-test.ts bypasses column privileges entirely, so grading
-- and authoring are unaffected.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.questions FROM authenticated;
GRANT SELECT ("id", "task_id", "order", "format", "skill_area", "prompt", "content", "points")
  ON public.questions TO authenticated;
