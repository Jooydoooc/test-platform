"use client";

import { useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { useAttempts } from "@/lib/store";
import { useSession } from "@/lib/auth";

export default function ResultsPage() {
  const { user } = useSession();
  const attempts = useAttempts();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("r") ?? null;
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  // Filter to current user only — shared-device safety.
  const mine = useMemo(() => {
    if (!user) return [];
    const name = user.name.trim().toLowerCase();
    return attempts
      .filter((a) => a.takerName.trim().toLowerCase() === name)
      .sort((a, b) => b.submittedAt - a.submittedAt);
  }, [attempts, user]);

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

      {mine.length === 0 ? (
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
                <th className="px-4 py-3 font-medium"></th>
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
                    <td className="px-4 py-3">
                      <Link
                        href={`/tests/${a.testId}`}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Take again
                      </Link>
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
