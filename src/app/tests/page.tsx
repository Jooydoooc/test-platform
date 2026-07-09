"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  BookText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Eye,
  FileText,
  Flame,
  GraduationCap,
  Headphones,
  Layers,
  ListChecks,
  Menu,
  PenLine,
  PlayCircle,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Type,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, LinkButton, ProgressBar } from "@/components/ui";
import {
  bookOf,
  groupOf,
  maxScore,
  useAttempts,
  useTests,
} from "@/lib/store";
import {
  LEVEL_TESTS,
  TEST_GROUPS,
  type Attempt,
  type Test,
  type TestGroup,
} from "@/lib/types";

type IconType = ComponentType<{ className?: string }>;

/** Per-group menu icon + whether it counts as a trainable "skill". */
const GROUP_META: Record<TestGroup, { icon: IconType; skill: boolean }> = {
  "Level Tests": { icon: BarChart3, skill: false },
  "Grammar Tests": { icon: Type, skill: true },
  "Vocabulary Tests": { icon: BookOpen, skill: true },
  "Reading Tests": { icon: BookText, skill: true },
  "Listening Tests": { icon: Headphones, skill: true },
  "Writing Tests": { icon: PenLine, skill: true },
};

const SKILL_GROUPS = TEST_GROUPS.filter((g) => GROUP_META[g].skill);

const DAY = 86_400_000;

// ---- derivations for fields the data model doesn't store directly ----

/** XP a test rewards on a perfect run — deterministic from its total points. */
function xpReward(test: Test): number {
  return maxScore(test) * 20;
}

/** Difficulty inferred from total points (no difficulty field in the model). */
function difficultyOf(test: Test): {
  label: string;
  tone: "success" | "amber" | "brand";
} {
  const m = maxScore(test);
  if (m <= 5) return { label: "Easy", tone: "success" };
  if (m <= 12) return { label: "Medium", tone: "amber" };
  return { label: "Hard", tone: "brand" };
}

/** ~1 min per point as a rough estimate when a test has no explicit limit. */
function estMinutes(test: Test): number {
  return test.durationMinutes || Math.max(3, Math.round(maxScore(test) * 0.9));
}

type DurationBucket = "Short" | "Medium" | "Long";
function durationBucket(min: number): DurationBucket {
  if (min <= 5) return "Short";
  if (min <= 15) return "Medium";
  return "Long";
}

/** Level label from lifetime XP. */
function levelFromXp(xp: number): string {
  if (xp < 200) return "Beginner";
  if (xp < 600) return "Elementary";
  if (xp < 1200) return "Pre-IELTS";
  if (xp < 2200) return "IELTS Intro";
  return "IELTS Graduate";
}

/** Consecutive-day streak ending today (or yesterday) from attempt dates. */
function computeStreak(dates: number[]): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates.map((d) => Math.floor(d / DAY)));
  const today = Math.floor(Date.now() / DAY);
  let cursor = today;
  if (!days.has(today)) {
    if (days.has(today - 1)) cursor = today - 1;
    else return 0;
  }
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor--;
  }
  return n;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const d = Math.floor(diff / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

// ---- filter option constants ----
const STATUS_OPTS = ["All", "Not Started", "Completed"] as const;
const DURATION_OPTS = ["All", "Short", "Medium", "Long"] as const;
const SORT_OPTS = ["Newest", "Shortest", "Most Questions"] as const;

export default function TestsPage() {
  const tests = useTests().filter((t) => t.questions.length > 0);
  const attempts = useAttempts();

  // Per-test attempt stats keyed by testId.
  const stats = useMemo(() => {
    const map = new Map<
      string,
      { count: number; bestPct: number; last: number }
    >();
    for (const a of attempts) {
      const pct = a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0;
      const cur = map.get(a.testId);
      if (!cur) {
        map.set(a.testId, { count: 1, bestPct: pct, last: a.submittedAt });
      } else {
        cur.count++;
        cur.bestPct = Math.max(cur.bestPct, pct);
        cur.last = Math.max(cur.last, a.submittedAt);
      }
    }
    return map;
  }, [attempts]);

  const isCompleted = (t: Test) => (stats.get(t.id)?.count ?? 0) > 0;
  const bestPctOf = (t: Test) => Math.round(stats.get(t.id)?.bestPct ?? 0);

  // Categories (Practice course levels) present across the tests, for the filter.
  const categoryOpts = useMemo(() => {
    const set = new Set<string>();
    for (const t of tests) if (t.category) set.add(t.category);
    return ["All", ...[...set].sort()];
  }, [tests]);

  // ---- UI state ----
  const [group, setGroup] = useState<TestGroup>("Level Tests");
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] =
    useState<(typeof STATUS_OPTS)[number]>("All");
  const [duration, setDuration] =
    useState<(typeof DURATION_OPTS)[number]>("All");
  const [sort, setSort] = useState<(typeof SORT_OPTS)[number]>("Newest");
  // Collapsed by default on small screens so the category list doesn't push the
  // tests down; it's always shown as a side rail from lg up.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- dashboard stats ----
  const dash = useMemo(() => {
    const completed = tests.filter((t) => (stats.get(t.id)?.count ?? 0) > 0);
    const xpEarned = completed.reduce((sum, t) => {
      const best = stats.get(t.id)!.bestPct / 100;
      return sum + Math.round(best * xpReward(t));
    }, 0);
    const avg =
      attempts.length > 0
        ? Math.round(
            (attempts.reduce(
              (s, a) => s + (a.maxScore > 0 ? a.score / a.maxScore : 0),
              0,
            ) /
              attempts.length) *
              100,
          )
        : 0;
    return {
      total: tests.length,
      completed: completed.length,
      avg,
      xp: xpEarned,
      level: levelFromXp(xpEarned),
      streak: computeStreak(attempts.map((a) => a.submittedAt)),
    };
  }, [tests, attempts, stats]);

  // ---- per-skill progress (avg best score across that group's tests) ----
  const skillProgress = useMemo(() => {
    return SKILL_GROUPS.map((g) => {
      const inGroup = tests.filter((t) => groupOf(t) === g);
      const done = inGroup.filter((t) => (stats.get(t.id)?.count ?? 0) > 0);
      const avg =
        done.length > 0
          ? Math.round(
              done.reduce((s, t) => s + stats.get(t.id)!.bestPct, 0) /
                done.length,
            )
          : 0;
      return { group: g, total: inGroup.length, done: done.length, avg };
    });
  }, [tests, stats]);

  // Weakest skill that still has unfinished tests → recommendation source.
  const recommended = useMemo(() => {
    const candidates = [...skillProgress]
      .filter((s) => s.total > s.done)
      .sort((a, b) => a.avg - b.avg);
    const targetGroup = candidates[0]?.group;
    const pool = targetGroup
      ? tests.filter(
          (t) => groupOf(t) === targetGroup && (stats.get(t.id)?.count ?? 0) === 0,
        )
      : tests.filter((t) => (stats.get(t.id)?.count ?? 0) === 0);
    return pool.sort((a, b) => maxScore(a) - maxScore(b))[0] ?? null;
  }, [skillProgress, tests, stats]);

  // Most recent attempt, for the "recent result" widget.
  const recent = useMemo<Attempt | null>(() => {
    if (attempts.length === 0) return null;
    return [...attempts].sort((a, b) => b.submittedAt - a.submittedAt)[0];
  }, [attempts]);

  const goalTarget = 3;
  const goalDone = useMemo(() => {
    const today = Math.floor(Date.now() / DAY);
    return attempts.filter((a) => Math.floor(a.submittedAt / DAY) === today)
      .length;
  }, [attempts]);

  // ---- filtered + sorted list for the main column ----
  const shown = useMemo(() => {
    let list = tests.filter((t) => groupOf(t) === group);
    if (group === "Level Tests" && activeLevel) {
      list = list.filter(
        (t) => t.title.toLowerCase() === activeLevel.toLowerCase(),
      );
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    if (category !== "All") list = list.filter((t) => t.category === category);
    if (status !== "All") {
      const wantDone = status === "Completed";
      list = list.filter((t) => isCompleted(t) === wantDone);
    }
    if (duration !== "All") {
      list = list.filter((t) => durationBucket(estMinutes(t)) === duration);
    }
    const sorted = [...list];
    if (sort === "Newest") sorted.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === "Shortest")
      sorted.sort((a, b) => estMinutes(a) - estMinutes(b));
    else sorted.sort((a, b) => b.questions.length - a.questions.length);
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, group, activeLevel, query, category, status, duration, sort, stats]);

  const noTestsAtAll = tests.length === 0;

  return (
    <div className="space-y-6">
      {/* ============ Premium header ============ */}
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-7 text-white shadow-card-hover sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-16 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/20">
            <Sparkles className="h-3.5 w-3.5" />
            Lexora
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Lexora
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100/90 sm:text-[15px]">
            Choose your next challenge, improve your weak skills, and track your
            progress.
          </p>

          {/* Dashboard stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile icon={Layers} label="Total Tests" value={dash.total} />
            <StatTile
              icon={CheckCircle2}
              label="Completed"
              value={dash.completed}
            />
            <StatTile
              icon={TrendingUp}
              label="Average Score"
              value={`${dash.avg}%`}
            />
            <StatTile icon={Award} label="Current Level" value={dash.level} />
            <StatTile icon={Zap} label="XP Earned" value={dash.xp} />
            <StatTile
              icon={Flame}
              label="Streak"
              value={`${dash.streak}d`}
            />
          </div>
        </div>
      </header>

      {/* ============ Search + filter bar ============ */}
      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/25 sm:min-h-0">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tests by title or description…"
              aria-label="Search tests"
              // text-base on mobile stops iOS Safari zooming in on focus.
              className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FilterSelect
              label="Category"
              value={category}
              onChange={setCategory}
              options={categoryOpts}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as (typeof STATUS_OPTS)[number])}
              options={STATUS_OPTS}
            />
            <FilterSelect
              label="Duration"
              value={duration}
              onChange={(v) =>
                setDuration(v as (typeof DURATION_OPTS)[number])
              }
              options={DURATION_OPTS}
            />
            <FilterSelect
              label="Sort"
              value={sort}
              onChange={(v) => setSort(v as (typeof SORT_OPTS)[number])}
              options={SORT_OPTS}
            />
          </div>
        </div>
      </Card>

      {/* ============ Workspace: category rail + (tests / progress) ============ */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* -------- Category rail (slim, on the side from lg up) -------- */}
        <div className="lg:sticky lg:top-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-card lg:hidden"
          >
            <span className="flex items-center gap-2">
              <Menu className="h-4 w-4" />
              Categories
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${sidebarOpen ? "rotate-180" : ""}`}
            />
          </button>

          <aside
            aria-label="Test groups"
            className={`${sidebarOpen ? "block" : "hidden"} rounded-2xl border border-slate-200 bg-white p-2 shadow-card lg:block`}
          >
            <nav className="space-y-0.5">
              {TEST_GROUPS.map((g) => {
                const meta = GROUP_META[g];
                const Icon = meta.icon;
                const count = tests.filter((t) => groupOf(t) === g).length;
                const isActive = g === group;
                const isLevel = g === "Level Tests";
                return (
                  <div key={g}>
                    <button
                      type="button"
                      onClick={() => {
                        setGroup(g);
                        setActiveLevel(null);
                      }}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition ${
                        isActive
                          ? "bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[0_8px_20px_-6px_rgba(90,63,202,0.55)]"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-brand-50 text-brand-600"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate">{g}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11.5px] font-bold ${
                          isActive
                            ? "border-transparent bg-white/20 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        {count}
                      </span>
                    </button>

                    {isLevel && isActive && (
                      <div className="my-2 ml-[22px] space-y-0.5 border-l-2 border-slate-200 pl-2">
                        {LEVEL_TESTS.map((name) => {
                          const isSel =
                            activeLevel?.toLowerCase() === name.toLowerCase();
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() =>
                                setActiveLevel(isSel ? null : name)
                              }
                              aria-current={isSel ? "true" : undefined}
                              className={`block w-full truncate rounded-lg px-3 py-1.5 text-left text-[13px] transition ${
                                isSel
                                  ? "bg-brand-50 font-bold text-brand-700"
                                  : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>
        </div>

        {/* -------- Tests + progress panel (progress drops below the tests until xl) -------- */}
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* -------- Main: test cards -------- */}
        <main className="min-w-0">
          {noTestsAtAll ? (
            <EmptyState mode="none" />
          ) : shown.length === 0 ? (
            <EmptyState mode="filtered" label={activeLevel ?? group} />
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {shown.map((t) => (
                <TestCard
                  key={t.id}
                  test={t}
                  completed={isCompleted(t)}
                  best={bestPctOf(t)}
                />
              ))}
            </div>
          )}
        </main>

        {/* -------- Right progress panel -------- */}
        <aside className="space-y-4 xl:sticky xl:top-6">
          {/* Skill progress lives on the dashboard — link across to it. */}
          <Link
            href="/dashboard"
            className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <BarChart3 className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">
                Skill Progress
              </span>
              <span className="block text-xs text-slate-500">
                Track mastery on your dashboard
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
          </Link>

          {/* Recommended next test */}
          <Card className="!p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Compass className="h-4 w-4 text-brand-600" />
              Recommended Next
            </h3>
            {recommended ? (
              <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
                <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                  {recommended.title}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>{groupOf(recommended).replace(" Tests", "")}</span>
                  <span>·</span>
                  <span>{recommended.questions.length} questions</span>
                </p>
                <LinkButton
                  href={`/tests/${recommended.id}`}
                  className="mt-3 w-full py-2 text-sm"
                >
                  Start now
                  <ArrowRight className="h-4 w-4" />
                </LinkButton>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                You&apos;ve started everything available. 🎉
              </p>
            )}
          </Card>

          {/* Recent result */}
          <Card className="!p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Star className="h-4 w-4 text-brand-600" />
              Recent Result
            </h3>
            {recent ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <span className="text-sm font-extrabold leading-none">
                    {recent.maxScore > 0
                      ? Math.round((recent.score / recent.maxScore) * 100)
                      : 0}
                  </span>
                  <span className="text-[9px] font-semibold">%</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {recent.testTitle}
                  </p>
                  <p className="text-xs text-slate-500">
                    {recent.score}/{recent.maxScore} pts · {timeAgo(recent.submittedAt)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No attempts yet.</p>
            )}
          </Card>

          {/* Daily goal + streak */}
          <Card className="!p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Target className="h-4 w-4 text-brand-600" />
              Daily Goal
            </h3>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-slate-900">
                {Math.min(goalDone, goalTarget)}
                <span className="text-sm font-semibold text-slate-400">
                  {" "}
                  / {goalTarget}
                </span>
              </span>
              <span className="text-xs font-semibold text-slate-500">
                tests today
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={(Math.min(goalDone, goalTarget) / goalTarget) * 100}
                tone="success"
              />
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700">
              <Flame className="h-4 w-4" />
              {dash.streak}-day streak — keep it alive!
            </div>
          </Card>
        </aside>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: IconType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-100/80">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 truncate text-xl font-extrabold leading-tight sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        // text-base + min-h on mobile: bigger tap target, no iOS zoom on focus.
        className="min-h-[44px] w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-base font-medium text-slate-700 outline-none transition-colors hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 sm:min-h-0 sm:text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {label === "Sort" ? `Sort: ${o}` : o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400" />
    </label>
  );
}

function TestCard({
  test,
  completed,
  best,
}: {
  test: Test;
  completed: boolean;
  best: number;
}) {
  const [preview, setPreview] = useState(false);
  const diff = difficultyOf(test);
  const mins = estMinutes(test);
  const xp = xpReward(test);
  const points = maxScore(test);
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of test.questions) c[q.type] = (c[q.type] ?? 0) + 1;
    return c;
  }, [test]);

  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(90,63,202,0.10),transparent_70%)]"
      />

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{groupOf(test).replace(" Tests", "")}</Badge>
        {test.category && <Badge tone="neutral">{test.category}</Badge>}
        <Badge tone="neutral">{bookOf(test)}</Badge>
        <Badge tone={diff.tone}>{diff.label}</Badge>
        {completed && (
          <Badge tone="success">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        )}
      </div>

      {/* Title + description */}
      <h2 className="mt-3 text-lg font-extrabold tracking-tight text-slate-900">
        {test.title}
      </h2>
      {test.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {test.description}
        </p>
      )}

      {/* Meta stats */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-[13px] font-semibold text-slate-600 sm:grid-cols-4">
        <Meta icon={ListChecks} label={`${test.questions.length} Qs`} />
        <Meta icon={Star} label={`${points} pts`} />
        <Meta icon={Clock} label={`~${mins}m`} />
        <Meta icon={Zap} label={`${xp} XP`} />
      </div>

      {/* Best score bar (only once attempted) */}
      {completed && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-500">Best score</span>
            <span className="text-brand-700">{best}%</span>
          </div>
          <ProgressBar
            value={best}
            tone={best >= 80 ? "success" : best >= 40 ? "brand" : "amber"}
          />
        </div>
      )}

      {/* Inline preview */}
      {preview && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1.5 font-bold text-slate-700">Question breakdown</p>
          <ul className="flex flex-wrap gap-2">
            {Object.entries(typeCounts).map(([type, n]) => (
              <li
                key={type}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium capitalize"
              >
                {n} × {type}
              </li>
            ))}
          </ul>
          {test.questions[0] && (
            <p className="mt-2 line-clamp-2 italic text-slate-500">
              e.g. “{test.questions[0].prompt}”
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton
          href={`/tests/${test.id}`}
          className="group min-w-[8rem] flex-1 bg-gradient-to-br from-brand-500 to-brand-600 shadow-[0_10px_24px_-8px_rgba(90,63,202,0.5)] hover:from-brand-600 hover:to-brand-700"
        >
          {completed ? (
            <>
              <RotateCcw className="h-4 w-4" />
              Continue
            </>
          ) : (
            <>
              <PlayCircle className="h-4 w-4" />
              Start Test
            </>
          )}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </LinkButton>

        {completed && (
          <LinkButton
            href={`/tests/${test.id}`}
            variant="secondary"
            className="flex-1"
          >
            <ListChecks className="h-4 w-4" />
            Review Mistakes
          </LinkButton>
        )}

        <Button
          variant="ghost"
          onClick={() => setPreview((v) => !v)}
          aria-expanded={preview}
          className="shrink-0"
        >
          <Eye className="h-4 w-4" />
          {preview ? "Hide" : "Preview"}
          <ChevronRight
            className={`h-4 w-4 transition-transform ${preview ? "rotate-90" : ""}`}
          />
        </Button>
      </div>
    </article>
  );
}

function Meta({ icon: Icon, label }: { icon: IconType; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 text-brand-600" />
      {label}
    </span>
  );
}

function EmptyState({
  mode,
  label,
}: {
  mode: "none" | "filtered";
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center shadow-card">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        {mode === "none" ? (
          <GraduationCap className="h-8 w-8" />
        ) : (
          <FileText className="h-8 w-8" />
        )}
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">
        {mode === "none"
          ? "No tests yet"
          : `Nothing in ${label} matches your filters`}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-600">
        {mode === "none"
          ? "Create your first test to start building your Lexora Test Center."
          : "Try clearing the search or switching filters to see more tests."}
      </p>
      <LinkButton href="/author" className="mt-5">
        <Sparkles className="h-4 w-4" />
        {mode === "none" ? "Create a test" : "Author a new test"}
        <ArrowRight className="h-4 w-4" />
      </LinkButton>
    </div>
  );
}
