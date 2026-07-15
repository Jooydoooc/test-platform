-- 0023_soft_delete_profiles.sql
--
-- Converts account deletion from a hard delete (which cascades all student data
-- via ON DELETE CASCADE) to a soft delete that retains attempts/results/
-- points_ledger while preventing sign-in.
--
-- Changes:
--   1. Add `deleted_at` column to profiles (null = active, non-null = soft-deleted).
--   2. Partial index for fast active-user lookups.
--   3. Re-create group_xp_leaderboard() filtering soft-deleted students.
--   4. Re-create group_leaderboard() filtering soft-deleted students.

-- ---------------------------------------------------------------------------
-- 1. Soft-delete column + index
-- ---------------------------------------------------------------------------

-- Nullable: null means the account is active; a timestamp means it was soft-deleted.
alter table profiles
  add column if not exists deleted_at timestamptz;

-- Partial index covers all queries that scope to active users (deleted_at is null).
create index if not exists profiles_active_idx
  on profiles (id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. group_xp_leaderboard() — faithful copy of 0022, + soft-delete filter
-- ---------------------------------------------------------------------------
-- The ONLY addition to the 0022 body is:
--     and p.deleted_at is null
-- appended to the WHERE clause, so soft-deleted students are excluded from the
-- leaderboard while their points_ledger rows remain intact.

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
    -- Soft-delete filter: exclude accounts that have been soft-deleted.
    and p.deleted_at is null
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

-- ---------------------------------------------------------------------------
-- 3. group_leaderboard() — faithful copy of 0021, + soft-delete filter
-- ---------------------------------------------------------------------------
-- The ONLY addition to the 0021 body is:
--     and p.deleted_at is null
-- appended to the WHERE clause. Signature, return columns, volatility, security
-- model, and ordering are preserved verbatim from 0021.

create or replace function group_leaderboard()
returns table (
  student_id     uuid,
  display_name   text,
  avg_accuracy   double precision,
  results_count  int,
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
    p.first_name || ' ' ||
      case when length(p.last_name) > 0 then left(p.last_name, 1) || '.' else '' end
      as display_name,
    coalesce(avg(rss.accuracy), 0) as avg_accuracy,
    count(distinct r.id)::int      as results_count,
    (p.id = auth.uid())            as is_me
  from profiles p
  join me on me.group_id is not null and p.group_id = me.group_id
  left join results r
    on r.student_id = p.id and r.excluded_from_progress = false
  left join result_skill_scores rss on rss.result_id = r.id
  where p.role = 'STUDENT'
    -- Soft-delete filter: exclude accounts that have been soft-deleted.
    and p.deleted_at is null
  group by p.id, p.first_name, p.last_name
  -- p.id is the final deterministic tiebreak: display_name (first name + last
  -- initial) can collide between students, so append the immutable primary key
  -- to guarantee a stable, reproducible ordering.
  order by avg_accuracy desc, results_count desc, display_name asc, p.id asc;
$$;

-- Grant preserved from 0003.
grant execute on function group_leaderboard() to authenticated;
