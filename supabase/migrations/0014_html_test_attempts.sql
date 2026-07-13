-- ---------------------------------------------------------------------------
-- Score capture Phase 2: wire HTML tests into the attempts pipeline.
--
-- Adds html_test_id to attempts so a student's interaction with a hosted HTML
-- test is tracked with the same row as a DB test attempt (single-attempt
-- anti-cheat, EXP deduplication, badge counting — all reuse existing code).
--
-- The original check constraint only allowed task_id XOR test_id. We extend it
-- to also allow html_test_id (still exactly one of the three must be set).
-- The partial unique index mirrors the test_id one from 0008 so the DB enforces
-- "one HTML-test attempt per student, ever" independently of application logic.
-- ---------------------------------------------------------------------------

alter table attempts
  add column if not exists html_test_id uuid references html_tests (id);

-- Widen the mutual-exclusion guard: exactly one of task_id, test_id,
-- html_test_id must be non-null on every attempt row.
alter table attempts drop constraint if exists attempts_target_ck;
alter table attempts
  add constraint attempts_target_ck
  check (num_nonnulls(task_id, test_id, html_test_id) = 1);

create index if not exists attempts_html_test_idx
  on attempts (html_test_id);

-- One attempt per student per HTML test, ever. The predicate scopes this index
-- to html_test attempts only, leaving task/test attempts unaffected.
create unique index if not exists attempts_one_per_student_html_test
  on attempts (student_id, html_test_id)
  where html_test_id is not null;
