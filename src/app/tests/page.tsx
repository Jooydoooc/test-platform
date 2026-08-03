"use client";

import { useMemo, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BookText,
  CheckCircle2,
  Headphones,
  Layers,
  ShieldCheck,
  Star,
  TrendingUp,
  Type,
} from "lucide-react";
import { Card } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { useMyAttempts } from "@/lib/data/my-attempts";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { groupOf, useAttempts, useTests } from "@/lib/store";
import { type TestGroup } from "@/lib/types";
import { useHostedTests, type HostedTest } from "@/lib/data/hosted-tests";
import { TestNav } from "@/components/tests/TestNav";
import type { TestSkillScope } from "@/lib/database.types";

type IconType = ComponentType<{ className?: string }>;

const DAY = 86_400_000;

// The three student-facing categories, each its own page.
const CATEGORIES: {
  group: TestGroup;
  href: string;
  icon: IconType;
  blurb: string;
}[] = [
  {
    group: "Grammar Tests",
    href: "/tests/grammar",
    icon: Type,
    blurb: "Rules, structures and usage.",
  },
  {
    group: "Vocabulary Tests",
    href: "/tests/vocabulary",
    icon: BookOpen,
    blurb: "Build and test your word knowledge.",
  },
  {
    group: "Reading Tests",
    href: "/tests/reading",
    icon: BookText,
    blurb: "Comprehension and reading skills.",
  },
  {
    group: "Listening Tests",
    href: "/tests/listening",
    icon: Headphones,
    blurb: "Train your ear with audio-based tests.",
  },
];

const SCOPE_TO_GROUP: Record<TestSkillScope, TestGroup | null> = {
  GRAMMAR: "Grammar Tests",
  VOCABULARY: "Vocabulary Tests",
  READING: "Reading Tests",
  LISTENING: "Listening Tests",
  MIXED: null,
};

function hostedInGroup(h: HostedTest, g: TestGroup): boolean {
  const mapped = SCOPE_TO_GROUP[h.skillScope];
  return mapped === null ? true : mapped === g;
}

function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export default function TestCenterPage() {
  const { user } = useSession();
  // Prototype/offline tests only. Tests are link-gated (migration 0025): with
  // the real backend on, the Test Center lists only what an admin's link has
  // unlocked for this student, never a browsable catalog.
  const localTests = useTests().filter((t) => t.questions.length > 0);
  const tests = SUPABASE_ENABLED ? [] : localTests;
  const allAttempts = useAttempts();
  const { hosted } = useHostedTests();

  const { attempts: realAttempts } = useMyAttempts();

  // Local fallback stats (prototype / Supabase-off).
  const localAttempts = useMemo(() => {
    if (!user) return [];
    const me = user.name.trim().toLowerCase();
    return allAttempts.filter((a) => a.takerName.trim().toLowerCase() === me);
  }, [allAttempts, user]);

  const totalTests = tests.length + hosted.length;

  const headerStats = useMemo(() => {
    if (!SUPABASE_ENABLED) {
      const completed = new Set(localAttempts.map((a) => a.testId)).size;
      const avg =
        localAttempts.length > 0
          ? Math.round(
              (localAttempts.reduce(
                (s, a) => s + (a.maxScore > 0 ? a.score / a.maxScore : 0),
                0,
              ) /
                localAttempts.length) *
                100,
            )
          : 0;
      return {
        total: totalTests,
        completed,
        avg,
      };
    }
    // Hosted tests submit against html_test_id, so they never appear in
    // useMyAttempts (test_id only) — count them separately or "Completed" reads
    // 0 for a student whose whole history is hosted tests.
    // Excluded (superseded) attempts are dropped first: a re-opened test keeps
    // its testId on the old attempt, so without this filter "Completed" would
    // still count a test the teacher just re-opened for a retake — exactly the
    // signal that reopening should have cleared. Same reasoning as `avg` below.
    const completed =
      new Set(
        realAttempts
          .filter((a) => !a.excludedFromProgress)
          .map((a) => a.testId),
      ).size + hosted.filter((h) => h.completedAt !== null).length;
    // Average over attempts that still count. A re-opened attempt (0037) is
    // kept in history but flagged excluded_from_progress, so without this
    // filter a student who retook one test would have both their old and new
    // score averaged in — the retake would barely move the number it exists to
    // correct. The dashboard already filters the same way.
    const scored = realAttempts.filter((a) => !a.excludedFromProgress);
    const avg =
      scored.length > 0
        ? Math.round(
            (scored.reduce((s, a) => s + a.accuracy, 0) / scored.length) * 100,
          )
        : 0;
    return {
      total: totalTests,
      completed,
      avg,
    };
  }, [
    localAttempts,
    realAttempts,
    totalTests,
    hosted,
  ]);

  const countFor = (g: TestGroup) =>
    tests.filter((t) => groupOf(t) === g).length +
    hosted.filter((h) => hostedInGroup(h, g)).length;

  // Unlike the admin's history list (which must keep showing a superseded row
  // so the teacher can see what they re-opened), this card is the student's
  // "what did I just get" widget, not a history log — same audience as `avg`
  // and `completed` above. If the most recent attempt was just re-opened, it's
  // an attempt the teacher discarded; surfacing its score here would show the
  // student a result that no longer counts, with no indication it was undone.
  // Skip excluded attempts so this reflects the most recent one that still
  // stands — or nothing, if the only attempt for that test is now excluded
  // and the student hasn't retaken it yet.
  const recent = useMemo(() => {
    const eligible = realAttempts.filter((a) => !a.excludedFromProgress);
    if (eligible.length === 0) return null;
    return [...eligible].sort((a, b) => b.submittedAt - a.submittedAt)[0];
  }, [realAttempts]);

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-brand-600 text-white shadow-card">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
              <ShieldCheck className="size-5 text-accent-300" />
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Test Center</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-200">
              Graded, single-attempt tests from your teacher. Start only when
              you are ready to stay on the test screen until submission.
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/15 rounded-xl bg-white/[0.07] ring-1 ring-inset ring-white/15">
            <StatTile icon={Layers} label="Available" value={headerStats.total} />
            <StatTile icon={CheckCircle2} label="Completed" value={headerStats.completed} />
            <StatTile icon={TrendingUp} label="Average" value={`${headerStats.avg}%`} />
          </div>
        </div>
      </header>

      <TestNav />

      {/* Category tiles */}
      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const count = countFor(c.group);
          return (
            <Link
              key={c.group}
              href={c.href}
              className="group flex w-full min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-colors hover:border-brand-300"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-900">
                  {c.group.replace(" Tests", "")}
                </h2>
                <p className="mt-0.5 truncate text-sm text-slate-600">{c.blurb}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                {count} test{count === 1 ? "" : "s"}
              </span>
              <ArrowRight className="size-4 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      {/* Recent result */}
      <Card className="!p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Star className="h-4 w-4 text-brand-600" />
          Recent Result
        </h3>
        {recent ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <span className="text-sm font-extrabold leading-none tabular-nums">
                {Math.round(recent.accuracy * 100)}
              </span>
              <span className="text-[9px] font-semibold">%</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {recent.testTitle}
              </p>
              <p className="text-xs text-slate-500 tabular-nums">
                {recent.score}/{recent.maxScore} · {timeAgo(recent.submittedAt)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No attempts yet.</p>
        )}
      </Card>
    </div>
  );
}

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
    <div className="min-w-0 px-3 py-4 text-center">
      <Icon className="mx-auto size-4 text-slate-300" />
      <div className="mt-1 truncate text-xl font-bold leading-tight tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] font-medium text-slate-300">
        {label}
      </div>
    </div>
  );
}
