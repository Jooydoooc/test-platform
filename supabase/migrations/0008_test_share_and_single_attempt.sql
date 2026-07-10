-- Shareable test links + hard single-attempt enforcement (EXP anti-cheat).
--
-- A test is shared by URL: /t/<share_token>. Login is still required (closed
-- platform), so the token identifies the TEST, not the student — identity comes
-- from the authenticated session. The token is separate from tests.id so a
-- teacher can rotate/revoke a link without changing the test.
--
-- The single-attempt guarantee is enforced HERE, at the database, not in the
-- client. A student gets exactly one attempt row per test: the partial unique
-- index makes a second insert fail even if the client is tampered with, its
-- localStorage is cleared, or a submit request is replayed. Resume (not restart)
-- works by reusing the existing in-progress row rather than inserting a new one.

alter table tests
  add column if not exists share_token uuid not null default gen_random_uuid();

-- One stable link per test.
create unique index if not exists tests_share_token_key on tests (share_token);

-- One attempt per student per test, ever. (task attempts are unaffected: the
-- predicate scopes this to test attempts only.)
create unique index if not exists attempts_one_per_student_test
  on attempts (student_id, test_id)
  where test_id is not null;
