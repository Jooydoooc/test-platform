"use client";

// Data layer for hosted HTML tests (the `html_tests` table, served at
// /ht/<share_token>). These are self-contained, self-grading exam files — unlike
// DB tests (tests -> tasks -> questions) they have no local question rows, so the
// Test Center can't source them from the legacy localStorage store. This hook
// surfaces them so students can BROWSE hosted tests, not just open a shared link.
//
// Supabase-only by design (mirrors my-attempts.ts / xp.ts): returns an empty
// list immediately when the backend isn't configured. Read side only — uploads
// go through /api/tests/html (admin) or the direct upload script.
//
// RLS (migration 0025): html_tests_select returns only the tests this student
// has an attempt on — i.e. the ones an admin's share link has unlocked. Tests
// are not a browsable catalog; this hook is "my tests", and the filtering is
// done by the database, not by this query. Admins still see everything.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import type { Level, TestSkillScope } from "@/lib/database.types";

export interface HostedTest {
  /** html_tests.id */
  id: string;
  /** html_tests.title */
  title: string;
  /** html_tests.skill_scope — maps to a Test Center group */
  skillScope: TestSkillScope;
  /** html_tests.level (nullable) */
  level: Level | null;
  /** html_tests.share_token — the /ht/<token> path segment */
  shareToken: string;
  /** html_tests.created_at as epoch ms (for "Newest" sorting) */
  createdAt: number;
  /**
   * attempts.submitted_at as epoch ms for this student's attempt on this test,
   * or null if they haven't finished it. Hosted attempts carry html_test_id
   * (not test_id), so useMyAttempts — which filters to test_id — never sees
   * them; the Test Center needs this to show completion state.
   */
  completedAt: number | null;
}

// html_tests isn't in the hand-authored database.types subset, so type the
// selected row explicitly (same approach as my-attempts.ts casts).
type HtmlTestRow = {
  id: string;
  title: string;
  skill_scope: TestSkillScope;
  level: Level | null;
  share_token: string;
  created_at: string;
};

/**
 * Reactive hook: returns all hosted HTML tests, newest-first. Returns
 * `{ hosted: [], loading: false }` immediately when Supabase is off. One-shot
 * fetch on mount with an `active` guard (mirrors useMyAttempts).
 */
export function useHostedTests(): { hosted: HostedTest[]; loading: boolean } {
  const [hosted, setHosted] = useState<HostedTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setHosted([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let active = true;

    async function load() {
      // RLS requires a signed-in user; if there's no session, show nothing.
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!authUser) {
        setHosted([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("html_tests")
        .select("id, title, skill_scope, level, share_token, created_at")
        .order("created_at", { ascending: false });

      if (!active) return;
      if (error || !data) {
        setHosted([]);
        setLoading(false);
        return;
      }

      const rows = data as unknown as HtmlTestRow[];

      // Which of these has the student already finished? RLS on attempts scopes
      // this to their own rows; a failure here only costs the completion badge,
      // so it must not blank out the test list.
      const submittedAtByTest = new Map<string, number>();
      if (rows.length > 0) {
        const { data: attemptRows } = await supabase
          .from("attempts")
          .select("html_test_id, submitted_at")
          .eq("student_id", authUser.id)
          .in(
            "html_test_id",
            rows.map((r) => r.id),
          )
          .not("submitted_at", "is", null);

        if (!active) return;
        for (const a of (attemptRows ?? []) as unknown as {
          html_test_id: string | null;
          submitted_at: string;
        }[]) {
          if (a.html_test_id) {
            submittedAtByTest.set(a.html_test_id, Date.parse(a.submitted_at));
          }
        }
      }

      setHosted(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          skillScope: r.skill_scope,
          level: r.level,
          shareToken: r.share_token,
          createdAt: Date.parse(r.created_at),
          completedAt: submittedAtByTest.get(r.id) ?? null,
        })),
      );
      setLoading(false);
    }

    // Never hang the Test Center if the fetch throws (auth/network).
    load().catch(() => {
      if (active) {
        setHosted([]);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []); // one-shot on mount; identity resolved inside

  return { hosted, loading };
}

// ---------------------------------------------------------------------------
// Mapping helpers shared with the Test Center.
// ---------------------------------------------------------------------------

/** Level enum -> short display label (mirrors LEVEL_OPTIONS in lib/books.ts). */
export const HOSTED_LEVEL_LABEL: Record<Level, string> = {
  BEGINNER: "Beginner",
  ELEMENTARY: "Elementary",
  PRE_IELTS: "Pre-IELTS",
  IELTS_INTRODUCTION: "IELTS Introduction",
  IELTS_GRADUATION: "IELTS Graduation",
};
