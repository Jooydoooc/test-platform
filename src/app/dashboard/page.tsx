"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui";
import { useAttempts } from "@/lib/store";
import type { Attempt } from "@/lib/types";

function pct(a: Attempt): number {
  return a.maxScore > 0 ? a.score / a.maxScore : 0;
}

export default function DashboardPage() {
  const attempts = useAttempts();

  const stats = useMemo(() => {
    if (attempts.length === 0) {
      return { count: 0, avg: 0, best: 0, tests: 0 };
    }
    const avg =
      attempts.reduce((s, a) => s + pct(a), 0) / attempts.length;
    const best = Math.max(...attempts.map(pct));
    const tests = new Set(attempts.map((a) => a.testId)).size;
    return {
      count: attempts.length,
      avg: Math.round(avg * 100),
      best: Math.round(best * 100),
      tests,
    };
  }, [attempts]);

  // Top scores overall (best % first), for the mini leaderboard.
  const top = useMemo(
    () =>
      [...attempts]
        .sort((a, b) => pct(b) - pct(a) || b.score - a.score)
        .slice(0, 5),
    [attempts],
  );

  const recent = useMemo(
    () => [...attempts].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 8),
    [attempts],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Your progress, recent results, and the top of the leaderboard.
        </p>
      </div>

      {/* Progress stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Attempts" value={stats.count} />
        <Stat label="Average" value={`${stats.avg}%`} />
        <Stat label="Best" value={`${stats.best}%`} />
        <Stat label="Tests taken" value={stats.tests} />
      </div>

      {attempts.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No attempts yet. Take a test to start filling your dashboard.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent results */}
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900">Recent results</h2>
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Test</th>
                    <th className="px-4 py-2.5 font-medium">Taker</th>
                    <th className="px-4 py-2.5 text-right font-medium">Score</th>
                    <th className="px-4 py-2.5 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((a) => {
                    const p = Math.round(pct(a) * 100);
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {a.testTitle}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {a.takerName}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {a.score}/{a.maxScore}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                            p >= 50 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {p}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>

          {/* Mini leaderboard */}
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900">🏆 Top scores</h2>
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Player</th>
                    <th className="px-4 py-2.5 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((a, i) => {
                    const p = Math.round(pct(a) * 100);
                    const medal = ["🥇", "🥈", "🥉"][i] ?? i + 1;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-2.5 tabular-nums text-slate-500">
                          {medal}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {a.takerName}
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            {a.testTitle}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-green-600">
                          {p}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
