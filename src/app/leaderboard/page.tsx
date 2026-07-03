"use client";

import { useMemo, useState } from "react";
import { Card, inputClass } from "@/components/ui";
import { TrophyIcon } from "@/components/icons";
import { useAttempts } from "@/lib/store";
import { LEVELS, type Attempt } from "@/lib/types";

type Category = "overall" | "group" | "level" | "test";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "overall", label: "Overall" },
  { value: "group", label: "Group" },
  { value: "level", label: "Level" },
  { value: "test", label: "Test" },
];

const UNSPECIFIED = "Unspecified";

function pct(a: Attempt): number {
  return a.maxScore > 0 ? a.score / a.maxScore : 0;
}

// Best entries first: higher %, then higher raw score, then earlier submission.
function rank(a: Attempt, b: Attempt): number {
  return pct(b) - pct(a) || b.score - a.score || a.submittedAt - b.submittedAt;
}

function keyFor(a: Attempt, cat: Category): string {
  if (cat === "group") return a.group?.trim() || UNSPECIFIED;
  if (cat === "level") return a.level || UNSPECIFIED;
  if (cat === "test") return a.testTitle;
  return "All players";
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const attempts = useAttempts();
  const [category, setCategory] = useState<Category>("overall");

  const sections = useMemo(() => {
    const groups = new Map<string, Attempt[]>();
    for (const a of attempts) {
      const k = keyFor(a, category);
      const list = groups.get(k);
      if (list) list.push(a);
      else groups.set(k, [a]);
    }
    for (const list of groups.values()) list.sort(rank);

    const order = (k: string) => {
      if (category === "level") {
        const i = (LEVELS as readonly string[]).indexOf(k);
        return i === -1 ? LEVELS.length : i;
      }
      return 0;
    };

    return [...groups.entries()].sort(
      ([ka, la], [kb, lb]) =>
        order(ka) - order(kb) || lb.length - la.length || ka.localeCompare(kb),
    );
  }, [attempts, category]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <TrophyIcon width={24} height={24} className="text-amber-500" />
            Leaderboard
          </h1>
          <p className="text-sm text-slate-600">
            Top scores ranked by percentage.
          </p>
        </div>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Categorise by
          </span>
          <select
            className={`${inputClass} sm:w-44`}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {attempts.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No scores yet. Take a test to appear on the leaderboard.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {sections.map(([title, rows]) => (
            <LeaderboardSection
              key={title}
              title={title}
              rows={rows}
              showCategory={category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderboardSection({
  title,
  rows,
  showCategory,
}: {
  title: string;
  rows: Attempt[];
  showCategory: Category;
}) {
  return (
    <Card className="overflow-hidden p-0">
      {showCategory !== "overall" && (
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <span className="text-xs text-slate-500">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Player</th>
              {showCategory !== "group" && (
                <th className="hidden px-4 py-2 font-medium sm:table-cell">
                  Group
                </th>
              )}
              {showCategory !== "level" && (
                <th className="hidden px-4 py-2 font-medium sm:table-cell">
                  Level
                </th>
              )}
              {showCategory !== "test" && (
                <th className="hidden px-4 py-2 font-medium md:table-cell">
                  Test
                </th>
              )}
              <th className="px-4 py-2 text-right font-medium">Score</th>
              <th className="px-4 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => {
              const p = Math.round(pct(a) * 100);
              return (
                <tr
                  key={a.id}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="px-4 py-2.5 tabular-nums text-slate-500">
                    {MEDALS[i] ?? i + 1}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {a.takerName}
                  </td>
                  {showCategory !== "group" && (
                    <td className="hidden px-4 py-2.5 text-slate-600 sm:table-cell">
                      {a.group || "—"}
                    </td>
                  )}
                  {showCategory !== "level" && (
                    <td className="hidden px-4 py-2.5 text-slate-600 sm:table-cell">
                      {a.level || "—"}
                    </td>
                  )}
                  {showCategory !== "test" && (
                    <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell">
                      {a.testTitle}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {a.score}/{a.maxScore}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                      p >= 50 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {p}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
