-- Real, XP-based group leaderboard as a SECURITY DEFINER function.
--
-- Companion to group_leaderboard() (0003, accuracy-based). This one ranks by
-- real EXP from the points_ledger — which now accrues from tests AND exercises
-- AND vocab practice (see reasons TEST_EXP / EXERCISE_EXP / VOCAB_EXP) — so the
-- leaderboard reflects a student's total activity, not just graded tests.
--
-- Scoped to the caller's OWN group and to role STUDENT. Returns FULL names
-- (product decision: this is a closed class platform, names are shown in full).
-- Week / month windows use points_ledger.created_at so the UI's period toggle is
-- real. Streak comes from the streaks table (0 when a student has none yet).
--
-- SECURITY DEFINER + a fixed search_path so it can read group members' ledger
-- rows that RLS hides from the calling student, while only ever returning the
-- aggregate, group-scoped shape below.

create or replace function group_xp_leaderboard()
returns table (
  student_id     uuid,
  display_name   text,
  xp_total       bigint,
  xp_week        bigint,
  xp_month       bigint,
  streak         int,
  activity_count int,
  is_me          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select group_id from profiles where id = auth.uid()
  )
  select
    p.id,
    trim(p.first_name || ' ' || p.last_name)                              as display_name,
    coalesce(sum(pl.points), 0)                                           as xp_total,
    coalesce(sum(pl.points) filter (
      where pl.created_at >= now() - interval '7 days'), 0)               as xp_week,
    coalesce(sum(pl.points) filter (
      where pl.created_at >= now() - interval '30 days'), 0)              as xp_month,
    coalesce(max(s.current_length), 0)::int                               as streak,
    count(pl.id)::int                                                     as activity_count,
    (p.id = auth.uid())                                                   as is_me
  from profiles p
  join me on me.group_id is not null and p.group_id = me.group_id
  left join points_ledger pl on pl.student_id = p.id
  left join streaks s        on s.student_id = p.id
  where p.role = 'STUDENT'
  group by p.id, p.first_name, p.last_name
  order by xp_total desc, activity_count desc, display_name asc;
$$;

-- Callable by any signed-in user; the function itself scopes to their group.
grant execute on function group_xp_leaderboard() to authenticated;
