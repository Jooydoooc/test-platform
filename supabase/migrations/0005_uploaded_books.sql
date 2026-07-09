-- Uploaded books — admin/teacher-uploaded content, tagged by a content type.
-- A "book" is created ONCE by a teacher and readable by any authenticated user
-- (student read-gating stays at the query layer, like the other content tables
-- in 0002_rls.sql). Content branches by category:
--   * GRAMMAR / VOCABULARY -> book_questions (quiz items parsed from a CSV)
--   * READING  / ARTICLES  -> book_passages (the text) + book_glossary
--   * VOCABULARY may also carry book_glossary (its word list)
-- book_glossary powers the vocabulary reader/drills (word + def + translation +
-- example), matching the shape used by src/lib/vocab-store.ts.

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

create type book_content_type as enum (
  'VOCABULARY', 'GRAMMAR', 'READING', 'ARTICLES'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table books (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  content_type    book_content_type not null,
  level           level,                 -- reuses the 0001 level enum (nullable)
  description     text not null default '',
  source_filename text,                  -- original upload name, for reference
  source_path     text,                  -- object path in the book-uploads bucket
  created_by      uuid not null references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index books_content_type_idx on books (content_type);
create index books_level_idx on books (level);
create index books_created_by_idx on books (created_by);

-- Quiz items for GRAMMAR / VOCABULARY books. `format` reuses the 0001
-- question_format enum; choices/correct are stored as JSON for flexibility.
create table book_questions (
  id       uuid primary key default gen_random_uuid(),
  book_id  uuid not null references books (id) on delete cascade,
  "order"  int not null default 0,
  format   question_format not null,
  prompt   text not null,
  choices  jsonb not null default '[]',   -- string[] of choice texts
  correct  jsonb not null default '[]',   -- string[] of accepted answers / choice texts
  points   int not null default 1
);
create index book_questions_book_idx on book_questions (book_id);

-- Reading text for READING / ARTICLES books. A book may hold several passages.
create table book_passages (
  id       uuid primary key default gen_random_uuid(),
  book_id  uuid not null references books (id) on delete cascade,
  title    text not null default '',
  body     text not null,
  "order"  int not null default 0
);
create index book_passages_book_idx on book_passages (book_id);

-- Glossary — learnable words for READING/ARTICLES (and the word list for
-- VOCABULARY). Mirrors VocabWord in src/lib/vocab-store.ts.
create table book_glossary (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references books (id) on delete cascade,
  word           text not null,
  definition_en  text not null default '',
  translation_uz text not null default '',
  example        text not null default '',
  part_of_speech text
);
create index book_glossary_book_idx on book_glossary (book_id);

-- ---------------------------------------------------------------------------
-- RLS — readable by any authenticated user, writable by teachers/admins only.
-- Same pattern as the content tables in 0002_rls.sql (reuses is_teacher()).
-- ---------------------------------------------------------------------------

alter table books          enable row level security;
alter table book_questions enable row level security;
alter table book_passages  enable row level security;
alter table book_glossary  enable row level security;

create policy books_select on books for select using (auth.uid() is not null);
create policy books_write  on books for all
  using (is_teacher()) with check (is_teacher() and created_by = auth.uid());

create policy book_questions_select on book_questions for select using (auth.uid() is not null);
create policy book_questions_write  on book_questions for all using (is_teacher()) with check (is_teacher());

create policy book_passages_select on book_passages for select using (auth.uid() is not null);
create policy book_passages_write  on book_passages for all using (is_teacher()) with check (is_teacher());

create policy book_glossary_select on book_glossary for select using (auth.uid() is not null);
create policy book_glossary_write  on book_glossary for all using (is_teacher()) with check (is_teacher());

-- ---------------------------------------------------------------------------
-- Storage — private bucket for the original uploaded files.
-- Teachers read/write; students have no direct object access (they consume the
-- parsed rows above, not the raw files).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('book-uploads', 'book-uploads', false)
on conflict (id) do nothing;

create policy book_uploads_read on storage.objects for select
  using (bucket_id = 'book-uploads' and is_teacher());
create policy book_uploads_write on storage.objects for insert
  with check (bucket_id = 'book-uploads' and is_teacher());
create policy book_uploads_update on storage.objects for update
  using (bucket_id = 'book-uploads' and is_teacher());
create policy book_uploads_delete on storage.objects for delete
  using (bucket_id = 'book-uploads' and is_teacher());
