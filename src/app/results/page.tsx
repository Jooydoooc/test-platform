"use client";

import { Card } from "@/components/ui";
import { useAttempts } from "@/lib/store";

export default function ResultsPage() {
  const attempts = useAttempts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-sm text-slate-600">
          Every completed attempt, most recent first.
        </p>
      </div>

      {attempts.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No attempts yet. Take a test to see results here.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Test</th>
                <th className="px-4 py-3 font-medium">Taker</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">%</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => {
                const pct =
                  a.maxScore > 0
                    ? Math.round((a.score / a.maxScore) * 100)
                    : 0;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{a.testTitle}</td>
                    <td className="px-4 py-3 text-slate-600">{a.takerName}</td>
                    <td className="px-4 py-3">
                      {a.score} / {a.maxScore}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        pct >= 50 ? "text-green-600" : "text-red-600"
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
