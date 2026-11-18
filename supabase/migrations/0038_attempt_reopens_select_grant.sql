-- =============================================================================
-- 0038_attempt_reopens_select_grant.sql
-- Fix: public.attempt_reopens gets no explicit SELECT grant for `authenticated`.
--
-- WHAT 0037 GOT WRONG:
--   0037_reopen_attempt.sql creates attempt_reopens, enables RLS, adds
--   `attempt_reopens_select` (`using (is_teacher())`), then runs:
--     revoke insert, update, delete on public.attempt_reopens from authenticated, anon;
--   with this comment directly above the revoke:
--     "`authenticated` keeps the table-level SELECT grant it gets by default
--      under Supabase's standard schema grants, same as every other
--      RLS-protected table in this schema".
--   That assumption cannot be relied on in this project, and 0037's own invariant
--   block (the `do $$ ... end $$;` at its end) never actually checks it —
--   it asserts authenticated/anon CANNOT insert/update/delete, but nowhere
--   asserts authenticated CAN select. The missing case shipped unverified.
--
-- WHY THE ASSUMPTION CANNOT BE RELIED ON HERE:
--   supabase/config.toml leaves `auto_expose_new_tables` commented out /
--   unset (see the comment above line 24: "When unset, new entities are NOT
--   auto-exposed, matching the new cloud default"). That is the opposite of
--   the classic Supabase behaviour 0037's comment describes.
--   0030_explicit_data_api_grants.sql documents and fixes exactly this for
--   every pre-existing table: its header finding was "`authenticated` had
--   SELECT on 0 of the 37 tables in `public`" before that migration ran, and
--   it grants SELECT (or more) to `authenticated` explicitly, table by
--   table, because nothing auto-exposes new/existing tables anymore.
--   `attempt_reopens` was created afterward, in 0037, and never received the
--   same explicit grant 0030 gave every other table — so on any environment
--   built from this migration chain without legacy auto-expose (a fresh
--   project, a local DB, or a disaster-recovery rebuild, per 0030's own
--   warning), a teacher or admin querying attempt_reopens gets "permission
--   denied for table attempt_reopens" from PostgREST before RLS
--   (`attempt_reopens_select`, is_teacher()) ever gets a chance to run.
--   Production may or may not already have the grant: config.toml governs
--   local/new projects, and a project provisioned under the legacy behaviour
--   could still auto-grant new tables. Not verified against production —
--   check with `select has_table_privilege('authenticated',
--   'public.attempt_reopens', 'SELECT');`. Either way the table fails CLOSED
--   without the grant (nobody can read it), so this is a functionality bug,
--   not a security hole, and the GRANT below is correct and idempotent in
--   both cases. This migration's job is only to grant the SELECT that was
--   always intended, nothing wider.
--
-- NOTHING IN src/ READS THIS TABLE YET:
--   No route or lib file under src/ currently queries attempt_reopens (it is
--   written only by reopen_test_attempt(), SECURITY DEFINER, which bypasses
--   grants/RLS and needs none of this). This migration is forward-looking —
--   fixing the grant now, before any UI is built on top of it, so that a
--   future "reopen history" admin view does not inherit this bug.
--
-- WHAT THIS MIGRATION DOES:
--   * Grants SELECT on public.attempt_reopens to `authenticated` only.
--     `anon` gets nothing, consistent with 0030's "closed, sign-in-required
--     platform" rule and with attempt_reopens naming students (0037's own
--     comment: "it does name students, so: no anon access at all").
--   * Row visibility is unaffected: `attempt_reopens_select`
--     (`using (is_teacher())`) is untouched, so a non-teacher authenticated
--     user still sees zero rows — this migration only clears the table-level
--     gate that was wrongly assumed to already be open; RLS remains the
--     actual filter underneath it, exactly as 0030 designed every other
--     grant in this schema.
--   * Re-asserts (idempotently, defensively) the INSERT/UPDATE/DELETE
--     revokes 0037 already issued for `authenticated`/`anon`, and that
--     `anon` has no SELECT either — belt-and-suspenders, matching 0030's and
--     0034's practice of re-stating a prior revoke rather than assuming it
--     silently still holds.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   * No RLS policy is added, changed, or dropped.
--   * No INSERT/UPDATE/DELETE grant to authenticated or anon — writes still
--     go exclusively through reopen_test_attempt() (SECURITY DEFINER).
--   * No drop/truncate/delete of anything. Purely additive: one GRANT, two
--     defensive REVOKEs that already held, and a verification block.
--   * Idempotent — GRANT/REVOKE are safe to re-run on any environment,
--     including production, which has live student data.
-- =============================================================================

grant select on public.attempt_reopens to authenticated;

-- Defensive re-assertion of what 0037 already revoked. Matches the
-- convention 0030/0034 use of re-stating a standing revoke explicitly rather
-- than trusting it silently survived an intervening migration.
revoke insert, update, delete on public.attempt_reopens from authenticated, anon;
revoke all on public.attempt_reopens from anon;

-- ---------------------------------------------------------------------------
-- Verification — fail loudly if this migration didn't land the fix, or
-- disturbed an invariant 0037 already established.
-- ---------------------------------------------------------------------------

do $$
begin
  -- The actual fix: authenticated must now be able to SELECT the table at
  -- all (RLS still decides which rows come back).
  if not has_table_privilege('authenticated', 'public.attempt_reopens', 'SELECT') then
    raise exception '0038 invariant violated: authenticated cannot SELECT attempt_reopens';
  end if;

  -- 0037's invariants must still hold after this migration.
  if has_table_privilege('authenticated', 'public.attempt_reopens', 'INSERT') then
    raise exception '0038 invariant violated: authenticated can INSERT into attempt_reopens';
  end if;
  if has_table_privilege('authenticated', 'public.attempt_reopens', 'UPDATE') then
    raise exception '0038 invariant violated: authenticated can UPDATE attempt_reopens';
  end if;
  if has_table_privilege('authenticated', 'public.attempt_reopens', 'DELETE') then
    raise exception '0038 invariant violated: authenticated can DELETE attempt_reopens';
  end if;

  -- anon must have no DML privilege at all on this table, including SELECT
  -- (it names students — same rule 0030 applies platform-wide).
  if has_table_privilege('anon', 'public.attempt_reopens', 'SELECT') then
    raise exception '0038 invariant violated: anon can SELECT attempt_reopens';
  end if;
  if has_table_privilege('anon', 'public.attempt_reopens', 'INSERT') then
    raise exception '0038 invariant violated: anon can INSERT into attempt_reopens';
  end if;
  if has_table_privilege('anon', 'public.attempt_reopens', 'UPDATE') then
    raise exception '0038 invariant violated: anon can UPDATE attempt_reopens';
  end if;
  if has_table_privilege('anon', 'public.attempt_reopens', 'DELETE') then
    raise exception '0038 invariant violated: anon can DELETE attempt_reopens';
  end if;

  -- RLS must still be the real gate underneath this grant.
  if not exists (
    select 1 from pg_tables
     where schemaname = 'public'
       and tablename = 'attempt_reopens'
       and rowsecurity = true
  ) then
    raise exception '0038 invariant violated: RLS is no longer enabled on attempt_reopens';
  end if;

  raise notice '0038_attempt_reopens_select_grant.sql: all invariants verified.';
end $$;
