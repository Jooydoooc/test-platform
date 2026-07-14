-- 0021_leaderboard_tiebreak.sql
--
-- Adds a deterministic tiebreak to group_leaderboard().
-- The original function (defined in 0003_functions.sql) orders by
-- avg_accuracy desc, results_count desc with NO final tiebreak, causing
-- non-deterministic ordering when two students share the same accuracy and
-- result count. This migration creates-or-replaces the function with an
-- identical body, adding only `, display_name asc` as the final tiebreak,
-- matching the pattern already used by group_xp_leaderboard() (0015).
--
-- The signature, return type, language, volatility, security model, and
-- search_path are preserved verbatim from 0003.

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
  group by p.id, p.first_name, p.last_name
  -- p.id is the final deterministic tiebreak: display_name (first name + last
  -- initial) can collide between students, so append the immutable primary key
  -- to guarantee a stable, reproducible ordering.
  order by avg_accuracy desc, results_count desc, display_name asc, p.id asc;
$$;

-- Grant preserved from 0003.
grant execute on function group_leaderboard() to authenticated;
