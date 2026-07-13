-- ---------------------------------------------------------------------------
-- Vocabulary skills-test attempts: wire vocab units into the attempts pipeline.
--
-- Vocab units (eew1-u1 … eew1-uN) are client-side seed data — they are NOT
-- rows in the DB `tests` table and have no UUID FK to hang off. We add a plain
-- text column so the existing attempts → results → result_skill_scores pipeline
-- can record a graded skills-test event for them, enabling XP, badges, and
-- VOCABULARY skill-progress tracking that previously could not see vocab tests.
--
-- The mutual-exclusion check is widened from 3 (0014) to 4 targets, mirroring
-- exactly what 0014 did when it added html_test_id. The partial unique index
-- enforces "one graded skills-test attempt per student per vocab unit, ever"
-- independently of application logic — same guarantee as 0008 (test_id) and
-- 0014 (html_test_id).
-- ---------------------------------------------------------------------------

alter table attempts
  add column if not exists vocab_source_id text;

-- Widen the mutual-exclusion guard: exactly one of task_id, test_id,
-- html_test_id, vocab_source_id must be non-null on every attempt row.
alter table attempts drop constraint if exists attempts_target_ck;
alter table attempts
  add constraint attempts_target_ck
  check (num_nonnulls(task_id, test_id, html_test_id, vocab_source_id) = 1);

create index if not exists attempts_vocab_source_idx
  on attempts (vocab_source_id);

-- One graded skills-test attempt per student per vocab unit, ever. The
-- predicate scopes this index to vocab attempts only, leaving task/test/html
-- attempts unaffected.
create unique index if not exists attempts_one_per_student_vocab
  on attempts (student_id, vocab_source_id)
  where vocab_source_id is not null;
