"use client";

// Streak computation for the signed-in student, sourced from points_ledger.
//
// Mirrors the useStudentXp / useMyAttempts pattern exactly:
//   - SUPABASE_ENABLED gate
//   - keyed by user.id (via supabase.auth.getUser())
//   - one-shot fetch on mount; `active` flag for safe async teardown
//   - no `any`
//
// Strategy: fetch the student's own points_ledger rows (created_at dates),
// convert them to epoch-ms, then pass to the existing streaks() helper in
// dashboard/page.tsx (mirrored here to avoid a circular import). RLS on
// points_ledger (student_id = auth.uid()) scopes rows to the caller.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// ---------------------------------------------------------------------------
// Streak helper (mirrored from dashboard/page.tsx local definition to keep
// this file self-contained; same algorithm, same constant).
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

function streaks(dates: number[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };
  const days = [...new Set(dates.map((d) => Math.floor(d / DAY)))].sort(
    (a, b) => a - b,
  );
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const set = new Set(days);
  const today = Math.floor(Date.now() / DAY);
  let cursor = set.has(today) ? today : set.has(today - 1) ? today - 1 : null;
  let current = 0;
  while (cursor !== null && set.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, longest };
}

// ---------------------------------------------------------------------------
// Internal query-row shape
// ---------------------------------------------------------------------------

type LedgerDateRow = {
  created_at: string;
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StreakResult {
  current: number;
  longest: number;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the signed-in student's current and longest activity streaks,
 * derived from the dates of their points_ledger entries (each row represents
 * a day they earned XP). Falls back to { current: 0, longest: 0 } immediately
 * when Supabase is not configured.
 */
export function useStreak(): StreakResult {
  const [current, setCurrent] = useState(0);
  const [longest, setLongest] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setCurrent(0);
      setLongest(0);
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
        setCurrent(0);
        setLongest(0);
        setLoading(false);
        return;
      }

      // Step 2 — fetch all points_ledger created_at values for this student.
      // Only the date matters, so we select just created_at. RLS scopes to
      // student_id = auth.uid().
      const { data: rows, error } = await supabase
        .from("points_ledger")
        .select("created_at")
        .eq("student_id", authUser.id);

      if (!active) return;
      if (error || !rows) {
        setCurrent(0);
        setLongest(0);
        setLoading(false);
        return;
      }

      const typedRows = rows as LedgerDateRow[];
      const dates = typedRows
        .map((r) => Date.parse(r.created_at))
        .filter((d) => !isNaN(d));

      const s = streaks(dates);
      setCurrent(s.current);
      setLongest(s.longest);
      setLoading(false);
    }

    // If any await inside load() throws, clear loading so the dashboard's
    // combined loading gate can never hang on this hook.
    load().catch(() => {
      if (active) {
        setCurrent(0);
        setLongest(0);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []); // one-shot on mount

  return { current, longest, loading };
}
