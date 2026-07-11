-- ---------------------------------------------------------------------------
-- Hosted HTML tests: self-contained single-file IELTS mocks (the ielts-*-html-pro
-- skills' output). Unlike DB tests (tests -> tasks -> questions, server-graded),
-- an HTML test IS a complete self-grading app — we host the file and serve it at
-- /ht/<share_token>. No parsing into questions; the HTML owns the experience.
--
-- Phase 1 = host + serve only. Score capture (a postMessage bridge -> results)
-- is a later migration; nothing here writes to results/points.
-- ---------------------------------------------------------------------------

create table html_tests (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  skill_scope  test_skill_scope not null default 'MIXED',
  level        level,
  storage_path text not null,                     -- object path in the html-tests bucket
  share_token  uuid not null default gen_random_uuid(),
  created_by   uuid not null references profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index html_tests_share_token_key on html_tests (share_token);
create index html_tests_created_by_idx on html_tests (created_by);

alter table html_tests enable row level security;

-- Any signed-in user may read metadata (students resolve a token to take a test;
-- admins list what they've uploaded). Only teachers/admins write.
create policy html_tests_select on html_tests for select
  using (auth.uid() is not null);
create policy html_tests_write on html_tests for all
  using (is_teacher()) with check (is_teacher());

-- Private bucket for the raw HTML. Like book-uploads, students get NO direct
-- object access — the /ht/<token> route streams the file server-side (service
-- role) to authenticated students. 50MB cap covers listening tests with
-- embedded (base64) audio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('html-tests', 'html-tests', false, 52428800, array['text/html'])
on conflict (id) do nothing;

create policy html_tests_read on storage.objects for select
  using (bucket_id = 'html-tests' and is_teacher());
create policy html_tests_upload on storage.objects for insert
  with check (bucket_id = 'html-tests' and is_teacher());
create policy html_tests_replace on storage.objects for update
  using (bucket_id = 'html-tests' and is_teacher());
create policy html_tests_remove on storage.objects for delete
  using (bucket_id = 'html-tests' and is_teacher());
