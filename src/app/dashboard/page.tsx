"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, LinkButton, ProgressBar } from "@/components/ui";
import { ArrowIcon, LogOutIcon, SlidersIcon, TrophyIcon } from "@/components/icons";
import { logout, useSession } from "@/lib/auth";
import { useAttempts } from "@/lib/store";
import type { Attempt } from "@/lib/types";

function pct(a: Attempt): number {
  return a.maxScore > 0 ? a.score / a.maxScore : 0;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function DashboardPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const attempts = useAttempts();

  // This user's own completed tests (attempts are stored by taker name).
  const mine = useMemo(() => {
    if (!user) return [];
    const name = user.name.trim().toLowerCase();
    return attempts.filter((a) => a.takerName.trim().toLowerCase() === name);
  }, [attempts, user]);

  const stats = useMemo(() => {
    if (mine.length === 0) return { count: 0, avg: 0, best: 0, tests: 0 };
    const pcts = mine.map(pct);
    return {
      count: mine.length,
      avg: Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 100),
      best: Math.round(Math.max(...pcts) * 100),
      tests: new Set(mine.map((a) => a.testId)).size,
    };
  }, [mine]);

  // Top scores overall (best % first), for the leaderboard at the top.
  const top = useMemo(
    () =>
      [...attempts]
        .sort((a, b) => pct(b) - pct(a) || b.score - a.score)
        .slice(0, 8),
    [attempts],
  );

  const recent = useMemo(
    () =>
      [...mine].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 8),
    [mine],
  );

  // AuthGate handles the redirect for signed-out users; render nothing meanwhile.
  if (loading || !user) return null;

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  function signOut() {
    logout();
    router.replace("/login");
  }

  const myName = user.name.trim().toLowerCase();

  return (
    <div className="space-y-8">
      {/* Identity strip */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-card"
          >
            {initial}
          </span>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {user.name}
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>@{user.username}</span>
              <Badge tone="brand" className="capitalize">
                {user.role}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={signOut}
          className="gap-2 self-start sm:self-auto"
        >
          <LogOutIcon width={16} height={16} />
          Log out
        </Button>
      </section>

      {/* Leaderboard — top of the page */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <TrophyIcon width={20} height={20} className="text-amber-500" />
            Leaderboard
          </h2>
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            View full
            <ArrowIcon />
          </Link>
        </div>
        {top.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">
              No scores yet. Take a test to appear on the leaderboard.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Player</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">
                    Test
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {top.map((a, i) => {
                  const p = Math.round(pct(a) * 100);
                  const isMe = a.takerName.trim().toLowerCase() === myName;
                  return (
                    <tr
                      key={a.id}
                      className={`border-b border-slate-100 last:border-0 ${
                        isMe ? "bg-brand-50/60" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">
                        {MEDALS[i] ?? i + 1}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {a.takerName}
                        {isMe && (
                          <span className="ml-2 text-xs font-medium text-brand-600">
                            You
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">
                        {a.testTitle}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-600">
                        {p}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Your progress */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Your progress</h2>
        {stats.count === 0 ? (
          <Card className="space-y-3">
            <p className="text-sm text-slate-600">
              You haven&rsquo;t completed any tests yet. Take one and your
              results will show up here.
            </p>
            <LinkButton href="/tests">Browse tests</LinkButton>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Attempts" value={stats.count} />
            <Stat label="Average" value={`${stats.avg}%`} progress={stats.avg} />
            <Stat
              label="Best"
              value={`${stats.best}%`}
              progress={stats.best}
              tone="amber"
            />
            <Stat label="Tests taken" value={stats.tests} />
          </div>
        )}
      </section>

      {/* Recent results */}
      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent results
          </h2>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Test</th>
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
          </Card>
        </section>
      )}

      {/* Shortcuts */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Shortcuts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LinkCard
            href="/tests"
            icon={<ArrowIcon />}
            title="Browse tests"
            desc="Find a test and start a new attempt."
          />
          <LinkCard
            href="/leaderboard"
            icon={<TrophyIcon />}
            title="Leaderboard"
            desc="See where you stand against your classmates."
          />
          {user.role === "teacher" && (
            <LinkCard
              href="/admin"
              icon={<SlidersIcon />}
              title="Teacher tools"
              desc="Manage students, content, and integrations."
              accent
            />
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  progress,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  progress?: number;
  tone?: "brand" | "amber";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
      {progress !== undefined && (
        <ProgressBar value={progress} tone={tone} className="mt-2.5" />
      )}
    </Card>
  );
}

function LinkCard({
  href,
  icon,
  title,
  desc,
  accent = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card className="flex h-full flex-col gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset ${
            accent
              ? "bg-amber-50 text-amber-600 ring-amber-600/15"
              : "bg-brand-50 text-brand-600 ring-brand-600/15"
          }`}
        >
          {icon}
        </span>
        <div className="flex-1 space-y-1">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">{desc}</p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
          Open
          <ArrowIcon />
        </span>
      </Card>
    </Link>
  );
}
