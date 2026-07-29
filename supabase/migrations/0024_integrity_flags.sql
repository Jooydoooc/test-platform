-- 0024_integrity_flags.sql
--
-- Anti-cheat telemetry for graded tests. When a student takes a proctored test
-- (server-graded /t/<token> or hosted /ht/<token>), the client tracks integrity
-- events — leaving fullscreen, switching tabs/windows, copy/paste attempts — and
-- reports a tally at submit. We store it on the result so teachers can see who
-- triggered the proctor.
--
-- TRUST NOTE: these signals are client-reported (the proctor runs in the browser)
-- and therefore best-effort deterrence, not proof. A determined student can
-- suppress them. They are integrity *hints* for a human to review, never an
-- automatic penalty — grading/XP are unaffected by these columns.
--
-- Additive & backward-compatible:
--   * integrity_violations defaults to 0, so existing rows and any submit path
--     that doesn't report integrity read as "clean" (0).
--   * integrity_flags is nullable (null = nothing reported).
--   * results stays read-only to clients under existing RLS (0002); only the
--     server (service role via finalize path / submit API) writes these, so no
--     new policy is needed and students cannot forge them post-hoc.

alter table results
  add column if not exists integrity_violations integer not null default 0,
  add column if not exists integrity_flags jsonb;

comment on column results.integrity_violations is
  'Client-reported count of proctor violations during the attempt (tab-switch, fullscreen-exit, copy/paste). Best-effort deterrence signal, not proof; does not affect grading.';
comment on column results.integrity_flags is
  'Client-reported per-type breakdown of proctor violations, e.g. {"blur":2,"fullscreen_exit":1,"copy":3}. Null when nothing was reported.';
