"use client";

import { useMemo, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  BookText,
  CheckCircle2,
  Flame,
  Layers,
  Sparkles,
  Star,
  TrendingUp,
  Type,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { useStudentXp } from "@/lib/xp";
import { useStreak } from "@/lib/data/use-streak";
import { useMyAttempts } from "@/lib/data/my-attempts";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { groupOf, useAttempts, useTests } from "@/lib/store";
import { type TestGroup } from "@/lib/types";
import { useHostedTests, type HostedTest } from "@/lib/data/hosted-tests";
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

function levelFromXp(xp: number): string {
  if (xp < 200) return "Beginner";
  if (xp < 600) return "Elementary";
  if (xp < 1200) return "Pre-IELTS";
  if (xp < 2200) return "IELTS Intro";
  return "IELTS Graduate";
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
  const tests = useTests().filter((t) => t.questions.length > 0);
  const allAttempts = useAttempts();
  const { hosted } = useHostedTests();

  // Real (Supabase) identity/progress — matches the header pill and dashboard.
  const { xp: realXp, level: realLevel } = useStudentXp();
  const { current: realStreak } = useStreak();
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
      const xp = 0;
      return {
        total: totalTests,
        completed,
        avg,
        xp,
        level: levelFromXp(xp),
        streak: 0,
      };
    }
    const completed = new Set(realAttempts.map((a) => a.testId)).size;
    const avg =
      realAttempts.length > 0
        ? Math.round(
            (realAttempts.reduce((s, a) => s + a.accuracy, 0) /
              realAttempts.length) *
              100,
          )
        : 0;
    return {
      total: totalTests,
      completed,
      avg,
      xp: realXp,
      level: realLevel.name,
      streak: realStreak,
    };
  }, [localAttempts, realAttempts, realXp, realLevel, realStreak, totalTests]);

  const countFor = (g: TestGroup) =>
    tests.filter((t) => groupOf(t) === g).length +
    hosted.filter((h) => hostedInGroup(h, g)).length;

  const recent = useMemo(() => {
    if (realAttempts.length === 0) return null;
    return [...realAttempts].sort((a, b) => b.submittedAt - a.submittedAt)[0];
  }, [realAttempts]);

  return (
    <div className="space-y-6">
      {/* Premium header */}
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-7 text-white shadow-card-hover sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-16 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/20">
            <Sparkles className="h-3.5 w-3.5" />
            Lexora
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Test Center
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100/90 sm:text-[15px]">
            Choose a category to start practising and track your progress.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile icon={Layers} label="Total Tests" value={headerStats.total} />
            <StatTile
              icon={CheckCircle2}
              label="Completed"
              value={headerStats.completed}
            />
            <StatTile
              icon={TrendingUp}
              label="Average Score"
              value={`${headerStats.avg}%`}
            />
            <StatTile icon={Award} label="Current Level" value={headerStats.level} />
            <StatTile icon={Zap} label="XP Earned" value={headerStats.xp} />
            <StatTile
              icon={Flame}
              label="Streak"
              value={`${headerStats.streak}d`}
            />
          </div>
        </div>
      </header>

      {/* Category tiles */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const count = countFor(c.group);
          return (
            <Link
              key={c.group}
              href={c.href}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(90,63,202,0.10),transparent_70%)]"
              />
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-lg font-extrabold tracking-tight text-slate-900">
                {c.group.replace(" Tests", "")}
              </h2>
              <p className="mt-1 flex-1 text-sm text-slate-600">{c.blurb}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                  {count} test{count === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                  Open
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
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
              <span className="text-sm font-extrabold leading-none">
                {Math.round(recent.accuracy * 100)}
              </span>
              <span className="text-[9px] font-semibold">%</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {recent.testTitle}
              </p>
              <p className="text-xs text-slate-500">
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
