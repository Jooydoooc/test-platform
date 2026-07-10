"use client";

// Single source of truth for a student's lifetime XP + level. Used by both the
// top-bar XP pill (SiteHeader) and the dashboard so the two never disagree.
//
// XP model: for every test a student has attempted, take their BEST run and
// award best% × (test's total points × 20). Retaking to improve raises XP;
// re-taking without beating your best does not.

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth";
import { maxScore, useAttempts, useTests } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import type { Attempt, Test } from "@/lib/types";

export const XP_LEVELS = [
  { name: "Beginner", min: 0 },
  { name: "Elementary", min: 200 },
  { name: "Pre-IELTS", min: 600 },
  { name: "IELTS Intro", min: 1200 },
  { name: "IELTS Graduate", min: 2200 },
] as const;

export interface LevelInfo {
  name: string;
  next: { name: string; min: number } | null;
  progress: number; // 0..100 through the current level
  toNext: number; // XP remaining to the next level (0 at max)
}

export function levelFor(xp: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i].min) idx = i;
  const cur = XP_LEVELS[idx];
  const next = XP_LEVELS[idx + 1] ?? null;
  const progress = next
    ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100)
    : 100;
  return { name: cur.name, next, progress, toNext: next ? next.min - xp : 0 };
}

/** Lifetime XP from a student's own attempts (best run per test). */
export function computeXp(mine: Attempt[], tests: Test[]): number {
  const bestByTest = new Map<string, number>();
  for (const a of mine) {
    const p = a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0;
    bestByTest.set(a.testId, Math.max(bestByTest.get(a.testId) ?? 0, p));
  }
  const testById = new Map(tests.map((t) => [t.id, t]));
  let xp = 0;
  for (const [testId, bestPct] of bestByTest) {
    const t = testById.get(testId);
    if (t) xp += Math.round((bestPct / 100) * maxScore(t) * 20);
  }
  return xp;
}

/**
 * Reactive XP + level for the signed-in student.
 *
 * Source of truth is the real backend: the sum of the student's own
 * `points_ledger` rows (server-graded tests award EXP there). Students can read
 * their own ledger under RLS, so this is a direct client read. When Supabase
 * isn't configured (the localStorage prototype), it falls back to computing EXP
 * from local attempts so the prototype keeps working.
 */
export function useStudentXp(): { xp: number; level: LevelInfo } {
  const { user } = useSession();
  const attempts = useAttempts();
  const tests = useTests();
  const [realXp, setRealXp] = useState<number | null>(null);

  const isStudent = user?.role === "student";

  useEffect(() => {
    if (!SUPABASE_ENABLED || !isStudent || !user?.id) {
      setRealXp(null);
      return;
    }
    const supabase = createClient();
    let active = true;
    supabase
      .from("points_ledger")
      .select("points")
      .eq("student_id", user.id)
      .then(({ data }) => {
        if (active) {
          setRealXp((data ?? []).reduce((sum, r) => sum + r.points, 0));
        }
      });
    return () => {
      active = false;
    };
  }, [isStudent, user?.id]);

  return useMemo(() => {
    // Real backend EXP when available; otherwise the local prototype estimate.
    if (SUPABASE_ENABLED) {
      const xp = realXp ?? 0;
      return { xp, level: levelFor(xp) };
    }
    if (!user) return { xp: 0, level: levelFor(0) };
    const name = user.name.trim().toLowerCase();
    const mine = attempts.filter(
      (a) => a.takerName.trim().toLowerCase() === name,
    );
    const xp = computeXp(mine, tests);
    return { xp, level: levelFor(xp) };
  }, [realXp, user, attempts, tests]);
}
