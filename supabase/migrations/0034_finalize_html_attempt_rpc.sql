-- Migration 0034: atomic finalize_html_test_attempt RPC
--
-- Fixes a security review finding on the hosted-HTML-test submit path
-- (src/app/api/tests/html/submit/route.ts):
--
--   [Critical] Non-atomic finalize silently loses the score and reports
--   success. The route used to stamp attempts.submitted_at BEFORE inserting
--   the `results` row. If the insert (or the result_skill_scores insert right
--   after it) failed, the route 500'd — but on retry, attempt.submitted_at
--   was already set, so the idempotency branch found no `results` row and
--   returned { ok: true, alreadySubmitted: true } with resultId: null. HTTP
--   200, success reported, score permanently gone with no recovery path.
--
-- We considered reusing finalize_test_attempt (migration 0019), which already
-- does this exact atomic-write pattern for the DB-test rail. It does not fit:
--   - It keys off `test_id`; hosted attempts carry `html_test_id` instead
--     (see 0014_html_test_attempts.sql's num_nonnulls(task_id, test_id,
--     html_test_id) = 1 constraint — an attempt has exactly one target kind).
--   - It inserts attempt_answers keyed by question_id (a real uuid FK into
--     `questions`). Hosted-test answer ids come from the test's own HTML
--     (numeric indexes or ad-hoc string ids into html_test_answer_keys,
--     migration 0027) and are not `questions` rows at all — casting them to
--     uuid would simply fail. The hosted path has never written
--     attempt_answers and this migration does not add that either.
--   - Its p_status/p_excluded parameters exist for DB-test cases (PLACEMENT,
--     PENDING_REVIEW) that cannot occur for hosted tests: a hosted test grades
--     itself client-side with no server/teacher review step, so status is
--     always COMPLETED and excluded_from_progress is always false. Hardcoded
--     here rather than threaded through as parameters that could only ever
--     take one value.
--
-- So: a sibling function, modelled closely on 0019's CAS + single-transaction
-- pattern, scoped to what the hosted path actually writes: the attempt claim,
-- the result row (including integrity telemetry, written in the SAME insert
-- rather than as a separate best-effort post-commit UPDATE), the per-skill
-- score rows, and the deduped XP ledger write.
--
-- Design: grading (server-side re-grade against html_test_answer_keys, or the
-- legacy self-reported score) stays in TypeScript; only persistence moves into
-- this function so the write is one implicit PG transaction. SECURITY DEFINER,
-- called exclusively from the service-role admin client in the submit route.

create or replace function public.finalize_html_test_attempt(
  p_attempt_id           uuid,
  p_student_id           uuid,
  p_skill_scores         jsonb,   -- array of {skill_area, correct_count, total_count, accuracy}
  p_exp                  int,
  p_exp_unique_key       text,
  p_integrity_violations int default 0,
  p_integrity_flags      jsonb default null
)
returns table (
  result_id             uuid,
  exp_awarded           int,
  was_already_submitted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed_id  uuid;
  v_result_id   uuid;
  v_exp_awarded int := 0;
  v_exp_rows    bigint := 0;
begin
  -- -----------------------------------------------------------------------
  -- Step 1: Atomically CLAIM the attempt.
  --   UPDATE ... WHERE submitted_at IS NULL is the concurrency-safe gate:
  --   exactly one concurrent submit wins the CAS; all others see NOT FOUND.
  --   The claim happens INSIDE the transaction, so if any later step fails
  --   the whole tx rolls back, leaving submitted_at NULL and the attempt
  --   retryable — the exact bug this migration fixes.
  --   html_test_id is not null additionally scopes this function to hosted
  --   attempts only (defense in depth; the caller already checks this).
  -- -----------------------------------------------------------------------
  update attempts
     set submitted_at = now()
   where id           = p_attempt_id
     and student_id   = p_student_id
     and html_test_id is not null
     and submitted_at is null
  returning id into v_claimed_id;

  if v_claimed_id is null then
    -- Already submitted (or not owned by this student, or not a hosted
    -- attempt). Return the existing result idempotently — never re-insert or
    -- re-award XP.
    select r.id into v_result_id
      from results r
     where r.attempt_id = p_attempt_id
     limit 1;

    return query select v_result_id, 0::int, true;
    return;
  end if;

  -- -----------------------------------------------------------------------
  -- Step 2: INSERT result row. Integrity telemetry is written HERE, in the
  --   same insert, rather than as a separate post-commit UPDATE — the old
  --   route did the update as a distinct best-effort step, which is safe (it
  --   is only telemetry) but there is no reason to give it its own window
  --   now that everything else is transactional.
  -- -----------------------------------------------------------------------
  insert into results (
    attempt_id, student_id, status, excluded_from_progress,
    integrity_violations, integrity_flags
  )
  values (
    p_attempt_id,
    p_student_id,
    'COMPLETED',
    false,
    coalesce(p_integrity_violations, 0),
    p_integrity_flags
  )
  returning id into v_result_id;

  -- -----------------------------------------------------------------------
  -- Step 3: INSERT result_skill_scores with a correct_count <= total_count
  --   integrity clamp (mirrors 0019).
  -- -----------------------------------------------------------------------
  insert into result_skill_scores (result_id, skill_area, correct_count, total_count, accuracy)
  select
    v_result_id,
    (s->>'skill_area')::skill_area,
    least(coalesce((s->>'correct_count')::int, 0), coalesce((s->>'total_count')::int, 0)),
    coalesce((s->>'total_count')::int, 0),
    coalesce((s->>'accuracy')::double precision, 0)
  from jsonb_array_elements(p_skill_scores) as s;

  -- -----------------------------------------------------------------------
  -- Step 4: Award EXP once, inside the same transaction. ON CONFLICT DO
  --   NOTHING on (student_id, unique_key) makes this a safe no-op on any
  --   replayed call — the ledger unique index is the authoritative dedupe
  --   gate, same as awardHtmlTestExp / finalize_test_attempt.
  -- -----------------------------------------------------------------------
  if p_exp > 0 and p_exp_unique_key is not null then
    insert into points_ledger (student_id, reason, points, unique_key)
    values (p_student_id, 'TEST_EXP', p_exp, p_exp_unique_key)
    on conflict (student_id, unique_key) do nothing;

    get diagnostics v_exp_rows = row_count;
    if v_exp_rows > 0 then
      v_exp_awarded := p_exp;
    end if;
  end if;

  return query select v_result_id, v_exp_awarded, false;
end;
$$;

-- CRITICAL: Postgres grants EXECUTE to PUBLIC by default on every new function.
-- Because this is SECURITY DEFINER and writes points_ledger with attacker-chosen
-- p_exp, a student could call it directly via PostgREST (rpc) to mint unlimited
-- XP and forge results. Lock it down so ONLY the service-role admin client (used
-- by the html submit route) can execute it. service_role bypasses these grants.
revoke execute on function
  public.finalize_html_test_attempt(uuid, uuid, jsonb, int, text, int, jsonb)
  from public, anon, authenticated;

comment on function public.finalize_html_test_attempt(uuid, uuid, jsonb, int, text, int, jsonb) is
  'Atomically claim + persist a graded hosted-HTML-test attempt inside a single PG transaction. '
  'Sibling of finalize_test_attempt (0019), scoped to what the hosted path writes (no attempt_answers). '
  'Fixes: non-transactional finalize silently losing the score while reporting HTTP 200 success. '
  'Called only from src/app/api/tests/html/submit/route.ts via the service-role admin client.';
