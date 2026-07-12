-- Real, activity-based streak column for the XP group leaderboard.
--
-- Previously streak was always 0: the RPC read a `streaks` table that nothing
-- in the codebase ever writes. This migration replaces that with a real
-- current-streak computation derived entirely from points_ledger activity days.
--
-- Streak semantics (matches the client-side `streaks()` function in
-- src/app/dashboard/page.tsx):
--   • An "active day" = any UTC calendar day on which the student has ≥1
--     points_ledger row.  Multiple rows on the same day count once.
--   • "Current streak" = the length of the consecutive-day run that ends on
--     today (UTC) or yesterday (UTC).  The grace day (yesterday counts) means
--     the streak does not break if the student simply hasn't been active yet
--     today.  If the most-recent active day is older than yesterday, streak = 0.
--   • Consecutive days are detected via the gaps-and-islands technique:
--     within each student, each date minus its ascending row-number is a
--     constant for dates that form a consecutive run.  Rows sharing the same
--     constant belong to the same island.  Only the island whose max(d) falls
--     in [today-1, today] contributes to the current streak.
--
-- The return signature is UNCHANGED — same columns, same order — so no
-- TypeScript or client-side changes are needed.
--
-- The `streaks` table is left in place; we simply stop reading it here.
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
  join me on me.group_id is not null and p.group_id = me.group_id
  left join points_ledger pl on pl.student_id = p.id
  left join current_streak cs on cs.student_id = p.id
  where p.role = 'STUDENT'
  group by p.id, p.first_name, p.last_name
  order by xp_total desc, activity_count desc, display_name asc;
$$;

-- Callable by any signed-in user; the function itself scopes to their group.
grant execute on function group_xp_leaderboard() to authenticated;
