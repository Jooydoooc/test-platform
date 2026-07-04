"use client";

import { useMemo } from "react";
import { Card, LinkButton, ProgressBar } from "@/components/ui";
import {
  BookIcon,
  ChartIcon,
  CheckSquareIcon,
  TrophyIcon,
} from "@/components/icons";
import { useAttempts, useTests } from "@/lib/store";
import type { Attempt, Test } from "@/lib/types";

function pct(a: Attempt): number {
  return a.maxScore > 0 ? a.score / a.maxScore : 0;
}

// >=80% reads as strong, >=50% as passing, below as needing review. Colours
// stay muted (success / info / error tokens) per DESIGN_STYLE.md.
function toneFor(p: number): "success" | "brand" | "error" {
  if (p >= 80) return "success";
  if (p >= 50) return "brand";
  return "error";
}

function textToneFor(p: number): string {
  return p >= 80
    ? "text-success"
    : p >= 50
      ? "text-slate-700"
      : "text-error";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / day);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type TestAgg = {
  testId: string;
  testTitle: string;
  avg: number; // 0–1
  count: number;
};

export default function DashboardPage() {
  const attempts = useAttempts();
  const tests = useTests();

  // The last person to submit on this device — used only to greet and to
  // highlight their row on the leaderboard. Honest signal, no fake identity.
  const studentName = useMemo(
    () =>
      [...attempts].sort((a, b) => b.submittedAt - a.submittedAt)[0]?.takerName,
    [attempts],
  );

  const stats = useMemo(() => {
    if (attempts.length === 0) {
      return { count: 0, avg: 0, best: 0, tests: 0, trend: null as number | null };
    }
    const avg = attempts.reduce((s, a) => s + pct(a), 0) / attempts.length;
    const best = Math.max(...attempts.map(pct));
    const tests = new Set(attempts.map((a) => a.testId)).size;

    // Trend: average of the 3 most recent attempts vs the 3 before them, in
    // percentage points. Only meaningful once there are at least 4 attempts.
    let trend: number | null = null;
    if (attempts.length >= 4) {
      const byTime = [...attempts].sort((a, b) => a.submittedAt - b.submittedAt);
      const recent = byTime.slice(-3);
      const prior = byTime.slice(-6, -3);
      if (prior.length > 0) {
        const rAvg = recent.reduce((s, a) => s + pct(a), 0) / recent.length;
        const pAvg = prior.reduce((s, a) => s + pct(a), 0) / prior.length;
        trend = Math.round((rAvg - pAvg) * 100);
      }
    }

    return {
      count: attempts.length,
      avg: Math.round(avg * 100),
      best: Math.round(best * 100),
      tests,
      trend,
    };
  }, [attempts]);

  const recent = useMemo(
    () =>
      [...attempts]
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .slice(0, 6),
    [attempts],
  );

  // Per-test averages — the basis for both "review" (weakest) and the
  // recommendation. All from real attempt data.
  const byTest = useMemo<TestAgg[]>(() => {
    const map = new Map<string, { title: string; sum: number; n: number }>();
    for (const a of attempts) {
      const cur = map.get(a.testId) ?? { title: a.testTitle, sum: 0, n: 0 };
      cur.sum += pct(a);
      cur.n += 1;
      map.set(a.testId, cur);
    }
    return [...map.entries()].map(([testId, v]) => ({
      testId,
      testTitle: v.title,
      avg: v.sum / v.n,
      count: v.n,
    }));
  }, [attempts]);

  const weakest = useMemo(
    () => [...byTest].sort((a, b) => a.avg - b.avg).slice(0, 3),
    [byTest],
  );

  // Recommend a test the student hasn't tried yet; if they've tried them all,
  // point them back at their lowest-scoring test to review.
  const recommendation = useMemo<
    { test: Test; reason: string } | null
  >(() => {
    if (tests.length === 0) return null;
    const done = new Set(attempts.map((a) => a.testId));
    const fresh = tests.find((t) => !done.has(t.id));
    if (fresh) {
      return { test: fresh, reason: "You haven't taken this one yet." };
    }
    const weak = weakest[0];
    const match = weak && tests.find((t) => t.id === weak.testId);
    if (match) {
      return {
        test: match,
        reason: `Your lowest average so far — ${Math.round(weak.avg * 100)}%.`,
      };
    }
    return { test: tests[0], reason: "Keep your streak going." };
  }, [tests, attempts, weakest]);

  // Leaderboard: top 5 by best percentage. If the current student isn't in the
  // top 5, their best row is pinned below so they always know where they stand.
  const leaderboard = useMemo(() => {
    const ranked = [...attempts].sort(
      (a, b) => pct(b) - pct(a) || b.score - a.score,
    );
    const top = ranked.slice(0, 5);
    let pinned: { attempt: Attempt; rank: number } | null = null;
    if (studentName && !top.some((a) => a.takerName === studentName)) {
      const idx = ranked.findIndex((a) => a.takerName === studentName);
      if (idx >= 0) pinned = { attempt: ranked[idx], rank: idx + 1 };
    }
    return { top, pinned };
  }, [attempts, studentName]);

  const hasData = attempts.length > 0;

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <section className="overflow-hidden rounded-2xl bg-brand-600 p-6 text-white sm:p-8">
        <p className="text-sm text-brand-200">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {studentName ? `Welcome back, ${studentName}` : "Welcome to Lexora"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-brand-100">
          {hasData
            ? "Here's your progress, what to review next, and where you stand."
            : "Take your first test to start tracking your progress."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {recommendation ? (
            <LinkButton
              href={`/practice/${recommendation.test.id}`}
              className="bg-accent-500 text-brand-700 hover:bg-accent-400 active:bg-accent-600"
            >
              Continue practising
            </LinkButton>
          ) : (
            <LinkButton
              href="/tests"
              className="bg-accent-500 text-brand-700 hover:bg-accent-400 active:bg-accent-600"
            >
              Browse tests
            </LinkButton>
          )}
          <LinkButton
            href="/tests"
            className="border border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            All tests
          </LinkButton>
        </div>
      </section>

      {/* Progress summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Average score"
          value={`${stats.avg}%`}
          progress={hasData ? stats.avg : undefined}
          tone={toneFor(stats.avg)}
          trend={stats.trend}
        />
        <Stat
          label="Best score"
          value={`${stats.best}%`}
          progress={hasData ? stats.best : undefined}
          tone="amber"
        />
        <Stat label="Total attempts" value={stats.count} />
        <Stat label="Tests completed" value={stats.tests} />
      </div>

      {!hasData ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <ChartIcon width={28} height={28} className="text-slate-400" />
          <p className="max-w-sm text-sm text-slate-600">
            No attempts yet. Take a test to start filling your dashboard with
            scores, review topics, and your leaderboard position.
          </p>
          <LinkButton href="/tests" className="mt-1">
            Browse tests
          </LinkButton>
        </Card>
      ) : (
        <>
          {/* Tier: recent results + leaderboard */}
          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard
              className="lg:col-span-2"
              icon={<CheckSquareIcon width={18} height={18} />}
              title="Recent results"
              action={
                <a
                  href="/results"
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  View all
                </a>
              }
            >
              <ul className="divide-y divide-slate-100">
                {recent.map((a) => {
                  const p = Math.round(pct(a) * 100);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {a.testTitle}
                        </p>
                        <p className="text-xs text-slate-500">
                          {a.takerName} · {timeAgo(a.submittedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm tabular-nums text-slate-500">
                        {a.score}/{a.maxScore}
                      </span>
                      <span
                        className={`w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums ${textToneFor(
                          p,
                        )}`}
                      >
                        {p}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>

            <SectionCard
              icon={<TrophyIcon width={18} height={18} className="text-accent-500" />}
              title="Leaderboard"
              action={
                <a
                  href="/leaderboard"
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Full board
                </a>
              }
            >
              <ol className="space-y-1">
                {leaderboard.top.map((a, i) => (
                  <LeaderRow
                    key={a.id}
                    rank={i + 1}
                    attempt={a}
                    isSelf={!!studentName && a.takerName === studentName}
                  />
                ))}
              </ol>
              {leaderboard.pinned && (
                <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
                  <LeaderRow
                    rank={leaderboard.pinned.rank}
                    attempt={leaderboard.pinned.attempt}
                    isSelf
                  />
                </div>
              )}
            </SectionCard>
          </div>

          {/* Tier: review, recommendation, skill breakdown */}
          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard
              icon={<ChartIcon width={18} height={18} />}
              title="Review"
              subtitle="Your lowest-scoring tests — practise these to improve."
            >
              {weakest.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Not enough attempts yet to spot weak areas.
                </p>
              ) : (
                <ul className="space-y-3">
                  {weakest.map((t) => {
                    const p = Math.round(t.avg * 100);
                    return (
                      <li key={t.testId}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <a
                            href={`/practice/${t.testId}`}
                            className="truncate text-sm font-medium text-slate-800 hover:text-brand-600"
                          >
                            {t.testTitle}
                          </a>
                          <span
                            className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${textToneFor(
                              p,
                            )}`}
                          >
                            {p}%
                          </span>
                        </div>
                        <ProgressBar value={p} tone={toneFor(p)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              icon={<BookIcon width={18} height={18} />}
              title="Recommended next"
            >
              {recommendation ? (
                <div className="flex h-full flex-col">
                  <p className="text-sm font-medium text-slate-800">
                    {recommendation.test.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {recommendation.reason}
                  </p>
                  {recommendation.test.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-400">
                      {recommendation.test.description}
                    </p>
                  )}
                  <LinkButton
                    href={`/practice/${recommendation.test.id}`}
                    className="mt-4 w-full"
                  >
                    Start practice
                  </LinkButton>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No tests available to recommend yet.
                </p>
              )}
            </SectionCard>

            <SectionCard
              icon={<ChartIcon width={18} height={18} />}
              title="Skill breakdown"
              subtitle="Across Grammar, Vocabulary, Reading, Listening, Writing, Speaking."
            >
              <SkillRadarPlaceholder />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- helper components (kept local for maintainability) ---------- */

function Stat({
  label,
  value,
  progress,
  tone = "brand",
  trend,
}: {
  label: string;
  value: string | number;
  progress?: number;
  tone?: "brand" | "success" | "amber" | "error";
  trend?: number | null;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
          {value}
        </p>
        {trend !== undefined && trend !== null && trend !== 0 && (
          <span
            className={`font-mono text-xs font-medium tabular-nums ${
              trend > 0 ? "text-success" : "text-error"
            }`}
          >
            {trend > 0 ? "+" : ""}
            {trend} pts
          </span>
        )}
      </div>
      {progress !== undefined && (
        <ProgressBar value={progress} tone={tone} className="mt-3" />
      )}
    </Card>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900">
            {icon && <span className="text-slate-400">{icon}</span>}
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

function LeaderRow({
  rank,
  attempt,
  isSelf,
}: {
  rank: number;
  attempt: Attempt;
  isSelf: boolean;
}) {
  const p = Math.round(pct(attempt) * 100);
  return (
    <li
      className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
        isSelf ? "bg-accent-50 ring-1 ring-inset ring-accent-500/20" : ""
      }`}
    >
      <span
        className={`w-5 shrink-0 text-center font-mono text-sm tabular-nums ${
          rank <= 3 ? "font-semibold text-accent-600" : "text-slate-400"
        }`}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {attempt.takerName}
          {isSelf && (
            <span className="ml-1.5 text-xs font-normal text-accent-600">
              You
            </span>
          )}
        </p>
        <p className="truncate text-xs text-slate-400">{attempt.testTitle}</p>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-700">
        {p}%
      </span>
    </li>
  );
}

// Signature six-skill radar (DESIGN_STYLE.md). Rendered as a clean, honest
// empty state until per-skill scoring data exists — no fabricated values.
function SkillRadarPlaceholder() {
  const skills = [
    "Grammar",
    "Vocabulary",
    "Reading",
    "Listening",
    "Writing",
    "Speaking",
  ];
  const cx = 90;
  const cy = 90;
  const rings = [0.4, 0.7, 1];
  const points = skills.map((_, i) => {
    const angle = (Math.PI * 2 * i) / skills.length - Math.PI / 2;
    return { angle };
  });
  const ringPolygon = (scale: number) =>
    points
      .map((p) => {
        const r = 70 * scale;
        return `${cx + r * Math.cos(p.angle)},${cy + r * Math.sin(p.angle)}`;
      })
      .join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 180 180"
        className="h-40 w-40"
        role="img"
        aria-label="Six-skill breakdown chart, awaiting data"
      >
        {rings.map((r) => (
          <polygon
            key={r}
            points={ringPolygon(r)}
            className="fill-none stroke-slate-200"
            strokeWidth={1}
          />
        ))}
        {points.map((p, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + 70 * Math.cos(p.angle)}
            y2={cy + 70 * Math.sin(p.angle)}
            className="stroke-slate-200"
            strokeWidth={1}
          />
        ))}
      </svg>
      <p className="mt-2 text-center text-xs text-slate-500">
        Your skill profile appears once you've completed tests across skills.
      </p>
    </div>
  );
}
