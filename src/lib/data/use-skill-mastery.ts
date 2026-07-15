"use client";

// Per-skill mastery for the signed-in student.
//
// Mirrors the useStudentXp / useMyAttempts pattern exactly:
//   - SUPABASE_ENABLED gate
//   - keyed by user.id (via supabase.auth.getUser())
//   - one-shot fetch on mount; `active` flag for safe async teardown
//   - no `any` — all query rows are typed explicitly
//
// Returns: avg accuracy (0..100) per SkillArea, aggregated client-side from
// result_skill_scores joined to the student's own non-excluded results.
// RLS on result_skill_scores (via results.student_id = auth.uid()) scopes
// the rows to the caller automatically.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import type { SkillArea } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SkillMastery = Record<SkillArea, number>;

export interface UseSkillMasteryResult {
  mastery: SkillMastery;
  loading: boolean;
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

const EMPTY_MASTERY: SkillMastery = {
  GRAMMAR: 0,
  VOCABULARY: 0,
  READING: 0,
  LISTENING: 0,
  WRITING: 0,
  SPEAKING: 0,
};

/**
 * Returns the signed-in student's average accuracy (0..100) per skill area,
 * derived from result_skill_scores for all their non-excluded, completed
 * results. When Supabase is not configured, returns all-zeros immediately.
 */
export function useSkillMastery(): UseSkillMasteryResult {
  const [mastery, setMastery] = useState<SkillMastery>(EMPTY_MASTERY);
  const [loading, setLoading] = useState(true);

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
      if (rErr || !resultRows || resultRows.length === 0) {
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
      if (sErr || !skillRows || skillRows.length === 0) {
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
        { correct: number; total: number }
      >();
      for (const row of typedSkill) {
        const prev = bySkill.get(row.skill_area) ?? { correct: 0, total: 0 };
        bySkill.set(row.skill_area, {
          correct: prev.correct + row.correct_count,
          total: prev.total + row.total_count,
        });
      }

      const next: SkillMastery = { ...EMPTY_MASTERY };
      for (const [skill, agg] of bySkill.entries()) {
        next[skill] =
          agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0;
      }

      setMastery(next);
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []); // one-shot on mount; user resolved inside the effect

  return { mastery, loading };
}
