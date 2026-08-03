"use client";

import { useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { useAttempts } from "@/lib/store";
import { useMyAttempts } from "@/lib/data/my-attempts";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { useSession } from "@/lib/auth";

// A single row shape the table renders, sourced from either the real Supabase
// history (useMyAttempts) or the localStorage prototype store (useAttempts).
interface ResultRow {
  id: string;
  testId: string;
  testTitle: string;
  score: number;
  maxScore: number;
  submittedAt: number;
}

export default function ResultsPage() {
  const { user } = useSession();
  // Both hooks are called unconditionally (rules of hooks); we pick the source
  // below. When Supabase is off, useMyAttempts returns [] immediately; when it's
  // on, the localStorage store is empty for server-graded tests.
  const { attempts: supaAttempts, loading: supaLoading } = useMyAttempts();
  const localAttempts = useAttempts();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("r") ?? null;
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const loading = SUPABASE_ENABLED ? supaLoading : false;

  // Normalise the active source to ResultRow[], newest first. useMyAttempts
  // already scopes to the signed-in student and sorts; the local store is a
  // shared array, so we filter it by the signed-in name for shared-device safety.
  const mine = useMemo<ResultRow[]>(() => {
    if (SUPABASE_ENABLED) {
      return supaAttempts.map((a) => ({
        id: a.id,
        testId: a.testId,
        testTitle: a.testTitle,
        score: a.score,
        maxScore: a.maxScore,
        submittedAt: a.submittedAt,
      }));
    }
    if (!user) return [];
    const name = user.name.trim().toLowerCase();
    return localAttempts
      .filter((a) => a.takerName.trim().toLowerCase() === name)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((a) => ({
        id: a.id,
        testId: a.testId,
        testTitle: a.testTitle,
        score: a.score,
        maxScore: a.maxScore,
        submittedAt: a.submittedAt,
      }));
  }, [supaAttempts, localAttempts, user]);

  // Scroll the highlighted row into view after render.
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Results</h1>
        <p className="text-sm text-slate-600">
          Every completed attempt, most recent first.
        </p>
      </div>

      {loading ? (
        <Card className="py-12 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
          <p className="text-sm text-slate-500">Loading your results…</p>
        </Card>
      ) : mine.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-600">No results yet. Take a test to see your results here.</p>
          <LinkButton href="/tests" variant="secondary" className="mt-4">
            Browse tests
          </LinkButton>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Test</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">%</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((a) => {
                const pct =
                  a.maxScore > 0
                    ? Math.round((a.score / a.maxScore) * 100)
                    : 0;
                const isHighlighted = highlightId === a.id;
                return (
                  <tr
                    key={a.id}
                    ref={isHighlighted ? highlightRef : null}
                    className={`border-b border-slate-100 last:border-0 transition-colors ${
                      isHighlighted ? "bg-brand-50 ring-2 ring-inset ring-brand-300" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">
                      {a.testTitle}
                      {isHighlighted && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Latest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.score} / {a.maxScore}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        pct >= 50 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {pct}%
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(a.submittedAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
