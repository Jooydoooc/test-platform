-- =============================================================================
-- 0030_explicit_data_api_grants.sql
-- Explicit Data API table/function grants — stop relying on auto-expose.
--
-- FINDING (verified against a fresh local DB built from 0001-0029):
--   `authenticated` had SELECT on 0 of the 37 tables in `public`. Every request
--   from the browser client 403'd with "permission denied for table <x>", even
--   though every table has RLS policies that would otherwise allow the read.
--
--   No migration in this chain ever issues a table-level GRANT to `authenticated`
--   or `anon` (0018/0019/0025-0028 only ever REVOKE, or GRANT EXECUTE on specific
--   RPC functions). The app has only ever worked because Supabase's classic
--   default is to auto-expose newly created `public` tables to the Data API
--   roles with full privileges, and RLS was written on the assumption that this
--   implicit grant already exists.
--
--   That reliance is expiring. supabase/config.toml documents
--   `auto_expose_new_tables`: when unset, new entities are NOT auto-exposed —
--   "matching the new cloud default" — and the config field itself is removed on
--   2026-10-30, at which point the always-revoked behaviour becomes permanent
--   everywhere, including any rebuild of production. Today's production project
--   still works because it was provisioned while the legacy behaviour applied;
--   a disaster-recovery rebuild, a staging clone, or a brand-new project created
--   from this migration chain would come up dead in the water.
--
-- WHAT THIS MIGRATION DOES:
--   Makes explicit, per table and per privilege, exactly what the Data API
--   roles need — derived from (a) each table's RLS policies in 0002_rls.sql and
--   the migrations that add to them, and (b) which of those operations the
--   browser-authenticated client (`createClient()`, not `createAdminClient()`)
--   actually performs, per src/lib/data/*.ts and src/app/**/route.ts. Where a
--   table's RLS technically allows a write (e.g. is_teacher() "for all") but
--   every real write in the app goes exclusively through the service-role admin
--   client or a SECURITY DEFINER RPC, `authenticated` gets SELECT only (or
--   nothing) — granting the unused write would only add attack surface with no
--   corresponding product need. `anon` gets nothing anywhere: this is a closed,
--   sign-in-required platform (see 0025's "closed platform" note), and no route
--   in the app serves data to a signed-out request.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   * No `GRANT ALL ON ALL TABLES` / `ALL FUNCTIONS` for `authenticated` or
--     `anon` — every privilege below is enumerated per table, per operation.
--   * No RLS policy is added, changed, or dropped. RLS stays the authoritative,
--     row-level gate; grants below are the table-level plumbing UNDER it.
--   * No REVOKE beyond what earlier migrations already established. Every
--     grant here was checked against the five standing security invariants
--     (listed just above the verification block) to confirm it does not widen
--     any of them; since none of the grants below touch profiles.role/
--     group_id, questions.answer_key, attempts INSERT, html_test_answer_keys,
--     or finalize_test_attempt, no new REVOKE is required to keep them true.
--   * No data, table, column or policy is dropped/altered. GRANT/REVOKE are
--     idempotent, so this file is safe to re-run on any environment, including
--     production, which has live student data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- service_role — the server-side admin client (createAdminClient()).
--
-- service_role already bypasses RLS by design (that's what makes it "admin");
-- it is never shipped to the browser (only the anon key is public), so a broad
-- grant here carries none of the risk a broad grant to authenticated/anon
-- would. It legitimately needs full table access: server-side grading reads
-- questions.answer_key (src/lib/data/submit.ts), attempt finalization writes
-- attempts/results/result_skill_scores/points_ledger (finalize_test_attempt,
-- called only via this client), and admin routes manage groups/profiles/books.
-- Verified locally: without these, the app cannot grade a single test.
-- ---------------------------------------------------------------------------

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Sequences — none needed for `authenticated`/`anon`.
--
-- Every table in 0001-0029 uses `uuid primary key default gen_random_uuid()`;
-- there is no `serial`/`identity`/sequence-backed column anywhere in the
-- schema (grep confirms zero `serial`/`identity`/`nextval` across all
-- migrations). Nothing for the Data API roles to insert against, so no
-- `grant usage, select on sequence ...` statements are needed or included.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- anon — the signed-out Data API role.
--
-- Lexora is a closed, sign-in-required platform: every RLS policy in
-- 0002_rls.sql, 0004, 0005, 0012 gates on `auth.uid() is not null` at the
-- loosest, and every server route in src/app that touches these tables calls
-- getServerUser()/requires a session before running a query. No page or route
-- serves a signed-out request against any table below. `anon` therefore gets
-- NO table privileges at all, on any table. (Nothing to grant in this section
-- — this comment IS the "nothing" the task's constraint #4 asks to justify.)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- authenticated — content tables readable by any signed-in user.
--
-- Each of these carries a `for select using (auth.uid() is not null)` policy
-- (0002_rls.sql / 0004_vocab_quiz.sql / 0005_uploaded_books.sql) and a
-- `for all using (is_teacher())` write policy. Grep of src/lib/data + src/app
-- shows every current WRITE to these specific tables goes exclusively through
-- createAdminClient() (service_role) — see publish-test.ts for
-- tasks/test_items, and no code path at all currently writes to textbooks,
-- units, lessons, topics, task_topics, vocabulary_sets, vocabulary_items,
-- vocab_item_topics, badges or words. Per the task's own rule ("when a table
-- is written ONLY via a SECURITY DEFINER RPC or the admin client, grant
-- authenticated SELECT only"), these get SELECT only — the RLS write policy
-- stays in place for is_teacher() callers using the admin client, unaffected
-- by this table-level grant either way.
-- ---------------------------------------------------------------------------

grant select on public.textbooks          to authenticated;
grant select on public.units              to authenticated;
grant select on public.lessons            to authenticated;
grant select on public.topics             to authenticated;
grant select on public.tasks              to authenticated;
grant select on public.task_topics        to authenticated;
grant select on public.test_items         to authenticated;
grant select on public.vocabulary_sets    to authenticated;
grant select on public.vocabulary_items   to authenticated;
grant select on public.vocab_item_topics  to authenticated;
grant select on public.badges             to authenticated;
grant select on public.words              to authenticated;

-- `questions` is DELIBERATELY untouched here. 0018_lock_privileged_columns.sql
-- already revoked table-level SELECT and granted column-level SELECT on every
-- column except `answer_key`. Re-granting table-level SELECT in this file
-- would silently undo that fix and leak answer_key to authenticated. The
-- verification block below re-asserts this invariant holds.

-- ---------------------------------------------------------------------------
-- authenticated — gated content: RLS filters rows, table grant is safe.
--
-- `groups`   : select using (owner_id = auth.uid() or in_group(id)). No write
--   grant: all confirmed writes (src/app/api/admin/groups/**) use the admin
--   client exclusively.
-- `tests` / `html_tests` : select policies rewritten by 0025 to require
--   is_teacher() OR an existing attempt row — "the link is the key". A table
--   grant is safe because RLS, not the grant, is what filters which rows come
--   back; a student with no attempt sees zero rows regardless of this grant.
--   `tests` gets SELECT only — every confirmed write (publish-test.ts) uses
--   the admin client. `html_tests` additionally gets INSERT: the admin upload
--   flow (src/app/api/tests/html/route.ts) inserts the row via the
--   session-bound `createClient()`, not the admin client, gated by
--   `html_tests_write` (is_teacher()) at the row level.
-- ---------------------------------------------------------------------------

grant select on public.groups     to authenticated;
grant select on public.tests      to authenticated;
grant select, insert on public.html_tests to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — uploaded books: confirmed authenticated-client CRUD.
--
-- src/app/api/books/route.ts performs INSERT/UPDATE/DELETE on `books` and
-- INSERT on its three child tables through the session-bound `createClient()`
-- (not the admin client) — RLS (`is_teacher()` + `created_by = auth.uid()` on
-- books) is the real gate; ADMIN-only in practice since TEACHER was retired
-- (0010). No direct UPDATE/DELETE on the child tables is performed by the
-- app (their rows are replaced by delete-and-reinsert on the parent, and
-- child rows drop via ON DELETE CASCADE when the book row is deleted), so
-- only SELECT + INSERT are granted for those three.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.books          to authenticated;
grant select, insert                 on public.book_questions to authenticated;
grant select, insert                 on public.book_passages  to authenticated;
grant select, insert                 on public.book_glossary  to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — student-owned progress tables (self-scoped, low risk).
--
-- `student_vocab_item_state` (RLS: select self/teaches, insert self, update
-- self) and `user_progress` (RLS: select self, insert self — no update policy
-- exists) are per-student recall/practice logs, not grading or XP records —
-- points_ledger (below) is what actually mints XP, via service_role only. A
-- student writing only their own rows here cannot forge a score or a badge,
-- so the grants below simply mirror what the RLS policies already allow.
-- Neither table currently has a confirmed caller in src/ (both predate the
-- newer vocab-store approach — see memory "Vocab redesign"), but granting
-- matches their RLS contract exactly and carries no meaningful risk if either
-- is revived.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.student_vocab_item_state to authenticated;
grant select, insert          on public.user_progress            to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — read-only self/teacher-scoped tables.
--
-- Every table below has ONLY a `select` RLS policy for authenticated (0002's
-- own comment: "Derived scoring rows ... are READ by student+teacher but
-- WRITTEN by the service role only"). There is no insert/update/delete policy
-- to grant against even if we wanted to — writes happen exclusively inside
-- finalize_test_attempt (0019, SECURITY DEFINER, owned by the migration role,
-- so it bypasses grants/RLS entirely and needs no authenticated grant to
-- work) or via the service-role admin client (activity-exp.ts, badges.ts,
-- exp.ts). Granting only SELECT here is therefore not a narrowing choice —
-- it is the complete set of privileges these tables' RLS defines.
-- ---------------------------------------------------------------------------

grant select on public.results             to authenticated;
grant select on public.result_skill_scores to authenticated;
grant select on public.result_topics       to authenticated;
grant select on public.badge_unlocks       to authenticated;
grant select on public.points_ledger       to authenticated;
grant select on public.streaks             to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — read-only, is_teacher()-gated write tables with zero
-- confirmed authenticated-client usage.
--
-- `assignments`, `student_task_overrides`, `weekly_challenges`, `feedback`
-- all have a self/group-scoped SELECT policy plus an is_teacher()-gated write
-- policy, but grep of src/lib/data + src/app finds NO `.from(...)` call
-- against any of the four anywhere in the app today (dead/future-feature
-- tables). Per the same "admin-client-only -> SELECT only" rule applied to
-- the content tables above, none of them get a write grant here; if/when a
-- write flow is built for one of these, that PR should add the specific
-- INSERT/UPDATE it actually needs rather than this migration guessing ahead
-- of the feature.
-- ---------------------------------------------------------------------------

grant select on public.assignments            to authenticated;
grant select on public.student_task_overrides to authenticated;
grant select on public.weekly_challenges      to authenticated;
grant select on public.feedback               to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — profiles: SELECT only added here.
--
-- `profiles_select` (0002) allows a student to read their own row and a
-- teacher/admin to read a taught student's row; nothing has ever narrowed
-- SELECT on profiles, unlike UPDATE. 0018 already handles UPDATE
-- (column-restricted to first_name/last_name/last_active_at/updated_at) and
-- is NOT touched or re-granted here — re-running its GRANT would be harmless
-- (idempotent), but restating it risks a future edit here drifting out of
-- sync with 0018's own comment block, so it is intentionally left alone.
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — attempts: SELECT only. INSERT/UPDATE deliberately withheld.
--
-- SELECT is confirmed in use (my-attempts.ts, hosted-tests.ts, attempts.ts
-- all read `attempts` via the session-bound client, filtered by RLS to
-- `student_id = auth.uid()`).
--
-- INSERT must NOT be granted: 0028_revoke_attempt_insert.sql explicitly
-- revoked it so that start_share_attempt()/start_share_html_attempt() (both
-- SECURITY DEFINER, token-gated) are the ONLY way to mint an attempt row —
-- "the link is the key" (0025). Nothing in this file re-grants it.
--
-- UPDATE is also withheld, even though `attempts_update` (0002) technically
-- allows `student_id = auth.uid()` to update their own row: that RLS policy
-- has no column restriction, so granting table-level UPDATE would let a
-- student PATCH their own `submitted_at`, `started_at`, `task_id`, `test_id`,
-- or `html_test_id` directly over PostgREST — reopening a completed attempt,
-- forging a start time, or re-pointing the row at a different test. No code
-- path performs this update (finalize_test_attempt claims/stamps
-- `submitted_at` itself, as service_role/SECURITY DEFINER, needing no grant),
-- so withholding it costs nothing and closes a bypass the RLS policy alone
-- does not.
-- ---------------------------------------------------------------------------

grant select on public.attempts to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — attempt_answers: SELECT only, same reasoning as attempts.
--
-- `attempt_answers_insert`/`_update` (0002) both key off the PARENT attempt's
-- `student_id = auth.uid()`, with no restriction on `is_correct` or
-- `awarded_points`. Granting INSERT/UPDATE here would let a student write
-- their own grading result directly — forge a correct answer or award
-- themselves points on a submitted attempt. The only real write path is
-- finalize_test_attempt (0019), SECURITY DEFINER, which needs no grant. No
-- current UI reads attempt_answers directly either, but SELECT is harmless
-- (RLS already scopes it through the owning attempt) and is granted for
-- forward compatibility with an eventual "review your answers" feature.
-- ---------------------------------------------------------------------------

grant select on public.attempt_answers to authenticated;

-- ---------------------------------------------------------------------------
-- authenticated — explicitly untouched tables (no grant, by design).
--
-- `admin_emails` (0007): RLS is enabled with ZERO policies, and the
-- migration's own comment says so explicitly — "Locked down: no policies ->
-- anon/authenticated clients get nothing." A grant here would be actively
-- wrong: RLS with no matching policy already denies every row, but adding a
-- table-level grant is needless surface for no benefit. Left ungranted.
--
-- `html_test_answer_keys` (0027): the migration explicitly runs
-- `revoke all on html_test_answer_keys from authenticated, anon` and has zero
-- RLS policies, by design — "with RLS enabled and zero policies the table is
-- invisible to anon/authenticated through PostgREST. Only the service-role
-- client ... can read it." This migration does not grant anything on it,
-- preserving that invariant. Verified below.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verification — fail loudly if any standing security invariant broke.
--
-- Every assertion below documents an invariant established by an earlier
-- migration that this file must not have disturbed. If any RAISE fires, the
-- migration aborts (implicit transaction) rather than silently shipping a
-- regression.
-- ---------------------------------------------------------------------------

do $$
begin
  -- 0018 #2 — answer_key must stay hidden from authenticated, even though
  -- authenticated does have SELECT on the rest of the `questions` row.
  if has_column_privilege('authenticated', 'public.questions', 'answer_key', 'SELECT') then
    raise exception '0030 invariant violated: authenticated can SELECT questions.answer_key';
  end if;
  if not has_column_privilege('authenticated', 'public.questions', 'prompt', 'SELECT') then
    raise exception '0030 invariant violated: authenticated lost SELECT on questions.prompt';
  end if;

  -- 0018 #1 — role/group_id must stay non-writable by authenticated via a
  -- direct table update (the column-level GRANT from 0018 must still exclude
  -- them, and this migration must not have re-widened it).
  if has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') then
    raise exception '0030 invariant violated: authenticated can UPDATE profiles.role';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'group_id', 'UPDATE') then
    raise exception '0030 invariant violated: authenticated can UPDATE profiles.group_id';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'first_name', 'UPDATE') then
    raise exception '0030 invariant violated: authenticated lost UPDATE on profiles.first_name';
  end if;

  -- 0028 — attempts must stay uninsertable directly by authenticated/anon;
  -- the token RPCs (start_share_attempt / start_share_html_attempt) are the
  -- only mint path. This migration also deliberately withholds UPDATE.
  if has_table_privilege('authenticated', 'public.attempts', 'INSERT') then
    raise exception '0030 invariant violated: authenticated can INSERT into attempts';
  end if;
  if has_table_privilege('anon', 'public.attempts', 'INSERT') then
    raise exception '0030 invariant violated: anon can INSERT into attempts';
  end if;
  if has_table_privilege('authenticated', 'public.attempts', 'UPDATE') then
    raise exception '0030 invariant violated: authenticated can UPDATE attempts';
  end if;
  if not has_table_privilege('authenticated', 'public.attempts', 'SELECT') then
    raise exception '0030 regression: authenticated cannot SELECT attempts (own rows via RLS)';
  end if;

  -- 0027 — html_test_answer_keys must stay fully inaccessible to both
  -- authenticated and anon; only service_role (the submit route) reads it.
  if has_table_privilege('authenticated', 'public.html_test_answer_keys', 'SELECT') then
    raise exception '0030 invariant violated: authenticated can SELECT html_test_answer_keys';
  end if;
  if has_table_privilege('anon', 'public.html_test_answer_keys', 'SELECT') then
    raise exception '0030 invariant violated: anon can SELECT html_test_answer_keys';
  end if;

  -- 0019 — finalize_test_attempt stays service_role-only; authenticated must
  -- never be able to execute it directly (it mints attacker-chosen XP if it
  -- can be called over PostgREST rpc()).
  if has_function_privilege(
       'authenticated',
       'public.finalize_test_attempt(uuid, uuid, result_status, boolean, jsonb, jsonb, int, text)',
       'EXECUTE'
     ) then
    raise exception '0030 invariant violated: authenticated can EXECUTE finalize_test_attempt';
  end if;
  if has_function_privilege(
       'anon',
       'public.finalize_test_attempt(uuid, uuid, result_status, boolean, jsonb, jsonb, int, text)',
       'EXECUTE'
     ) then
    raise exception '0030 invariant violated: anon can EXECUTE finalize_test_attempt';
  end if;

  -- Constraint #4 — anon must have no DML privilege (SELECT/INSERT/UPDATE/
  -- DELETE) on any table in `public`. Scoped to DML deliberately: the
  -- Supabase image's own default ACL (pg_default_acl shows `anon=Dxtm`)
  -- grants anon REFERENCES/TRIGGER/TRUNCATE on every table in `public` before
  -- this migration ever runs — that is a platform artifact, not a grant this
  -- file (or any migration in this repo) issues, and a fresh `supabase db
  -- reset` will always show it. Asserting "zero rows in
  -- role_table_grants" would therefore fail on every environment, including
  -- one where anon is correctly locked out of all application data, making
  -- the check useless. What we actually care about is whether anon can read
  -- or write application data through the Data API — i.e. SELECT/INSERT/
  -- UPDATE/DELETE — so the check is narrowed to exactly those four.
  --
  -- NOTE (flagged, not fixed here): anon holding TRUNCATE on 36 tables is
  -- surprising even as a platform default. PostgREST does not expose
  -- TRUNCATE, so it is not reachable via the Data API and is not a live
  -- exploit path — but revoking it (or not) is a separate decision outside
  -- this migration's scope (it did not grant it, so it is not this
  -- migration's place to revoke it either).
  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    declare
      v_table text;
      v_priv  text;
    begin
      select table_name, privilege_type
        into v_table, v_priv
        from information_schema.role_table_grants
       where grantee = 'anon'
         and table_schema = 'public'
         and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
       limit 1;
      raise exception '0030 invariant violated: anon holds % on public.%', v_priv, v_table;
    end;
  end if;

  -- Sanity: service_role must retain full access to grade tests (spot-check
  -- the one column that matters most — answer_key — plus a write table).
  if not has_column_privilege('service_role', 'public.questions', 'answer_key', 'SELECT') then
    raise exception '0030 regression: service_role lost SELECT on questions.answer_key';
  end if;
  if not has_table_privilege('service_role', 'public.attempts', 'INSERT') then
    raise exception '0030 regression: service_role lost INSERT on attempts';
  end if;

  raise notice '0030_explicit_data_api_grants.sql: all invariants verified.';
end $$;
