-- Keep a student's own XP visible on the leaderboard even with no/changed group.
--
-- Before: group_xp_leaderboard() joined `me on me.group_id is not null and
-- p.group_id = me.group_id`. A student with a NULL group_id (removed from a
-- group, between groups, or never assigned) matched no rows, so the RPC returned
-- an EMPTY set — their accumulated XP/rank vanished from view even though the
-- points_ledger rows still exist. Moving groups also dropped their old standing.
--
-- Fix: always include the caller's OWN row (self), plus their group peers when
-- they have a group. xp_total is still summed across ALL of the student's
-- points_ledger (group-independent), so the number is preserved across group
-- changes — a groupless caller simply sees a leaderboard of just themselves.
--
-- Everything else (streak gaps-and-islands, columns, ordering) is unchanged from
-- migration 0015. Return signature is identical, so no client changes are needed.

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
  ),
  active_days as (
    -- One row per (student, UTC calendar day) — duplicates on the same day
    -- are collapsed so each active day counts once.
    select distinct pl.student_id,
                    (pl.created_at at time zone 'UTC')::date as d
    from points_ledger pl
  ),
  islands as (
    -- Gaps-and-islands: consecutive dates share a constant grp value
    -- (d minus its per-student ascending row-number).
    select
      student_id,
      d,
      (d - (row_number() over (partition by student_id order by d))::int) as grp
    from active_days
  ),
  current_streak as (
    -- For each student, find the island whose most-recent day is today or
    -- yesterday (UTC).  That island's size is the current streak.
    -- The HAVING clause ensures we only return a row when the streak is active.
    select student_id, count(*)::int as streak
    from islands
    group by student_id, grp
    having max(d) >= (now() at time zone 'UTC')::date - 1
       and max(d) <= (now() at time zone 'UTC')::date
  )
  select
    p.id,
    trim(p.first_name || ' ' || p.last_name)                              as display_name,
    coalesce(sum(pl.points), 0)                                           as xp_total,
    coalesce(sum(pl.points) filter (
      where pl.created_at >= now() - interval '7 days'), 0)               as xp_week,
    coalesce(sum(pl.points) filter (
      where pl.created_at >= now() - interval '30 days'), 0)              as xp_month,
    coalesce(max(cs.streak), 0)::int                                      as streak,
    count(pl.id)::int                                                     as activity_count,
    (p.id = auth.uid())                                                   as is_me
  from profiles p
  cross join me
  left join points_ledger pl on pl.student_id = p.id
  left join current_streak cs on cs.student_id = p.id
  where p.role = 'STUDENT'
    -- Always include the caller's own row; add group peers when they have a group.
    and (
      p.id = auth.uid()
      or (me.group_id is not null and p.group_id = me.group_id)
    )
  group by p.id, p.first_name, p.last_name
  -- p.id is the final deterministic tiebreak (display_name can collide).
  order by xp_total desc, activity_count desc, display_name asc, p.id asc;
$$;

-- Callable by any signed-in user; the function scopes to their group + self.
grant execute on function group_xp_leaderboard() to authenticated;
