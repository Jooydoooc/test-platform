"use client";

// Reusable per-category test listing. The Test Center is split into one page per
// skill (/tests/grammar, /tests/vocabulary, /tests/reading); each renders this
// component locked to a single TestGroup. It shows hosted (interactive) tests
// first, then local-store tests, with search / status / duration / sort filters.
//
// Ported from the former single-page /tests view (the group rail is gone — the
// page IS the category).

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  ListChecks,
  PlayCircle,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, LinkButton, ProgressBar } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { bookOf, groupOf, maxScore, useAttempts, useTests } from "@/lib/store";
import { type Test, type TestGroup } from "@/lib/types";
import {
  useHostedTests,
  HOSTED_LEVEL_LABEL,
  type HostedTest,
} from "@/lib/data/hosted-tests";
import type { TestSkillScope } from "@/lib/database.types";

type IconType = ComponentType<{ className?: string }>;

// Hosted skill scope -> group (MIXED shows in every skill page).
const SCOPE_TO_GROUP: Record<TestSkillScope, TestGroup | null> = {
  GRAMMAR: "Grammar Tests",
  VOCABULARY: "Vocabulary Tests",
  READING: "Reading Tests",
  LISTENING: "Listening Tests",
  MIXED: null,
};

function scopeLabel(scope: TestSkillScope): string {
  const g = SCOPE_TO_GROUP[scope];
  return g ? g.replace(" Tests", "") : "Mixed";
}

function hostedInGroup(h: HostedTest, g: TestGroup): boolean {
  const mapped = SCOPE_TO_GROUP[h.skillScope];
  // MIXED shows on every skill page; the three category pages are all skills.
  return mapped === null ? true : mapped === g;
}

function difficultyOf(test: Test): {
  label: string;
  tone: "success" | "amber" | "brand";
} {
  const m = maxScore(test);
  if (m <= 5) return { label: "Easy", tone: "success" };
  if (m <= 12) return { label: "Medium", tone: "amber" };
  return { label: "Hard", tone: "brand" };
}

function estMinutes(test: Test): number {
  return test.durationMinutes || Math.max(3, Math.round(maxScore(test) * 0.9));
}

type DurationBucket = "Short" | "Medium" | "Long";
function durationBucket(min: number): DurationBucket {
  if (min <= 5) return "Short";
  if (min <= 15) return "Medium";
  return "Long";
}

const STATUS_OPTS = ["All", "Not Started", "Completed"] as const;
const DURATION_OPTS = ["All", "Short", "Medium", "Long"] as const;
const SORT_OPTS = ["Newest", "Shortest", "Most Questions"] as const;

export function CategoryTests({ group }: { group: TestGroup }) {
  const { user } = useSession();
  const tests = useTests().filter((t) => t.questions.length > 0);
  const allAttempts = useAttempts();
  const { hosted } = useHostedTests();

  // Scope stats to the signed-in student (attempts share one localStorage store).
  const attempts = useMemo(() => {
    if (!user) return [];
    const me = user.name.trim().toLowerCase();
    return allAttempts.filter((a) => a.takerName.trim().toLowerCase() === me);
  }, [allAttempts, user]);

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; bestPct: number }>();
    for (const a of attempts) {
      const pct = a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0;
      const cur = map.get(a.testId);
      if (!cur) map.set(a.testId, { count: 1, bestPct: pct });
      else {
        cur.count++;
        cur.bestPct = Math.max(cur.bestPct, pct);
      }
    }
    return map;
  }, [attempts]);

  const isCompleted = (t: Test) => (stats.get(t.id)?.count ?? 0) > 0;
  const bestPctOf = (t: Test) => Math.round(stats.get(t.id)?.bestPct ?? 0);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTS)[number]>("All");
  const [duration, setDuration] =
    useState<(typeof DURATION_OPTS)[number]>("All");
  const [sort, setSort] = useState<(typeof SORT_OPTS)[number]>("Newest");

  const shown = useMemo(() => {
    let list = tests.filter((t) => groupOf(t) === group);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
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
  }, [tests, group, query, status, duration, sort, stats]);

  const shownHosted = useMemo(() => {
    let list = hosted.filter((h) => hostedInGroup(h, group));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((h) => h.title.toLowerCase().includes(q));
    // Hosted tests have no completion tracking here, so hide them when the
    // student filters to "Completed" only.
    if (status === "Completed") list = [];
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [hosted, group, query, status]);

  // One ordered list for the carousel: hosted (interactive) tests first, then
  // local-store tests. The page shows exactly one at a time.
  type Item =
    | { kind: "hosted"; hosted: HostedTest }
    | { kind: "local"; test: Test };
  const items = useMemo<Item[]>(
    () => [
      ...shownHosted.map((h) => ({ kind: "hosted", hosted: h }) as Item),
      ...shown.map((t) => ({ kind: "local", test: t }) as Item),
    ],
    [shownHosted, shown],
  );

  const [current, setCurrent] = useState(0);
  // Reset to the first card whenever the filtered set changes.
  useEffect(() => {
    setCurrent(0);
  }, [query, status, duration, sort, group]);
  // Keep the index in range if the list shrinks.
  useEffect(() => {
    setCurrent((c) => (c > items.length - 1 ? Math.max(0, items.length - 1) : c));
  }, [items.length]);

  const nothing = items.length === 0;

  // Left/right arrow keys step through the carousel (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") setCurrent((c) => Math.max(0, c - 1));
      else if (e.key === "ArrowRight")
        setCurrent((c) => Math.min(items.length - 1, c + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  const item = items[current];

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/25">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tests…"
              aria-label="Search tests"
              className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as (typeof STATUS_OPTS)[number])}
              options={STATUS_OPTS}
            />
            <FilterSelect
              label="Duration"
              value={duration}
              onChange={(v) => setDuration(v as (typeof DURATION_OPTS)[number])}
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

      {nothing ? (
        <EmptyState label={group.replace(" Tests", "")} />
      ) : (
        <div>
          {/* Carousel: one test at a time, with side arrows on larger screens. */}
          <div className="flex items-stretch gap-3">
            <CarouselArrow
              dir="prev"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
            />
            <div className="mx-auto w-full max-w-xl">
              {item.kind === "hosted" ? (
                <HostedTestCard test={item.hosted} />
              ) : (
                <TestCard
                  test={item.test}
                  completed={isCompleted(item.test)}
                  best={bestPctOf(item.test)}
                />
              )}
            </div>
            <CarouselArrow
              dir="next"
              onClick={() =>
                setCurrent((c) => Math.min(items.length - 1, c + 1))
              }
              disabled={current === items.length - 1}
            />
          </div>

          {/* Counter + mobile arrows + dots */}
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                disabled={current === 0}
                aria-label="Previous test"
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-card transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 sm:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-slate-600 tabular-nums">
                {current + 1} <span className="text-slate-400">of</span>{" "}
                {items.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrent((c) => Math.min(items.length - 1, c + 1))
                }
                disabled={current === items.length - 1}
                aria-label="Next test"
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-card transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 sm:hidden"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            {items.length > 1 && items.length <= 12 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {items.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Go to test ${i + 1}`}
                    aria-current={i === current}
                    className={`h-2 rounded-full transition-all ${
                      i === current
                        ? "w-5 bg-brand-600"
                        : "w-2 bg-slate-300 hover:bg-slate-400"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Side navigation arrow (hidden on small screens, where the inline arrows show).
function CarouselArrow({
  dir,
  onClick,
  disabled,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous test" : "Next test"}
      className="hidden shrink-0 items-center self-center rounded-full border border-slate-200 bg-white p-2.5 text-slate-600 shadow-card transition hover:border-brand-300 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-30 sm:flex"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

// ============================================================
// Cards + sub-components (shared)
// ============================================================

function HostedTestCard({ test }: { test: HostedTest }) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(90,63,202,0.10),transparent_70%)]"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{scopeLabel(test.skillScope)}</Badge>
        {test.level && (
          <Badge tone="neutral">{HOSTED_LEVEL_LABEL[test.level]}</Badge>
        )}
        <Badge tone="success">
          <Sparkles className="h-3 w-3" />
          Interactive
        </Badge>
      </div>
      <h2 className="mt-3 text-lg font-extrabold tracking-tight text-slate-900">
        {test.title}
      </h2>
      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
        A self-contained, auto-graded test. Your score saves to your progress.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[13px] font-semibold text-slate-600">
        <Meta icon={Sparkles} label="Interactive" />
        <Meta icon={CheckCircle2} label="Auto-graded" />
        <Meta icon={Zap} label="Earns XP" />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton
          href={`/ht/${test.shareToken}`}
          className="group min-w-[8rem] flex-1 bg-gradient-to-br from-brand-500 to-brand-600 shadow-[0_10px_24px_-8px_rgba(90,63,202,0.5)] hover:from-brand-600 hover:to-brand-700"
        >
          <PlayCircle className="h-4 w-4" />
          Start Test
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </LinkButton>
      </div>
    </article>
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
      <h2 className="mt-3 text-lg font-extrabold tracking-tight text-slate-900">
        {test.title}
      </h2>
      {test.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {test.description}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 text-[13px] font-semibold text-slate-600 sm:grid-cols-4">
        <Meta icon={ListChecks} label={`${test.questions.length} Qs`} />
        <Meta icon={Star} label={`${points} pts`} />
        <Meta icon={Clock} label={`~${mins}m`} />
        <Meta icon={Zap} label="Practice" />
      </div>
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
      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton
          href={`/tests/${test.id}`}
          className="group min-w-[8rem] flex-1 bg-gradient-to-br from-brand-500 to-brand-600 shadow-[0_10px_24px_-8px_rgba(90,63,202,0.5)] hover:from-brand-600 hover:to-brand-700"
        >
          {completed ? (
            <>
              <RotateCcw className="h-4 w-4" />
              Retake
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
            href={`/tests/${test.id}?review=1`}
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center shadow-card">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <FileText className="h-8 w-8" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">
        No {label} tests yet
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-600">
        Tests will appear here once your teacher adds them, or try clearing the
        search and filters.
      </p>
    </div>
  );
}
