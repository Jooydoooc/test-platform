import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  BADGE_CATALOG,
  isBadgeEarned,
  type BadgeCounts,
  type BadgeSkill,
} from "@/lib/badges";

// Supabase side of the badge bridge. Reuses the SAME catalog + rule as the
// client (src/lib/badges.ts): this module only supplies the counts from real
// data and writes the unlocks. badge_unlocks is service-role write (RLS), and
// its unique (student_id, badge_id) makes re-award a no-op — idempotent, so a
// re-submit never double-unlocks.
//
// Bridge points still zero-sourced: units_mastered (no unit-completion tracking
// yet). streak_days is a calendar-day proxy from result dates until the streak
// engine lands.

/** Longest run of consecutive calendar days present in the timestamps. */
function longestDailyStreak(isoDates: string[]): number {
  const days = [
    ...new Set(isoDates.map((d) => Math.floor(new Date(d).getTime() / 86400000))),
  ].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of days) {
    run = prev !== null && day === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

async function computeCounts(studentId: string): Promise<BadgeCounts> {
  const admin = createAdminClient();

  const { data: results } = await admin
    .from("results")
    .select("id, created_at")
    .eq("student_id", studentId);

  const resultIds = (results ?? []).map((r) => r.id);
  const skillTests: Partial<Record<BadgeSkill, number>> = {};

  if (resultIds.length > 0) {
    const { data: rows } = await admin
      .from("result_skill_scores")
      .select("skill_area, result_id")
      .in("result_id", resultIds);
    // Count distinct results per skill (each completed test = one contribution).
    const perSkill = new Map<BadgeSkill, Set<string>>();
    for (const r of rows ?? []) {
      const skill = r.skill_area as BadgeSkill;
      (perSkill.get(skill) ?? perSkill.set(skill, new Set()).get(skill)!).add(
        r.result_id,
      );
    }
    for (const [skill, ids] of perSkill) skillTests[skill] = ids.size;
  }

  return {
    skillTests,
    streakDays: longestDailyStreak((results ?? []).map((r) => r.created_at)),
    unitsMastered: 0,
  };
}

// Evaluate all badges for a student and unlock any newly earned ones. Returns
// the names of badges unlocked by THIS call (for a "new badge" nudge on submit).
export async function evaluateAndUnlockBadges(
  studentId: string,
): Promise<string[]> {
  const counts = await computeCounts(studentId);
  const earnedCodes = BADGE_CATALOG.filter((def) =>
    isBadgeEarned(def, counts),
  ).map((def) => def.code);
  if (earnedCodes.length === 0) return [];

  const admin = createAdminClient();

  // Map catalog codes -> badge ids (the DB catalog is the source of truth for ids).
  const { data: badgeRows } = await admin
    .from("badges")
    .select("id, code")
    .in("code", earnedCodes);
  if (!badgeRows || badgeRows.length === 0) return [];

  // Which are already unlocked, so we can report only the newly granted ones.
  const badgeIds = badgeRows.map((b) => b.id);
  const { data: existing } = await admin
    .from("badge_unlocks")
    .select("badge_id")
    .eq("student_id", studentId)
    .in("badge_id", badgeIds);
  const already = new Set((existing ?? []).map((e) => e.badge_id));

  const toInsert = badgeRows
    .filter((b) => !already.has(b.id))
    .map((b) => ({ student_id: studentId, badge_id: b.id }));
  if (toInsert.length === 0) return [];

  const { error: unlockErr } = await admin
    .from("badge_unlocks")
    .upsert(toInsert, {
      onConflict: "student_id,badge_id",
      ignoreDuplicates: true,
    });
  // If the write failed, don't report badges as unlocked — the rows were never
  // stored and would disappear on next load. Return [] so the UI shows nothing.
  if (unlockErr) return [];

  const codeById = new Map(badgeRows.map((b) => [b.id, b.code]));
  const nameByCode = new Map(BADGE_CATALOG.map((d) => [d.code, d.name]));
  return toInsert
    .map((r) => nameByCode.get(codeById.get(r.badge_id) ?? "") ?? "")
    .filter(Boolean);
}
