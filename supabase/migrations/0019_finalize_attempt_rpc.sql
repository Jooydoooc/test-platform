-- Migration 0019: atomic finalize_test_attempt RPC
--
-- Fixes two security review findings:
--   [High #6] Non-transactional finalize: submitted_at was stamped BEFORE
--     writing answers/results, so a mid-write crash left the attempt permanently
--     sealed with no result and no EXP. Concurrent double-submits raced.
--   [High #7] Per-skill accuracy was computed from QUESTION COUNT, not POINTS,
--     weighting a 2-pt and 1-pt question equally. Now the TypeScript caller
--     passes points-weighted correct_count/total_count, and this RPC stores them.
--
-- Design: grading stays in TypeScript (gradeQuestion); only persistence is
-- moved into this function so the entire write is one implicit PG transaction.
-- The function is SECURITY DEFINER so it runs with the definer's privileges
-- (service-role equivalent). It is called exclusively from submit.ts via the
-- service-role admin client, so no GRANT to authenticated is needed — service_role
-- can already execute any function.

create or replace function public.finalize_test_attempt(
  p_attempt_id        uuid,
  p_student_id        uuid,
  p_status            result_status,
  p_excluded          boolean,
  p_answers           jsonb,   -- array of {question_id, response, is_correct, awarded_points, needs_teacher_check}
  p_skill_scores      jsonb,   -- array of {skill_area, correct_count, total_count, accuracy}
  p_exp               int,
  p_exp_unique_key    text
)
returns table (
  result_id             uuid,
  status                result_status,
  exp_awarded           int,
  was_already_submitted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed_id    uuid;
  v_result_id     uuid;
  v_exp_awarded   int := 0;
  v_exp_rows      bigint := 0;  -- GET DIAGNOSTICS row_count target (bigint, NOT boolean)
begin
  -- -----------------------------------------------------------------------
  -- Step 1: Atomically CLAIM the attempt.
  --   UPDATE ... WHERE submitted_at IS NULL is the concurrency-safe gate:
  --   exactly one concurrent submit wins the CAS; all others see NOT FOUND.
  --   [Fixes High #6: the claim happens INSIDE the transaction, so if any
  --    later step fails the whole tx rolls back, leaving submitted_at NULL
  --    and allowing the student to retry.]
  -- -----------------------------------------------------------------------
  update attempts
     set submitted_at = now()
   where id          = p_attempt_id
     and student_id  = p_student_id
     and submitted_at is null
  returning id into v_claimed_id;

  if v_claimed_id is null then
    -- Already submitted (or not owned by this student). Return the existing
    -- result idempotently — never re-insert or re-award XP.
    select r.id, r.status
      into v_result_id, finalize_test_attempt.status
      from results r
     where r.attempt_id = p_attempt_id
     limit 1;

    return query
      select
        v_result_id,
        coalesce(finalize_test_attempt.status, p_status),
        0::int,
        true;
    return;
  end if;

  -- -----------------------------------------------------------------------
  -- Step 2: INSERT attempt_answers from the jsonb array.
  --   awarded_points, is_correct (nullable), needs_teacher_check come from
  --   TypeScript grading (gradeQuestion). This never runs unless the claim
  --   above succeeded, so there is no risk of duplicate answer rows.
  -- -----------------------------------------------------------------------
  insert into attempt_answers (attempt_id, question_id, response, is_correct, awarded_points, needs_teacher_check)
  select
    p_attempt_id,
    (a->>'question_id')::uuid,
    coalesce(a->'response', '{}'::jsonb),
    case when a->>'is_correct' is null then null else (a->>'is_correct')::boolean end,
    coalesce((a->>'awarded_points')::int, 0),
    coalesce((a->>'needs_teacher_check')::boolean, false)
  from jsonb_array_elements(p_answers) as a;

  -- -----------------------------------------------------------------------
  -- Step 3: INSERT result row.
  -- -----------------------------------------------------------------------
  insert into results (attempt_id, student_id, status, excluded_from_progress)
  values (p_attempt_id, p_student_id, p_status, p_excluded)
  returning id into v_result_id;

  -- -----------------------------------------------------------------------
  -- Step 4: INSERT result_skill_scores with a correct_count <= total_count
  --   integrity clamp.
  --   [Fixes High #7: the TS caller now passes points-weighted values where
  --    correct_count = pointsEarned and total_count = pointsPossible, so
  --    accuracy is points-proportional not question-count-proportional.
  --    The clamp below ensures we never store impossible correct > total.]
  -- -----------------------------------------------------------------------
  insert into result_skill_scores (result_id, skill_area, correct_count, total_count, accuracy)
  select
    v_result_id,
    (s->>'skill_area')::skill_area,
    -- clamp: correct_count must never exceed total_count
    least(coalesce((s->>'correct_count')::int, 0), coalesce((s->>'total_count')::int, 0)),
    coalesce((s->>'total_count')::int, 0),
    coalesce((s->>'accuracy')::double precision, 0)
  from jsonb_array_elements(p_skill_scores) as s;

  -- -----------------------------------------------------------------------
  -- Step 5: Award EXP once, inside the same transaction.
  --   ON CONFLICT DO NOTHING on (student_id, unique_key) makes this a safe
  --   no-op on any replayed call — the ledger unique index is the authoritative
  --   dedupe gate (same logic as the TS awardTestExp helper, now in one tx).
  -- -----------------------------------------------------------------------
  if p_exp > 0 and p_exp_unique_key is not null then
    -- reason 'TEST_EXP' matches the legacy awardTestExp helper exactly, so
    -- ledger rows stay consistent for any reason-based aggregation.
    insert into points_ledger (student_id, reason, points, unique_key)
    values (p_student_id, 'TEST_EXP', p_exp, p_exp_unique_key)
    on conflict (student_id, unique_key) do nothing;

    -- GET DIAGNOSTICS tells us whether the INSERT actually wrote a row
    -- (vs. silently skipped by ON CONFLICT DO NOTHING). row_count is a bigint,
    -- so the target MUST be an integer type — assigning it to a boolean raises a
    -- runtime cast error that would roll back the whole submission transaction.
    get diagnostics v_exp_rows = row_count;
    if v_exp_rows > 0 then
      v_exp_awarded := p_exp;
    end if;
  end if;

  -- -----------------------------------------------------------------------
  -- Step 6: Return the new result.
  -- -----------------------------------------------------------------------
  return query
    select
      v_result_id,
      p_status,
      v_exp_awarded,
      false;
end;
$$;

-- CRITICAL: Postgres grants EXECUTE to PUBLIC by default on every new function.
-- Because this is SECURITY DEFINER and writes points_ledger with attacker-chosen
-- p_exp, a student could call it directly via PostgREST (rpc) to mint unlimited
-- XP and forge results. Lock it down so ONLY the service-role admin client (used
-- by submit.ts) can execute it. service_role bypasses these grants.
revoke execute on function
  public.finalize_test_attempt(uuid, uuid, result_status, boolean, jsonb, jsonb, int, text)
  from public, anon, authenticated;

-- (No GRANT to authenticated — this function is called exclusively via the
-- service-role admin client in submit.ts.)
comment on function public.finalize_test_attempt(uuid, uuid, result_status, boolean, jsonb, jsonb, int, text) is
  'Atomically claim + persist a graded test attempt inside a single PG transaction. '
  'Fixes High #6 (non-transactional finalize) and High #7 (question-count-weighted accuracy). '
  'Called only from submit.ts via the service-role admin client.';
