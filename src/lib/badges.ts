// Storage-agnostic badge catalog + generic unlock rule.
//
// This mirrors the Supabase `badges` table (migration 0001 seed) 1:1, so the
// same catalog and evaluator drive the localStorage adapter now AND the Supabase
// engine at cutover. There is deliberately NO per-badge logic: a badge unlocks
// purely when its metric's count reaches the threshold, so adding a badge is a
// catalog row here / a table row there — never new code (per the spec's
// "generic milestone-unlock pattern").

export type BadgeSkill =
  | "GRAMMAR"
  | "VOCABULARY"
  | "READING"
  | "LISTENING"
  | "WRITING"
  | "SPEAKING";

// Where a badge's count comes from. New metrics are added centrally, not per
// badge. units_mastered has no source yet, so those badges stay locked until
// the Supabase engine feeds them (a bridge point).
//   skill_tests    — completed tests within one skill area
//   streak_days    — longest run of consecutive session days
//   skills_touched — number of distinct skills with >=1 completed test
//   total_tests    — completed tests across all skills
//   units_mastered — units fully completed (not yet sourced)
export type BadgeMetric =
  | "skill_tests"
  | "streak_days"
  | "skills_touched"
  | "total_tests"
  | "units_mastered";

export interface BadgeDef {
  code: string;
  name: string;
  description: string;
  skillArea: BadgeSkill | null; // null = cross-skill
  threshold: number;
  metric: BadgeMetric;
}

// Per-skill progression ladder. Each skill keeps its existing first-milestone
// "starter" badge (threshold 1, stable code — already unlocked in the DB) and
// then climbs Bronze/Silver/Gold so there's always a next rung to chase.
interface SkillLadder {
  skill: BadgeSkill;
  noun: string; // lowercase noun for descriptions ("grammar test")
  starterCode: string;
  starterName: string;
}

const SKILL_LADDERS: SkillLadder[] = [
  { skill: "GRAMMAR", noun: "grammar", starterCode: "grammar_starter", starterName: "Grammar Starter" },
  { skill: "VOCABULARY", noun: "vocabulary", starterCode: "vocabulary_builder", starterName: "Vocabulary Builder" },
  { skill: "READING", noun: "reading", starterCode: "reading_climber", starterName: "Reading Climber" },
  { skill: "LISTENING", noun: "listening", starterCode: "listening_focus", starterName: "Listening Focus" },
  { skill: "WRITING", noun: "writing", starterCode: "writing_voice", starterName: "Writing Voice" },
  { skill: "SPEAKING", noun: "speaking", starterCode: "speaking_confidence", starterName: "Speaking Confidence" },
];

const SKILL_TIERS = [
  { suffix: "bronze", label: "Bronze", threshold: 5 },
  { suffix: "silver", label: "Silver", threshold: 15 },
  { suffix: "gold", label: "Gold", threshold: 30 },
];

// prefix from a starter code ("grammar" from "grammar_starter") for tier codes.
const skillPrefix = (l: SkillLadder) => l.skill.toLowerCase();

const skillBadges: BadgeDef[] = SKILL_LADDERS.flatMap((l) => [
  {
    code: l.starterCode,
    name: l.starterName,
    description: `Complete a ${l.noun} test.`,
    skillArea: l.skill,
    threshold: 1,
    metric: "skill_tests" as const,
  },
  ...SKILL_TIERS.map((t) => ({
    code: `${skillPrefix(l)}_${t.suffix}`,
    name: `${l.starterName.split(" ")[0]} ${t.label}`,
    description: `Complete ${t.threshold} ${l.noun} tests.`,
    skillArea: l.skill,
    threshold: t.threshold,
    metric: "skill_tests" as const,
  })),
]);

export const BADGE_CATALOG: BadgeDef[] = [
  ...skillBadges,
  // Streaks — the daily-return ladder.
  { code: "streak_3", name: "3-Day Streak", description: "Practise on three session days in a row.", skillArea: null, threshold: 3, metric: "streak_days" },
  { code: "streak_7", name: "7-Day Streak", description: "Practise on seven session days in a row.", skillArea: null, threshold: 7, metric: "streak_days" },
  { code: "streak_14", name: "14-Day Streak", description: "Practise on fourteen session days in a row.", skillArea: null, threshold: 14, metric: "streak_days" },
  { code: "streak_30", name: "30-Day Streak", description: "Practise on thirty session days in a row.", skillArea: null, threshold: 30, metric: "streak_days" },
  // Breadth — reward spreading across skills.
  { code: "explorer_3", name: "Explorer", description: "Complete tests in three different skills.", skillArea: null, threshold: 3, metric: "skills_touched" },
  { code: "all_rounder", name: "All-Rounder", description: "Complete tests in all six skills.", skillArea: null, threshold: 6, metric: "skills_touched" },
  // Volume — the lifetime counter.
  { code: "volume_10", name: "Rising Star", description: "Complete 10 tests in total.", skillArea: null, threshold: 10, metric: "total_tests" },
  { code: "volume_50", name: "Dedicated", description: "Complete 50 tests in total.", skillArea: null, threshold: 50, metric: "total_tests" },
  { code: "volume_100", name: "Centurion", description: "Complete 100 tests in total.", skillArea: null, threshold: 100, metric: "total_tests" },
  // Completion — still awaiting a unit-completion source.
  { code: "unit_master", name: "Unit Master", description: "Complete every task in a unit.", skillArea: null, threshold: 1, metric: "units_mastered" },
];

// The inputs an evaluator needs. A source (localStorage now, Supabase later)
// fills these; the rule below is identical for both.
export interface BadgeCounts {
  skillTests: Partial<Record<BadgeSkill, number>>;
  streakDays: number;
  unitsMastered: number;
}

/** Distinct skills with at least one completed test — source for skills_touched. */
export function skillsTouched(counts: BadgeCounts): number {
  return Object.values(counts.skillTests).filter((n) => (n ?? 0) > 0).length;
}

/** Completed tests across every skill — source for total_tests. */
export function totalTests(counts: BadgeCounts): number {
  return Object.values(counts.skillTests).reduce((sum, n) => sum + (n ?? 0), 0);
}

export function badgeProgress(def: BadgeDef, counts: BadgeCounts): number {
  switch (def.metric) {
    case "skill_tests":
      return def.skillArea ? counts.skillTests[def.skillArea] ?? 0 : 0;
    case "streak_days":
      return counts.streakDays;
    case "skills_touched":
      return skillsTouched(counts);
    case "total_tests":
      return totalTests(counts);
    case "units_mastered":
      return counts.unitsMastered;
  }
}

export function isBadgeEarned(def: BadgeDef, counts: BadgeCounts): boolean {
  return badgeProgress(def, counts) >= def.threshold;
}

export function earnedBadgeCodes(counts: BadgeCounts): Set<string> {
  return new Set(
    BADGE_CATALOG.filter((b) => isBadgeEarned(b, counts)).map((b) => b.code),
  );
}
