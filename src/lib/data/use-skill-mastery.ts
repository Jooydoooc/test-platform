"use client";

// Per-skill mastery for the signed-in student.
//
// Mirrors the useStudentXp / useMyAttempts pattern exactly:
//   - SUPABASE_ENABLED gate
//   - keyed by user.id (via supabase.auth.getUser())
//   - one-shot fetch on mount; `active` flag for safe async teardown
//   - no `any` — all query rows are typed explicitly
//
// Returns, per SkillArea: avg accuracy (0..100), whether the student has
// ATTEMPTED the skill at all, and how many results contributed. The
// `attempted` flag matters: a skill scored 0% and a skill never touched are
// different states, and collapsing them (the old "avg > 0" test) made the
// dashboard's weakest-skill recommendation unable to point at a genuine zero.
// RLS on result_skill_scores (via results.student_id = auth.uid()) scopes
// the rows to the caller automatically.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import type { SkillArea } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SkillStat {
  /** Weighted accuracy across every section in this skill, 0..100. */
  avg: number;
  /** True once at least one graded result covers this skill, even at 0%. */
  attempted: boolean;
  /** How many of the student's results contributed to this skill. */
  tests: number;
}

export type SkillMastery = Record<SkillArea, SkillStat>;

export interface UseSkillMasteryResult {
  mastery: SkillMastery;
  loading: boolean;
  /** True when the fetch failed — lets the UI avoid claiming every skill is "Not started". */
  error: boolean;
}

// ---------------------------------------------------------------------------
// Internal query-row shapes
// ---------------------------------------------------------------------------

type ResultRow = {
  id: string;
};

type SkillScoreRow = {
  result_id: string;
  skill_area: SkillArea;
  correct_count: number;
  total_count: number;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const ZERO: SkillStat = { avg: 0, attempted: false, tests: 0 };

const EMPTY_MASTERY: SkillMastery = {
  GRAMMAR: ZERO,
  VOCABULARY: ZERO,
  READING: ZERO,
  LISTENING: ZERO,
  WRITING: ZERO,
  SPEAKING: ZERO,
};

/**
 * Returns the signed-in student's per-skill mastery, derived from
 * result_skill_scores for all their non-excluded, completed results. When
 * Supabase is not configured, returns all-zeros immediately.
 */
export function useSkillMastery(): UseSkillMasteryResult {
  const [mastery, setMastery] = useState<SkillMastery>(EMPTY_MASTERY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setMastery(EMPTY_MASTERY);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let active = true;

    async function load() {
      // Step 1 — resolve authenticated user
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!active) return;
      if (!authUser) {
        setMastery(EMPTY_MASTERY);
        setLoading(false);
        return;
      }

      // Step 2 — fetch non-excluded result ids for this student.
      // RLS on results (student_id = auth.uid()) scopes automatically;
      // we also filter excluded_from_progress = false to skip placement tests.
      const { data: resultRows, error: rErr } = await supabase
        .from("results")
        .select("id")
        .eq("student_id", authUser.id)
        .eq("excluded_from_progress", false);

      if (!active) return;
      if (rErr) {
        setError(true);
        setLoading(false);
        return;
      }
      if (!resultRows || resultRows.length === 0) {
        setMastery(EMPTY_MASTERY);
        setLoading(false);
        return;
      }

      const typed = resultRows as ResultRow[];
      const resultIds = typed.map((r) => r.id);

      // Step 3 — fetch skill scores for those results.
      // RLS on result_skill_scores scopes via the results join automatically.
      const { data: skillRows, error: sErr } = await supabase
        .from("result_skill_scores")
        .select("result_id, skill_area, correct_count, total_count")
        .in("result_id", resultIds);

      if (!active) return;
      if (sErr) {
        setError(true);
        setLoading(false);
        return;
      }
      if (!skillRows || skillRows.length === 0) {
        setMastery(EMPTY_MASTERY);
        setLoading(false);
        return;
      }

      const typedSkill = skillRows as SkillScoreRow[];

      // Step 4 — aggregate: for each skill, collect (correct, total) pairs,
      // then compute accuracy as sum(correct) / sum(total) × 100 (i.e. the
      // weighted average across all test sections in that skill).
      const bySkill = new Map<
        SkillArea,
        { correct: number; total: number; results: Set<string> }
      >();
      for (const row of typedSkill) {
        const prev =
          bySkill.get(row.skill_area) ??
          { correct: 0, total: 0, results: new Set<string>() };
        prev.correct += row.correct_count;
        prev.total += row.total_count;
        prev.results.add(row.result_id);
        bySkill.set(row.skill_area, prev);
      }

      const next: SkillMastery = { ...EMPTY_MASTERY };
      for (const [skill, agg] of bySkill.entries()) {
        // A row existing at all means the skill was attempted, even when the
        // student scored nothing. Never infer "attempted" from avg > 0.
        next[skill] = {
          avg: agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0,
          attempted: true,
          tests: agg.results.size,
        };
      }

      setMastery(next);
      setLoading(false);
    }

    // If any await inside load() throws, clear loading so the dashboard's
    // combined loading gate can never hang on this hook.
    load().catch(() => {
      if (active) {
        setError(true);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []); // one-shot on mount; user resolved inside the effect

  return { mastery, loading, error };
}
