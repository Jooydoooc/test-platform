"use client";

// Data layer for a signed-in student's own graded-test history.
//
// This hook is Supabase-only by design. When SUPABASE_ENABLED is false it
// returns an empty list immediately (no localStorage fallback — that data lives
// in the legacy store.ts, which this is designed to eventually replace).
//
// READ SIDE ONLY. The write side is src/lib/data/submit.ts.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";   // mirrored from xp.ts:13
import { SUPABASE_ENABLED } from "@/lib/supabase/env";  // mirrored from xp.ts:14
import type { ResultStatus } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MyAttempt {
  /** attempts.id */
  id: string;
  /** attempts.test_id */
  testId: string;
  /** tests.title */
  testTitle: string;
  /** sum(result_skill_scores.correct_count) for this result */
  score: number;
  /** sum(result_skill_scores.total_count) for this result */
  maxScore: number;
  /** score / maxScore, or 0 when maxScore === 0 */
  accuracy: number;
  /** results.status — COMPLETED | PENDING_REVIEW */
  status: ResultStatus;
  /** results.excluded_from_progress (true for PLACEMENT tests) */
  excludedFromProgress: boolean;
  /** attempts.submitted_at as epoch ms */
  submittedAt: number;
}

// ---------------------------------------------------------------------------
// Internal query-row shapes (typed explicitly — no `any`)
// ---------------------------------------------------------------------------

type AttemptResultRow = {
  id: string;
  test_id: string;
  submitted_at: string;
  results: {
    id: string;
    status: ResultStatus;
    excluded_from_progress: boolean;
  } | null;
};

type SkillScoreRow = {
  result_id: string;
  correct_count: number;
  total_count: number;
};

type TestTitleRow = {
  id: string;
  title: string;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Reactive hook: returns the signed-in student's completed test attempts,
 * sorted newest-first. Returns `{ attempts: [], loading: false }` immediately
 * when Supabase is not configured.
 *
 * Structure mirrors useStudentXp (src/lib/xp.ts): one-shot fetch on mount
 * keyed by user id, `active` flag for safe async, no subscription needed for
 * this phase (history doesn't change while the student is viewing it).
 */
export function useMyAttempts(): { attempts: MyAttempt[]; loading: boolean } {
  const [attempts, setAttempts] = useState<MyAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Gate: when Supabase isn't configured, skip entirely.
    if (!SUPABASE_ENABLED) {
      setAttempts([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let active = true;

    async function load() {
      // Step 1 — who is the current user?
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!active) return;
      if (!authUser) {
        setAttempts([]);
        setLoading(false);
        return;
      }

      const studentId = authUser.id;

      // Step 2 — fetch attempts that have been submitted AND have a results row.
      //
      // Strategy: multiple sequential queries (mirroring books-client.ts
      // Promise.all pattern for independent tables, sequential where one result
      // feeds the next). A deep nested select across 4 tables with RLS on each
      // risks opaque PostgREST join errors; explicit queries are easier to debug
      // and match the codebase style in books-client.ts and data/attempts.ts.
      //
      // attempts → joined results (PostgREST inner-join via !inner) to exclude
      // rows with no result yet. RLS on attempts filters to student_id = auth.uid().
      const { data: attemptRows, error: attErr } = await supabase
        .from("attempts")
        .select(
          "id, test_id, submitted_at, results!inner(id, status, excluded_from_progress)",
        )
        .eq("student_id", studentId)
        .not("submitted_at", "is", null)
        .not("test_id", "is", null)
        .order("submitted_at", { ascending: false });

      if (!active) return;
      if (attErr || !attemptRows || attemptRows.length === 0) {
        setAttempts([]);
        setLoading(false);
        return;
      }

      // TypeScript: PostgREST returns the joined table as array or object
      // depending on cardinality. `results` is one-to-one (UNIQUE attempt_id),
      // so PostgREST returns it as an object. We cast via the explicit row type.
      const typed = attemptRows as unknown as AttemptResultRow[];

      // Keep only rows where the results join actually returned a value (type
      // narrowing after the cast, in case any slipped through).
      const valid = typed.filter(
        (r): r is AttemptResultRow & { results: NonNullable<AttemptResultRow["results"]> } =>
          r.results !== null && r.test_id !== null,
      );

      if (valid.length === 0) {
        setAttempts([]);
        setLoading(false);
        return;
      }

      const resultIds = valid.map((r) => r.results.id);
      const testIds = [...new Set(valid.map((r) => r.test_id))];

      // Step 3 — fetch skill scores + test titles in parallel.
      const [{ data: skillRows }, { data: testRows }] = await Promise.all([
        supabase
          .from("result_skill_scores")
          .select("result_id, correct_count, total_count")
          .in("result_id", resultIds),
        supabase
          .from("tests")
          .select("id, title")
          .in("id", testIds),
      ]);

      if (!active) return;

      const skillData = (skillRows ?? []) as SkillScoreRow[];
      const testData = (testRows ?? []) as TestTitleRow[];

      // Step 4 — aggregate skill scores by result_id.
      const scoreByResult = new Map<string, { score: number; maxScore: number }>();
      for (const row of skillData) {
        const prev = scoreByResult.get(row.result_id) ?? { score: 0, maxScore: 0 };
        scoreByResult.set(row.result_id, {
          score: prev.score + row.correct_count,
          maxScore: prev.maxScore + row.total_count,
        });
      }

      // Step 5 — index test titles.
      const titleById = new Map<string, string>(
        testData.map((t) => [t.id, t.title]),
      );

      // Step 6 — map to MyAttempt[].
      const mapped: MyAttempt[] = valid.map((row) => {
        const agg = scoreByResult.get(row.results.id) ?? { score: 0, maxScore: 0 };
        const accuracy = agg.maxScore > 0 ? agg.score / agg.maxScore : 0;
        return {
          id: row.id,
          testId: row.test_id,
          testTitle: titleById.get(row.test_id) ?? "Unknown test",
          score: agg.score,
          maxScore: agg.maxScore,
          accuracy,
          status: row.results.status,
          excludedFromProgress: row.results.excluded_from_progress,
          submittedAt: Date.parse(row.submitted_at),
        };
      });

      // Already sorted desc by submitted_at from the DB query; re-sort after
      // mapping in case Date.parse produced any NaN sentinel values.
      mapped.sort((a, b) => b.submittedAt - a.submittedAt);

      setAttempts(mapped);
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []); // one-shot on mount; user identity is resolved inside the effect

  return { attempts, loading };
}
