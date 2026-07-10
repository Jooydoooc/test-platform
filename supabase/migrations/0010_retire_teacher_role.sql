-- Retire the TEACHER role. The platform now has exactly two roles: ADMIN and
-- STUDENT, and all former teacher duties belong to ADMIN.
--
-- Postgres can't cleanly DROP a value from an enum that columns and RLS policies
-- already reference, so the `role` enum keeps TEACHER as a dormant value. What
-- changes is that it is never assigned again (handle_new_user only ever writes
-- ADMIN via the allowlist, else STUDENT) and any existing TEACHER profile is
-- migrated to ADMIN here. Elevated-access RLS policies already allow ADMIN, so
-- they keep working unchanged; this migration is data-only.

update public.profiles set role = 'ADMIN' where role = 'TEACHER';
