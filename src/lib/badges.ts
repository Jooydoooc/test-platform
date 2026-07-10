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
// badge. streak_days / units_mastered have no localStorage source yet, so those
// badges stay locked until the Supabase engine feeds them (a bridge point).
export type BadgeMetric = "skill_tests" | "streak_days" | "units_mastered";

export interface BadgeDef {
  code: string;
  name: string;
  description: string;
  skillArea: BadgeSkill | null; // null = cross-skill
  threshold: number;
  metric: BadgeMetric;
}

export const BADGE_CATALOG: BadgeDef[] = [
  { code: "grammar_starter", name: "Grammar Starter", description: "Complete a grammar test.", skillArea: "GRAMMAR", threshold: 1, metric: "skill_tests" },
  { code: "vocabulary_builder", name: "Vocabulary Builder", description: "Complete a vocabulary test.", skillArea: "VOCABULARY", threshold: 1, metric: "skill_tests" },
  { code: "reading_climber", name: "Reading Climber", description: "Complete a reading test.", skillArea: "READING", threshold: 1, metric: "skill_tests" },
  { code: "listening_focus", name: "Listening Focus", description: "Complete a listening test.", skillArea: "LISTENING", threshold: 1, metric: "skill_tests" },
  { code: "writing_voice", name: "Writing Voice", description: "Complete a writing task.", skillArea: "WRITING", threshold: 1, metric: "skill_tests" },
  { code: "speaking_confidence", name: "Speaking Confidence", description: "Complete a speaking task.", skillArea: "SPEAKING", threshold: 1, metric: "skill_tests" },
  { code: "streak_7", name: "7-Day Streak", description: "Practise on seven session days.", skillArea: null, threshold: 7, metric: "streak_days" },
  { code: "unit_master", name: "Unit Master", description: "Complete every task in a unit.", skillArea: null, threshold: 1, metric: "units_mastered" },
];

// The inputs an evaluator needs. A source (localStorage now, Supabase later)
// fills these; the rule below is identical for both.
export interface BadgeCounts {
  skillTests: Partial<Record<BadgeSkill, number>>;
  streakDays: number;
  unitsMastered: number;
}

export function badgeProgress(def: BadgeDef, counts: BadgeCounts): number {
  switch (def.metric) {
    case "skill_tests":
      return def.skillArea ? counts.skillTests[def.skillArea] ?? 0 : 0;
    case "streak_days":
      return counts.streakDays;
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
