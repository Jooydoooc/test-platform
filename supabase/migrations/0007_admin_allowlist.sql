-- Admin email allowlist: addresses here auto-provision as ADMIN on first
-- sign-in (email/password or Google). Everyone else defaults to STUDENT.
--
-- A table (not a hardcoded list) so admins can be added later without a
-- migration — just insert a lowercased email. Only affects NEW signups; change
-- an existing user with `update profiles set role=... where id=...`.

create table if not exists public.admin_emails (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- Locked down: no policies -> anon/authenticated clients get nothing. The
-- SECURITY DEFINER trigger below reads it regardless (it bypasses RLS), and
-- service-role/SQL admin can manage rows.
alter table public.admin_emails enable row level security;

-- Store lowercased to make the lookup case-insensitive.
insert into public.admin_emails (email) values ('jooydooc@gmail.com')
  on conflict (email) do nothing;

-- Rewrite handle_new_user to (a) assign ADMIN when the email is allowlisted,
-- (b) keep the Google/email name resolution from 0006.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name  text  := coalesce(meta ->> 'full_name', meta ->> 'name', '');
  first_name text;
  last_name  text;
  new_role   role;
begin
  first_name := coalesce(
    nullif(meta ->> 'first_name', ''),
    nullif(meta ->> 'given_name', ''),
    nullif(split_part(full_name, ' ', 1), '')
  );
  last_name := coalesce(
    nullif(meta ->> 'last_name', ''),
    nullif(meta ->> 'family_name', ''),
    nullif(nullif(substring(full_name from position(' ' in full_name) + 1), full_name), '')
  );

  select case
           when exists (
             select 1 from public.admin_emails a
             where a.email = lower(new.email)
           ) then 'ADMIN'::role
           else 'STUDENT'::role
         end
    into new_role;

  insert into public.profiles (id, first_name, last_name, role)
  values (new.id, coalesce(first_name, ''), coalesce(last_name, ''), new_role)
  on conflict (id) do nothing;

  return new;
end;
$$;
