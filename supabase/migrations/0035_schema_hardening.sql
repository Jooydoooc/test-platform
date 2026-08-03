-- =============================================================================
-- 0035_schema_hardening.sql
-- Four independent hardening fixes surfaced by a schema/RLS audit. Each
-- section is additive/idempotent and none of them delete, truncate, or
-- rewrite a single row of application data — profiles, attempts, results,
-- points_ledger, and every other data table are untouched. Only function
-- privileges, one foreign-key constraint's delete action, and one RLS
-- policy's clauses change.
-- =============================================================================

-- =============================================================================
-- 1. Lock down the four original RLS helper functions from 0002_rls.sql
--
-- is_teacher(), owns_group(uuid), teaches_student(uuid), and in_group(uuid)
-- are SECURITY DEFINER with no REVOKE, so Postgres's default leaves EXECUTE
-- granted to PUBLIC (any role, including anon, can call them directly over
-- PostgREST rpc()). Every later SECURITY DEFINER function in this repo
-- (0019, 0025, 0031) follows `revoke all ... from public, anon; grant
-- execute ... to authenticated;` — these four predate that convention and
-- were never retrofitted. Impact today is low (each just returns a boolean
-- derived from the caller's own auth.uid() relationships — a student calling
-- teaches_student(<any uuid>) only ever gets `false`), but leaving PUBLIC
-- execute open on them is an inconsistency worth closing.
--
-- THE RLS-SAFETY QUESTION — read before touching this:
-- These four functions are called FROM INSIDE row-level-security policy
-- expressions (see `using (is_teacher())`, `using (owns_group(group_id))`,
-- etc. throughout 0002_rls.sql, 0004, 0005, 0012, 0025, 0031). Revoking
-- EXECUTE from a role and then having a policy invoke the function while
-- evaluating a query FOR THAT ROLE would raise "permission denied for
-- function" and abort the query — i.e. a wrong revoke here does not just
-- fail to tighten security, it can take down every policy that references
-- the function, for every affected role, platform-wide.
--
-- Postgres does not exempt SECURITY DEFINER functions referenced by a policy
-- from the normal EXECUTE-privilege check: the check is against the role
-- executing the outer query (the one the policy is being evaluated for), not
-- against the function owner or the policy owner, and SECURITY DEFINER only
-- changes whose privileges the FUNCTION BODY runs with once it starts — it
-- does not waive the EXECUTE grant needed to invoke it in the first place.
-- So `authenticated` MUST keep EXECUTE (it is the role every signed-in
-- browser request runs as, and is_teacher()/owns_group()/etc. are evaluated
-- for it on nearly every table in the schema).
--
-- `anon` is less obvious, and this migration resolves the doubt
-- conservatively rather than betting the platform on it: 0030 established
-- (and this file's own verification block re-checks) that `anon` holds zero
-- SELECT/INSERT/UPDATE/DELETE grants on any table in `public` — this is a
-- closed, sign-in-required platform, so no anon-executed query should ever
-- reach a policy that calls these helpers. That makes granting EXECUTE to
-- anon low-risk (each function only echoes auth.uid()-derived booleans, and
-- anon has no table access to combine that with). But "should never reach"
-- is a claim about every OTHER migration's grants staying disciplined
-- forever, and a wrong revoke here fails catastrophically (locks live RLS
-- policies for whichever role loses EXECUTE) versus a wrong grant here
-- failing safely (anon already can't read/write the tables these policies
-- protect). Given that asymmetry, EXECUTE is granted to BOTH `authenticated`
-- AND `anon` — matching PUBLIC's current effective behaviour for these four
-- functions specifically, while still replacing the implicit "everyone via
-- PUBLIC" grant with an explicit, auditable, per-role one.
-- =============================================================================

revoke all on function is_teacher() from public, anon;
revoke all on function owns_group(uuid) from public, anon;
revoke all on function teaches_student(uuid) from public, anon;
revoke all on function in_group(uuid) from public, anon;

grant execute on function is_teacher() to authenticated, anon;
grant execute on function owns_group(uuid) to authenticated, anon;
grant execute on function teaches_student(uuid) to authenticated, anon;
grant execute on function in_group(uuid) to authenticated, anon;

-- =============================================================================
-- 2. attempt_answers.question_id — give the FK an explicit ON DELETE RESTRICT
--
-- 0001_schema.sql declares `question_id uuid not null references questions
-- (id)` with no ON DELETE clause, which defaults to NO ACTION. `questions`
-- itself cascades from `tasks` (tasks -> task deletion cascades to
-- questions), so deleting a task whose questions already have graded
-- attempt_answers raises an FK violation and aborts the transaction. Today
-- the only path that deletes questions (src/lib/data/publish-test.ts)
-- pre-checks attempt count and refuses before it ever reaches the database,
-- so the NO ACTION default is not reachable in practice — but it resurfaces
-- the moment any future code path issues a raw delete without that guard.
--
-- Two real options, and only one is compatible with the platform's hard rule
-- that student data is never removed/dropped/truncated/overwritten (live
-- students in prod):
--   * ON DELETE CASCADE would silently destroy a student's graded answers
--     the instant someone deletes the question they answered — exactly the
--     kind of data loss that rule exists to prevent, and it would happen
--     invisibly (no error, no chance to notice before it's gone).
--   * ON DELETE RESTRICT makes today's already-happening refusal an
--     explicit, guaranteed database-level invariant instead of an
--     application-layer courtesy that the next code path might forget to
--     replicate. It changes nothing about current behaviour (the app-layer
--     check already refuses first) and closes the gap for any future path
--     that doesn't add its own check.
--
-- RESTRICT is the only choice that protects student data, so that's what
-- this migration applies. NO ACTION and RESTRICT differ only in whether the
-- check can be deferred to end-of-transaction (NO ACTION can be, if declared
-- DEFERRABLE; RESTRICT never can) — nothing in this schema declares the
-- constraint DEFERRABLE, so this is a no-op for current behaviour and only
-- makes the intent explicit and immune to a future DEFERRABLE change.
--
-- Guarded: dropping and re-adding a constraint is not additive in the
-- strictest sense, so this only fires if the constraint exists with the
-- old (NO ACTION / confdeltype = 'a') behaviour. It never touches a row —
-- only the constraint's delete-action metadata changes. Re-running this
-- migration is a no-op the second time (confdeltype will already be 'r').
-- =============================================================================

do $$
declare
  v_conname     text;
  v_confdeltype "char";
begin
  select c.conname, c.confdeltype
    into v_conname, v_confdeltype
  from pg_constraint c
  join pg_class     t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
  where n.nspname = 'public'
    and t.relname = 'attempt_answers'
    and c.contype = 'f'
    and array_length(c.conkey, 1) = 1
    and a.attname = 'question_id';

  if v_conname is not null and v_confdeltype = 'a' then
    execute format('alter table public.attempt_answers drop constraint %I', v_conname);
    alter table public.attempt_answers
      add constraint attempt_answers_question_id_fkey
      foreign key (question_id) references public.questions (id) on delete restrict;
  end if;
end $$;

-- =============================================================================
-- 3. books_write — make USING enforce ownership consistently with WITH CHECK
--
-- 0005_uploaded_books.sql:
--   using (is_teacher()) with check (is_teacher() and created_by = auth.uid())
--
-- USING gates which existing rows an UPDATE/DELETE may target, and it only
-- checks is_teacher() — so any admin can target ANY book, not just their
-- own. WITH CHECK only constrains the shape of the row a write is allowed to
-- leave behind (its created_by must equal the writer), which does not stop
-- an admin from:
--   * DELETE-ing another admin's book outright (DELETE only ever evaluates
--     USING; WITH CHECK plays no part in a delete), or
--   * UPDATE-ing another admin's book by rewriting its created_by to their
--     own id in the same statement, satisfying WITH CHECK while hijacking
--     ownership of a row USING should never have let them touch.
--
-- Low impact today (TEACHER was retired to ADMIN in 0010, so there is
-- effectively one privileged tier and one real "owner" concept), but wrong
-- as written, and it stops being harmless the moment a second admin account
-- exists.
--
-- Decision: enforce ownership on both sides. `books` already tracks
-- `created_by` and WITH CHECK already treats it as the ownership boundary —
-- unlike the shared platform-content tables (textbooks/units/lessons/tasks/
-- questions/tests/etc. in 0002_rls.sql), which have no created_by column at
-- all and are deliberately writable by any is_teacher() caller because they
-- are shared curriculum, not one admin's property. Books, tests-in-progress
-- via `feedback` (0002_rls.sql's `feedback_update`: `using (author_id =
-- auth.uid()) with check (author_id = auth.uid())`) are the existing house
-- pattern for author-owned rows in this schema: symmetric USING/WITH CHECK
-- on the ownership column. Matching that pattern here — rather than
-- widening books to "any admin manages any book," which nothing in the
-- product (src/app/api/books/route.ts, src/app/admin/books/page.tsx) or any
-- migration comment asks for — is the change that is actually consistent
-- with how this schema already treats author/creator-owned content.
-- (If a future requirement needs cross-admin book management, that should
-- be a deliberate, explicit policy change — e.g. an `is_admin_superuser()`
-- carve-out — not a silent side effect of an asymmetric USING clause.)
-- =============================================================================

drop policy if exists books_write on books;
create policy books_write on books for all
  using (is_teacher() and created_by = auth.uid())
  with check (is_teacher() and created_by = auth.uid());

-- =============================================================================
-- 4. group_xp_leaderboard() — push group scoping into the streak CTEs
--
-- Current definition (0023_soft_delete_profiles.sql): the active_days /
-- islands / current_streak CTEs run
--   select distinct pl.student_id, ... from points_ledger pl
-- with NO filter at all, so they scan and window-function over EVERY
-- student's ledger platform-wide on every call, even though the outer query
-- only ever returns rows for the caller's own group (plus themself). Cost
-- scales with the whole platform's ledger instead of the group being viewed
-- — every dashboard and leaderboard load pays that full-table cost.
-- points_ledger_student_created_idx (student_id, created_at), added in
-- 0001_schema.sql, exists specifically to serve a per-student-scoped query
-- and goes unused by the current unscoped CTEs.
--
-- Fix: compute the caller's eligible student set ONCE, in a new `scope` CTE
-- that is a byte-for-byte copy of the final WHERE clause's eligibility logic
-- (role = STUDENT, not soft-deleted, self OR same group as caller), then
-- join `active_days` (and therefore `islands` and `current_streak`, which
-- both derive from it) to `scope` before the distinct/window-function work
-- happens. The outer query's `profiles p ... where ...` is replaced with
-- `profiles p join scope s on s.id = p.id`, which selects exactly the same
-- rows the old cross-join-me + WHERE combination did.
--
-- Everything else — column list, column names, types, volatility, security
-- model, the xp_total/xp_week/xp_month aggregation logic, streak
-- computation logic, soft-delete handling, and the final
-- `order by xp_total desc, activity_count desc, display_name asc, p.id asc`
-- tie-break — is preserved verbatim from 0023. The returned rows and column
-- names are byte-identical to before; only which rows of points_ledger get
-- scanned to produce them changes. This RPC is consumed by
-- src/lib/database.types.ts's mirrored signature and by the leaderboard/
-- dashboard callers, none of which are touched by this migration.
-- =============================================================================

create or replace function group_xp_leaderboard()
returns table (
  student_id     uuid,
  display_name   text,
  xp_total       bigint,
  xp_week        bigint,
  xp_month       bigint,
  streak         int,
  activity_count int,
  is_me          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select group_id from profiles where id = auth.uid()
  ),
  scope as (
    -- Exactly the eligibility rule the old version applied only in the final
    -- WHERE clause, computed once so it can be pushed into the ledger CTEs
    -- below instead of scanning points_ledger platform-wide.
    select p.id
    from profiles p
    cross join me
    where p.role = 'STUDENT'
      and p.deleted_at is null
      and (
        p.id = auth.uid()
        or (me.group_id is not null and p.group_id = me.group_id)
      )
  ),
  active_days as (
    -- One row per (student, UTC calendar day) — duplicates on the same day
    -- are collapsed so each active day counts once. Scoped to `scope` so
    -- this only scans the caller's group instead of every student platform-
    -- wide (uses points_ledger_student_created_idx via the student_id join).
    select distinct pl.student_id,
                    (pl.created_at at time zone 'UTC')::date as d
    from points_ledger pl
    join scope s on s.id = pl.student_id
  ),
  islands as (
    -- Gaps-and-islands: consecutive dates share a constant grp value
    -- (d minus its per-student ascending row-number).
    select
      student_id,
      d,
      (d - (row_number() over (partition by student_id order by d))::int) as grp
    from active_days
  ),
  current_streak as (
    -- For each student, find the island whose most-recent day is today or
    -- yesterday (UTC).  That island's size is the current streak.
    -- The HAVING clause ensures we only return a row when the streak is active.
    select student_id, count(*)::int as streak
    from islands
    group by student_id, grp
    having max(d) >= (now() at time zone 'UTC')::date - 1
       and max(d) <= (now() at time zone 'UTC')::date
  )
  select
    p.id,
    trim(p.first_name || ' ' || p.last_name)                              as display_name,
    coalesce(sum(pl.points), 0)                                           as xp_total,
    coalesce(sum(pl.points) filter (
      where pl.created_at >= now() - interval '7 days'), 0)               as xp_week,
    coalesce(sum(pl.points) filter (
      where pl.created_at >= now() - interval '30 days'), 0)              as xp_month,
    coalesce(max(cs.streak), 0)::int                                      as streak,
    count(pl.id)::int                                                     as activity_count,
    (p.id = auth.uid())                                                   as is_me
  from profiles p
  join scope s on s.id = p.id
  left join points_ledger pl on pl.student_id = p.id
  left join current_streak cs on cs.student_id = p.id
  group by p.id, p.first_name, p.last_name
  -- p.id is the final deterministic tiebreak (display_name can collide).
  order by xp_total desc, activity_count desc, display_name asc, p.id asc;
$$;

-- Grant preserved verbatim from 0023 (CREATE OR REPLACE keeps existing
-- grants, but restating it explicitly matches this repo's convention of
-- every re-creation of a SECURITY DEFINER function restating its own grant).
grant execute on function group_xp_leaderboard() to authenticated;

-- =============================================================================
-- Verification — fail loudly if any invariant above did not take.
-- =============================================================================

do $$
declare
  v_conname     text;
  v_confdeltype "char";
begin
  -- #1a — PUBLIC must no longer hold EXECUTE on any of the four helpers.
  if has_function_privilege('public', 'public.is_teacher()', 'EXECUTE') then
    raise exception '0035 invariant violated: public can still EXECUTE is_teacher()';
  end if;
  if has_function_privilege('public', 'public.owns_group(uuid)', 'EXECUTE') then
    raise exception '0035 invariant violated: public can still EXECUTE owns_group(uuid)';
  end if;
  if has_function_privilege('public', 'public.teaches_student(uuid)', 'EXECUTE') then
    raise exception '0035 invariant violated: public can still EXECUTE teaches_student(uuid)';
  end if;
  if has_function_privilege('public', 'public.in_group(uuid)', 'EXECUTE') then
    raise exception '0035 invariant violated: public can still EXECUTE in_group(uuid)';
  end if;

  -- #1b — authenticated (every signed-in request; RLS policies depend on
  -- this) must still be able to call all four, or every policy referencing
  -- them breaks for every signed-in user.
  if not has_function_privilege('authenticated', 'public.is_teacher()', 'EXECUTE') then
    raise exception '0035 regression: authenticated lost EXECUTE on is_teacher()';
  end if;
  if not has_function_privilege('authenticated', 'public.owns_group(uuid)', 'EXECUTE') then
    raise exception '0035 regression: authenticated lost EXECUTE on owns_group(uuid)';
  end if;
  if not has_function_privilege('authenticated', 'public.teaches_student(uuid)', 'EXECUTE') then
    raise exception '0035 regression: authenticated lost EXECUTE on teaches_student(uuid)';
  end if;
  if not has_function_privilege('authenticated', 'public.in_group(uuid)', 'EXECUTE') then
    raise exception '0035 regression: authenticated lost EXECUTE on in_group(uuid)';
  end if;

  -- #1c — anon deliberately keeps EXECUTE on these four (see reasoning
  -- above) but must still hold zero DML on the underlying tables, i.e. this
  -- grant must remain inert. Re-assert 0030's anon-DML invariant here so a
  -- regression in either migration's ordering is still caught.
  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception '0035 invariant violated: anon holds DML on a public table — EXECUTE grant on RLS helpers is no longer provably inert';
  end if;

  -- #2 — attempt_answers.question_id FK must now be ON DELETE RESTRICT
  -- (confdeltype = 'r'), never CASCADE ('c') and never left as NO ACTION
  -- ('a').
  select c.conname, c.confdeltype
    into v_conname, v_confdeltype
  from pg_constraint c
  join pg_class     t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
  where n.nspname = 'public'
    and t.relname = 'attempt_answers'
    and c.contype = 'f'
    and array_length(c.conkey, 1) = 1
    and a.attname = 'question_id';

  if v_conname is null then
    raise exception '0035 invariant violated: attempt_answers.question_id has no foreign key constraint';
  end if;
  if v_confdeltype = 'c' then
    raise exception '0035 invariant violated: attempt_answers.question_id FK is ON DELETE CASCADE (would silently destroy graded student answers)';
  end if;
  if v_confdeltype <> 'r' then
    raise exception '0035 invariant violated: attempt_answers.question_id FK is not ON DELETE RESTRICT (found confdeltype=%)', v_confdeltype;
  end if;

  -- #3 — books_write must enforce created_by ownership in BOTH the USING
  -- and WITH CHECK clauses (not just WITH CHECK).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'books'
      and policyname = 'books_write'
      and qual like '%created_by%'
      and with_check like '%created_by%'
  ) then
    raise exception '0035 invariant violated: books_write does not enforce created_by ownership in both USING and WITH CHECK';
  end if;

  -- #4a — group_xp_leaderboard() must still exist with the exact same
  -- return signature (byte-identical columns/types/order) callers depend on.
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'group_xp_leaderboard'
      and pg_get_function_result(p.oid) =
        'TABLE(student_id uuid, display_name text, xp_total bigint, xp_week bigint, xp_month bigint, streak integer, activity_count integer, is_me boolean)'
  ) then
    raise exception '0035 invariant violated: group_xp_leaderboard() return signature changed';
  end if;

  -- #4b — authenticated must still be able to call it (every leaderboard /
  -- dashboard load depends on this).
  if not has_function_privilege('authenticated', 'public.group_xp_leaderboard()', 'EXECUTE') then
    raise exception '0035 regression: authenticated lost EXECUTE on group_xp_leaderboard()';
  end if;

  raise notice '0035_schema_hardening.sql: all invariants verified.';
end $$;
