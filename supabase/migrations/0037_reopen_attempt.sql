-- =============================================================================
-- 0037_reopen_attempt.sql
--
-- TEST_AND_RESULTS.md promises "a teacher can re-open a test for a specific
-- student after a technical problem." That feature does not exist anywhere in
-- the schema. This migration builds the database half of it.
--
-- WHY NOT JUST NULL attempts.submitted_at — READ THIS BEFORE CHANGING ANYTHING
-- BELOW:
--   `results.attempt_id` is UNIQUE (0001_schema.sql:326) and `attempt_answers`
--   is unique on (attempt_id, question_id) (0001_schema.sql:319/320). Both
--   finalize_test_attempt (0019) and finalize_html_test_attempt (0036) claim
--   the attempt with `update attempts set submitted_at = now() where id = ...
--   and submitted_at is null` (a CAS) and then INSERT into results and
--   attempt_answers. If a "reopen" just nulled submitted_at on the SAME
--   attempt row, a resubmit would win the CAS (submitted_at was null again)
--   and then the INSERT into results/attempt_answers would violate the unique
--   constraints above (23505), rolling back the whole transaction — including
--   the CAS. submitted_at goes back to null and the student is permanently
--   stuck: every resubmit repeats the same crash. Nulling submitted_at on an
--   already-graded attempt is not a reopen, it's a deadlock generator.
--
-- THE DESIGN IMPLEMENTED INSTEAD: SUPERSEDE, DON'T OVERWRITE.
--   A "reopened" attempt is never mutated back to in-progress. It keeps its
--   started_at, submitted_at, its result, and its graded answers forever, as
--   a permanent historical record. Re-opening instead marks that attempt row
--   `superseded_at = now()`, which:
--     * excludes it from the three "one attempt per student per target, ever"
--       partial unique indexes (0008/0014/0016), freeing the student to get a
--       brand-new attempt row for the same test/html_test/vocab unit,
--     * flips its result's `excluded_from_progress` to true (0001_schema.sql:
--       329 — the exact column that exists for "don't count this in
--       progress/skill stats"), so the stale score stops polluting stats once
--       a fresh attempt supersedes it,
--     * is recorded in a new append-only audit table, `attempt_reopens`, so
--       there is always a paper trail of who reopened what, when, and why.
--   The old attempt, its answers, and its result are NEVER deleted, truncated,
--   or overwritten. The only UPDATEs this migration's RPC performs are setting
--   `attempts.superseded_at` and `results.excluded_from_progress` — nothing
--   else, on no other table.
--
-- WHAT THIS MIGRATION DOES, IN ORDER:
--   1. attempts.superseded_at (nullable timestamptz) — additive column.
--   2. Re-point the three partial unique indexes to also require
--      `superseded_at is null`, so a superseded attempt no longer blocks a
--      fresh one. Dropped and recreated inside this migration's implicit
--      transaction, so there is never a window where a duplicate could slip
--      in between the drop and the recreate.
--   3. New audit table `attempt_reopens`, modelled on points_ledger's
--      insert-only shape (0001_schema.sql:379-387). RLS enabled; readable by
--      is_teacher(), writable only through the RPC below (DML revoked from
--      `authenticated`, same treatment 0034_revoke_attempt_writes.sql gave
--      `attempts`). `attempt_id` has NO `on delete cascade` — default NO
--      ACTION — so an audit row can never be silently erased by a cascade;
--      that is exactly the argument 0035_schema_hardening.sql made for
--      attempt_answers.question_id's FK.
--   4. reopen_test_attempt(p_attempt_id, p_reason) — ADMIN-only RPC that
--      performs the supersede + audit-log write atomically.
--   5. Re-point every gate that keys on submitted_at so a superseded attempt
--      is treated as if it never happened for entry purposes, while its
--      historical row is left completely alone:
--        - share_test_questions (0033)
--        - share_attempt_state (0032)
--        - start_share_attempt / start_share_html_attempt (0031)
--      finalize_test_attempt (0019) and finalize_html_test_attempt (0036) are
--      checked below and NOT modified — see the note in section 5.
--
-- NOT DESTRUCTIVE: this migration contains no `delete`, `truncate`, or
-- `drop table` statement anywhere. The only `update` statements are inside
-- reopen_test_attempt(), and they touch exactly one attempts row
-- (superseded_at) and, if it exists, exactly one results row
-- (excluded_from_progress) — never any other column, never any other table.
-- Existing rows read correctly with superseded_at null (the everyday case);
-- nothing about current behaviour changes until an admin actually calls
-- reopen_test_attempt().
--
-- SAFE TO RE-RUN: every DDL statement is `add column if not exists`,
-- `drop index if exists` + `create ... if not exists`, `create table if not
-- exists`, or `create or replace function`. Re-running this file on an
-- environment where it already applied is a no-op.
--
-- ROLLBACK (if ever needed — does not remove any student data; only reverts
-- the reopen machinery itself):
--   drop function if exists reopen_test_attempt(uuid, text);
--   -- restore the pre-0037 function bodies for share_test_questions,
--   -- share_attempt_state, start_share_attempt, start_share_html_attempt
--   -- (copy them back from 0033/0032/0031 respectively);
--   drop index if exists attempts_one_per_student_test;
--   create unique index attempts_one_per_student_test
--     on attempts (student_id, test_id) where test_id is not null;
--   drop index if exists attempts_one_per_student_html_test;
--   create unique index attempts_one_per_student_html_test
--     on attempts (student_id, html_test_id) where html_test_id is not null;
--   drop index if exists attempts_one_per_student_vocab;
--   create unique index attempts_one_per_student_vocab
--     on attempts (student_id, vocab_source_id) where vocab_source_id is not null;
--   drop table if exists attempt_reopens;
--   alter table attempts drop column if exists superseded_at;
-- =============================================================================

-- =============================================================================
-- 1. attempts.superseded_at
-- =============================================================================

alter table attempts
  add column if not exists superseded_at timestamptz;

create index if not exists attempts_superseded_idx on attempts (superseded_at);

-- =============================================================================
-- 2. Re-point the three "one attempt per student per target, ever" partial
--    unique indexes so a superseded attempt no longer blocks a fresh one.
--
-- Original definitions (unchanged predicate carried forward verbatim, plus
-- the new `and superseded_at is null` clause):
--   attempts_one_per_student_test      — 0008_test_share_and_single_attempt.sql:22-24
--   attempts_one_per_student_html_test — 0014_html_test_attempts.sql:29-31
--   attempts_one_per_student_vocab     — 0016_vocab_attempts.sql:33-35
--
-- Dropped and recreated inside this migration's single implicit transaction
-- (a bare .sql file run by `supabase migration up` executes as one
-- transaction), so there is no window between drop and create where a second
-- insert for the same student+target could slip past the uniqueness guarantee.
-- Same index names, so nothing that references them by name breaks.
-- =============================================================================

drop index if exists attempts_one_per_student_test;
create unique index attempts_one_per_student_test
  on attempts (student_id, test_id)
  where test_id is not null and superseded_at is null;

drop index if exists attempts_one_per_student_html_test;
create unique index attempts_one_per_student_html_test
  on attempts (student_id, html_test_id)
  where html_test_id is not null and superseded_at is null;

drop index if exists attempts_one_per_student_vocab;
create unique index attempts_one_per_student_vocab
  on attempts (student_id, vocab_source_id)
  where vocab_source_id is not null and superseded_at is null;

-- =============================================================================
-- 3. attempt_reopens — append-only audit trail.
--
-- Modelled on points_ledger (0001_schema.sql:379-387): insert-only, never
-- updated or deleted by anything except a future additive migration. Holds no
-- student-authored content (no answers, no scores) but it does name students,
-- so: no anon access at all; readable by is_teacher(); writable ONLY through
-- reopen_test_attempt() below — DML is revoked from `authenticated` the same
-- way 0034_revoke_attempt_writes.sql revoked write verbs on `attempts` itself,
-- so the only path that can ever insert a row is the SECURITY DEFINER RPC.
--
-- attempt_id deliberately has NO `on delete cascade`. The default (NO ACTION)
-- means an attempt can never be deleted out from under its audit trail
-- silently — an audit row must never be erasable as a side effect of deleting
-- something else. This is exactly the argument 0035_schema_hardening.sql made
-- for attempt_answers.question_id's foreign key.
-- =============================================================================

create table if not exists attempt_reopens (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references attempts (id),
  student_id  uuid not null references profiles (id),
  reopened_by uuid not null references profiles (id),
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists attempt_reopens_attempt_idx on attempt_reopens (attempt_id);
create index if not exists attempt_reopens_student_idx on attempt_reopens (student_id);

alter table attempt_reopens enable row level security;

drop policy if exists attempt_reopens_select on attempt_reopens;
create policy attempt_reopens_select on attempt_reopens for select
  using (is_teacher());

-- No insert/update/delete policy is created — RLS default-denies every write
-- for every role with no matching policy, and the table-level DML grants are
-- revoked below on top of that as defense in depth (same "policy alone can't
-- stop it" reasoning 0034 documents at length). The only writer is
-- reopen_test_attempt(), which is SECURITY DEFINER and therefore runs as the
-- function owner, unaffected by these revokes.

revoke insert, update, delete on public.attempt_reopens from authenticated, anon;
-- SELECT stays governed by RLS (attempt_reopens_select, is_teacher() only);
-- `authenticated` keeps the table-level SELECT grant it gets by default under
-- Supabase's standard schema grants, same as every other RLS-protected table
-- in this schema — the policy above is what actually restricts which rows a
-- non-teacher sees (i.e. none).

-- =============================================================================
-- 4. reopen_test_attempt(p_attempt_id, p_reason) — ADMIN-only.
--
-- ADMIN check copied byte-for-byte in spirit from set_test_published
-- (0031_publish_gate.sql:239-244): read profiles.role for auth.uid(), raise
-- 42501 if not exactly 'ADMIN'. Deliberately NOT is_teacher() — that helper
-- returns true for TEACHER too (0002_rls.sql), and re-opening a test is an
-- admin-only power, consistent with requireAdmin() in
-- src/lib/admin-guard.ts:6-9 ("Full control over students is a real-ADMIN
-- power, not the TEACHER/ADMIN merge used elsewhere").
--
-- Refusals, each a distinct non-leaking error (P0002-style convention used
-- throughout 0031):
--   * attempt does not exist                       -> 'Attempt not found.'
--   * attempt targets neither test_id nor           -> 'Only test and hosted-
--     html_test_id (i.e. it's a vocab or task           test attempts can be
--     attempt)                                          reopened.'
--   * attempt already superseded (double reopen)    -> 'Attempt already reopened.'
--   * attempt not yet submitted (nothing to reopen) -> 'Attempt not submitted yet.'
--
-- WHY THE KIND CHECK: `attempts` can target task_id, test_id, html_test_id, or
-- vocab_source_id (attempts_target_ck, 0016_vocab_attempts.sql:22-25), but only
-- the DB-test rail (test_id, via share_test_questions/share_attempt_state/
-- start_share_attempt in section 5) and the hosted rail (html_test_id, via
-- start_share_html_attempt) have a re-entry path that lets a student actually
-- retake after superseding. A vocab attempt has none: activity-exp.ts's
-- selection of the latest vocab attempt (src/lib/data/activity-exp.ts:98) has
-- no superseded_at filter, so it would keep finding the superseded row, treat
-- it as already submitted, and give the student no way to retake — while the
-- old result has already been excluded from progress by this same function.
-- That leaves the student strictly worse off than before the "reopen". A task
-- attempt has no re-entry path at all. DO NOT widen this to task_id/
-- vocab_source_id without first building their re-entry paths (and, for
-- vocab, fixing activity-exp.ts's superseded_at gap) — otherwise this
-- "feature" strands students instead of helping them.
--
-- Effects, in one transaction:
--   * attempts.superseded_at := now() on that attempt only, via a
--     compare-and-swap (`update ... where superseded_at is null`) so two
--     concurrent admin calls can't both "win" and both write an audit row —
--     same pattern finalize_test_attempt uses to claim an attempt exactly
--     once (0019_finalize_attempt_rpc.sql:52-57). Whichever call's UPDATE
--     actually flips the row is the only one that inserts into
--     attempt_reopens; the loser sees 0 rows affected and raises the same
--     "already reopened" error a plain double-reopen would.
--   * results.excluded_from_progress := true on that attempt's result, IF one
--     exists (a PENDING_REVIEW writing/speaking attempt may not have a result
--     row's skill scores finalized in every shape, but a results row always
--     exists once finalize_*_attempt has run — this UPDATE is a no-op if
--     somehow no result row exists yet, never an error).
--   * one attempt_reopens row recording reopened_by = auth.uid() — written
--     exactly once per real reopen, never per losing/duplicate call.
-- Nothing is deleted. No other column on attempts or results is touched.
-- =============================================================================

create or replace function reopen_test_attempt(p_attempt_id uuid, p_reason text default null)
returns table (
  attempt_id uuid,
  student_id uuid
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_role       text;
  v_attempt    attempts%rowtype;
  v_claimed_id uuid;
begin
  select p.role::text into v_role from profiles p where p.id = auth.uid();
  if v_role is distinct from 'ADMIN' then
    raise exception 'Only admins reopen test attempts.' using errcode = '42501';
  end if;

  select * into v_attempt from attempts a where a.id = p_attempt_id;
  if not found then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;

  -- Kind check FIRST, before any mutation below. Only the DB-test and hosted
  -- rails have a working re-entry path after superseding (see the WHY THE
  -- KIND CHECK comment above the function header) — a vocab or task attempt
  -- has none, so refuse it here rather than strand the student.
  if v_attempt.test_id is null and v_attempt.html_test_id is null then
    raise exception 'Only test and hosted-test attempts can be reopened.' using errcode = 'P0002';
  end if;

  if v_attempt.superseded_at is not null then
    raise exception 'Attempt already reopened.' using errcode = 'P0002';
  end if;

  if v_attempt.submitted_at is null then
    raise exception 'Attempt not submitted yet.' using errcode = 'P0002';
  end if;

  -- Compare-and-swap: only the caller whose UPDATE actually flips
  -- superseded_at from null gets to proceed to the audit insert below. This
  -- mirrors finalize_test_attempt's claim of an attempt exactly once
  -- (0019_finalize_attempt_rpc.sql:52-57) and closes the race where two
  -- concurrent reopen calls could both pass the `is not null` check above
  -- (read without locking) and both write an attempt_reopens row.
  update attempts
     set superseded_at = now()
   where id = p_attempt_id
     and superseded_at is null
  returning id into v_claimed_id;

  if v_claimed_id is null then
    -- Lost the race: some other concurrent call already superseded this
    -- attempt between our read above and our UPDATE. Same user-facing error
    -- as the plain double-reopen check — no audit row, no further writes.
    raise exception 'Attempt already reopened.' using errcode = 'P0002';
  end if;

  update results
     set excluded_from_progress = true
   where attempt_id = p_attempt_id;

  insert into attempt_reopens (attempt_id, student_id, reopened_by, reason)
  values (p_attempt_id, v_attempt.student_id, auth.uid(), p_reason);

  return query select v_attempt.id, v_attempt.student_id;
end;
$$;

revoke all on function reopen_test_attempt(uuid, text) from public, anon;
grant execute on function reopen_test_attempt(uuid, text) to authenticated;

-- =============================================================================
-- 5. Re-point every gate that keys on submitted_at so it ignores superseded
--    attempts. Each function below preserves its exact signature and return
--    shape from its prior migration; only the WHERE-clause logic changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5a. share_test_questions(p_token) — 0033_share_questions_submitted_gate.sql.
--     This is the real content gate: without this change, reopening an
--     attempt at the database level would not actually let the student see
--     the question bank again. The prior predicate blocked entry on ANY
--     submitted attempt; it must now only block on a submitted attempt that
--     is NOT superseded — a superseded attempt is exactly the history a
--     reopen is supposed to move past.
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
    and (
      is_teacher()
      or not exists (
        select 1
        from attempts a
        where a.test_id = t.id
          and a.student_id = auth.uid()
          and a.submitted_at is not null
          and a.superseded_at is null
      )
    )
  order by 2;
$$;

revoke all on function share_test_questions(text) from public, anon;
grant execute on function share_test_questions(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. share_attempt_state(p_token) — 0032_share_attempt_state.sql.
--     Must stop reporting "already completed" for a superseded attempt, or
--     the render-time gate in /t/[token] would keep refusing entry even after
--     an admin reopened it. Scoped to the live (non-superseded) attempt only.
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
    return;
  end if;

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
    where a.student_id = v_uid
      and a.test_id = v_test_id
      and a.superseded_at is null;
end;
$$;

revoke all on function share_attempt_state(text) from public, anon;
grant execute on function share_attempt_state(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5c. start_share_attempt(p_token) — 0031_publish_gate.sql:136-179.
--     The `insert ... on conflict do nothing` has no explicit conflict target,
--     so it resolves against whichever unique constraint/index the new row
--     would violate — i.e. attempts_one_per_student_test as re-pointed in
--     section 2 above (now `where test_id is not null and superseded_at is
--     null`). A superseded attempt no longer satisfies that predicate, so it
--     no longer participates in the conflict: the insert proceeds and a fresh
--     attempt row is created for the student, exactly as intended.
--
--     The trailing SELECT, however, previously had no superseded_at filter.
--     Once a superseded row and a fresh row can coexist for the same
--     student+test, that SELECT could return BOTH rows, and callers that
--     expect a single attempt (the RSC page, TestTaker) would receive an
--     ambiguous result. Narrowed to the live attempt only.
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

  if not v_test.published then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;

  insert into attempts (student_id, test_id)
  values (v_uid, v_test.id)
  on conflict do nothing;

  return query
    select a.id, v_test.id, a.started_at, a.submitted_at, v_test.time_limit_sec
    from attempts a
    where a.student_id = v_uid
      and a.test_id = v_test.id
      and a.superseded_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5d. start_share_html_attempt(p_token) — 0031_publish_gate.sql:181-223.
--     Same reasoning as 5c, applied to attempts_one_per_student_html_test.
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
    return;
  end if;

  if not v_test.published then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;

  insert into attempts (student_id, html_test_id)
  values (v_uid, v_test.id)
  on conflict do nothing;

  return query
    select a.id, v_test.id, a.submitted_at
    from attempts a
    where a.student_id = v_uid
      and a.html_test_id = v_test.id
      and a.superseded_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5e. finalize_test_attempt (0019) / finalize_html_test_attempt (0036) —
--     CHECKED, NOT MODIFIED.
--
--     Both claim their attempt with:
--       update attempts set submitted_at = now()
--        where id = p_attempt_id and student_id = p_student_id
--          and submitted_at is null [and html_test_id is not null]
--     A superseded attempt's submitted_at is NEVER nulled by this migration
--     (that is the entire point of "supersede, don't overwrite" — see the
--     header). So a superseded attempt already fails `submitted_at is null`
--     on its own, with no help needed from a superseded_at check: it was
--     claimed and finalized once, its submitted_at has stayed non-null since,
--     and it can never be re-claimed by either function. The idempotent
--     "already submitted" branch in each function looks up
--     `results r where r.attempt_id = p_attempt_id` — a lookup scoped to one
--     specific attempt id, not ambiguous across superseded/live rows. Neither
--     function needs a superseded_at clause added; both are left byte-
--     identical to 0019/0036.
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Verification — fail loudly if any invariant above did not take.
-- =============================================================================

do $$
begin
  -- #1 — superseded_at column exists and defaults to null.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'attempts' and column_name = 'superseded_at'
  ) then
    raise exception '0037 invariant violated: attempts.superseded_at was not created';
  end if;

  -- #2 — the three partial unique indexes must now include the
  -- superseded_at is null predicate.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'attempts_one_per_student_test'
       and indexdef like '%superseded_at IS NULL%'
  ) then
    raise exception '0037 invariant violated: attempts_one_per_student_test does not exclude superseded attempts';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'attempts_one_per_student_html_test'
       and indexdef like '%superseded_at IS NULL%'
  ) then
    raise exception '0037 invariant violated: attempts_one_per_student_html_test does not exclude superseded attempts';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'attempts_one_per_student_vocab'
       and indexdef like '%superseded_at IS NULL%'
  ) then
    raise exception '0037 invariant violated: attempts_one_per_student_vocab does not exclude superseded attempts';
  end if;

  -- #3 — attempt_reopens exists, RLS enabled, no DML for authenticated/anon.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'attempt_reopens'
  ) then
    raise exception '0037 invariant violated: attempt_reopens was not created';
  end if;

  if not (
    select relrowsecurity from pg_class
     where oid = 'public.attempt_reopens'::regclass
  ) then
    raise exception '0037 invariant violated: attempt_reopens does not have RLS enabled';
  end if;

  if has_table_privilege('authenticated', 'public.attempt_reopens', 'INSERT') then
    raise exception '0037 invariant violated: authenticated can INSERT into attempt_reopens directly';
  end if;
  if has_table_privilege('authenticated', 'public.attempt_reopens', 'UPDATE') then
    raise exception '0037 invariant violated: authenticated can UPDATE attempt_reopens directly';
  end if;
  if has_table_privilege('authenticated', 'public.attempt_reopens', 'DELETE') then
    raise exception '0037 invariant violated: authenticated can DELETE attempt_reopens directly';
  end if;
  if has_table_privilege('anon', 'public.attempt_reopens', 'INSERT') then
    raise exception '0037 invariant violated: anon can INSERT into attempt_reopens directly';
  end if;

  -- #4 — reopen_test_attempt exists, is admin-gated (no anon execute), and
  -- authenticated can call it (the ADMIN check inside is the real gate, same
  -- pattern as set_test_published in 0031).
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reopen_test_attempt'
  ) then
    raise exception '0037 invariant violated: reopen_test_attempt was not created';
  end if;
  if has_function_privilege('anon', 'public.reopen_test_attempt(uuid, text)', 'execute') then
    raise exception '0037 invariant violated: anon must not execute reopen_test_attempt';
  end if;
  if not has_function_privilege('authenticated', 'public.reopen_test_attempt(uuid, text)', 'execute') then
    raise exception '0037 invariant violated: authenticated must be able to execute reopen_test_attempt';
  end if;

  -- #4b — reopen_test_attempt's source must still contain the kind guard
  -- (Finding 1) and the compare-and-swap claim (Finding 2). Structural
  -- pattern checks, same spirit as the indexdef checks in #2 above: cheap,
  -- and they fail loudly if a future edit strips either fix back out.
  if pg_get_functiondef('public.reopen_test_attempt(uuid, text)'::regprocedure)
       not like '%v_attempt.test_id is null and v_attempt.html_test_id is null%' then
    raise exception '0037 invariant violated: reopen_test_attempt no longer refuses non-test/html_test attempts';
  end if;
  if pg_get_functiondef('public.reopen_test_attempt(uuid, text)'::regprocedure)
       not like '%where id = p_attempt_id%and superseded_at is null%returning id into v_claimed_id%' then
    raise exception '0037 invariant violated: reopen_test_attempt no longer claims supersession with a compare-and-swap';
  end if;

  -- #5 — the four re-pointed gate functions still exist and are still closed
  -- to anon, open to authenticated (same shape as 0031/0032/0033).
  if has_function_privilege('anon', 'public.share_test_questions(text)', 'execute') then
    raise exception '0037 invariant violated: anon must not execute share_test_questions';
  end if;
  if not has_function_privilege('authenticated', 'public.share_test_questions(text)', 'execute') then
    raise exception '0037 invariant violated: authenticated must be able to execute share_test_questions';
  end if;
  if has_function_privilege('anon', 'public.share_attempt_state(text)', 'execute') then
    raise exception '0037 invariant violated: anon must not execute share_attempt_state';
  end if;
  if not has_function_privilege('authenticated', 'public.share_attempt_state(text)', 'execute') then
    raise exception '0037 invariant violated: authenticated must be able to execute share_attempt_state';
  end if;

  raise notice '0037_reopen_attempt.sql: all invariants verified.';
end $$;
