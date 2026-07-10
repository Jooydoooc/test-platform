-- Google OAuth support for profile creation.
--
-- The original handle_new_user() (0001) only read `first_name`/`last_name` from
-- raw_user_meta_data — the keys our email/password signup sets. Google OAuth
-- instead provides `given_name`/`family_name` (and `name`/`full_name`), so a
-- Google sign-up produced a profile with empty names. This replaces the function
-- to prefer the email-signup keys, then fall back to Google's, then to splitting
-- the full display name. Role still defaults to STUDENT; trigger binding from
-- 0001 is unchanged (replacing the function is enough).

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
begin
  -- Prefer explicit first/last (email signup), then Google's given/family,
  -- then split the full display name on the first space.
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

  insert into public.profiles (id, first_name, last_name, role)
  values (new.id, coalesce(first_name, ''), coalesce(last_name, ''), 'STUDENT')
  on conflict (id) do nothing;

  return new;
end;
$$;
