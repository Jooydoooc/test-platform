-- Group leaderboard as a SECURITY DEFINER function.
--
-- Why an RPC instead of a plain query: RLS (correctly) forbids a student from
-- reading classmates' results rows. But ranking needs group-wide aggregates. A
-- SECURITY DEFINER function computes the aggregate server-side and returns ONLY
-- masked, non-sensitive fields (first name + last initial + accuracy) scoped to
-- the caller's OWN group — never raw rows, never other groups
-- (RANKING_AND_MOTIVATION.md).
--
-- Placement results are excluded (excluded_from_progress = false).
--
-- KNOWN v1 SIMPLIFICATION — avg_accuracy is a mean over result_skill_scores
-- rows, NOT a per-result average. A MIXED test fans out to up to 5-6 skill rows
-- per attempt while a single-skill test yields 1, so a test's weight in the
-- average scales with how many skills it scored (a student doing mostly mixed
-- tests is weighted differently per-test than one doing single-skill tests).
-- results_count is per-result (count distinct r.id), only the accuracy has this
-- quirk. RANKING_AND_MOTIVATION.md actually calls for "per skill or overall"
-- leaderboards; when that UI is built, switch to a per-result average or a
-- skill-scoped metric rather than this single blended number.

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
  order by avg_accuracy desc, results_count desc;
$$;

-- Callable by any signed-in user; the function itself scopes to their group.
grant execute on function group_leaderboard() to authenticated;
