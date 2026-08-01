"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  BookOpen,
  BookText,
  Compass,
  Flame,
  Headphones,
  LogOut,
  Medal,
  Mic,
  PenLine,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  BADGE_CATALOG,
  isBadgeEarned,
  type BadgeCounts,
  type BadgeDef,
  type BadgeSkill,
} from "@/lib/badges";
import { Check, Lock } from "lucide-react";
import { Badge, Button, Card, LinkButton, ProgressBar } from "@/components/ui";
import { logout, useSession } from "@/lib/auth";
import { groupOf, useAttempts, useTests } from "@/lib/store";
import { useStudentXp } from "@/lib/xp";
import { TEST_GROUPS, type Attempt } from "@/lib/types";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { useMyAttempts, type MyAttempt } from "@/lib/data/my-attempts";
import { useSkillMastery } from "@/lib/data/use-skill-mastery";
import { useEarnedBadges } from "@/lib/data/use-earned-badges";
import { useStreak } from "@/lib/data/use-streak";

const DAY = 86_400_000;

function pct(a: Attempt): number {
  return a.maxScore > 0 ? a.score / a.maxScore : 0;
}

// The trainable skills — every test group except the Level Tests bucket.
const SKILL_GROUPS = TEST_GROUPS.filter((g) => g !== "Level Tests");

// Plain icons per badge (NO-AI-STYLE: no emoji in system UI). Skill tiers reuse
// their skill icon; cross-skill badges get their own. Resolved by code, then by
// skill area, then a Medal fallback — so new catalog rows never need new code.
const SKILL_ICON: Record<BadgeSkill, LucideIcon> = {
  GRAMMAR: BookOpen,
  VOCABULARY: Sparkles,
  READING: BookText,
  LISTENING: Headphones,
  WRITING: PenLine,
  SPEAKING: Mic,
};

const CROSS_SKILL_ICON: Record<string, LucideIcon> = {
  streak_3: Flame,
  streak_7: Flame,
  streak_14: Flame,
  streak_30: Flame,
  explorer_3: Compass,
  all_rounder: Award,
  volume_10: Star,
  volume_50: Target,
  volume_100: Trophy,
  unit_master: Trophy,
};

function badgeIcon(def: BadgeDef): LucideIcon {
  return (
    CROSS_SKILL_ICON[def.code] ??
    (def.skillArea ? SKILL_ICON[def.skillArea] : undefined) ??
    Medal
  );
}

/** Distinct-day streak ending today or yesterday, plus the longest run ever. */
function streaks(dates: number[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };
  const days = [...new Set(dates.map((d) => Math.floor(d / DAY)))].sort(
    (a, b) => a - b,
  );
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const set = new Set(days);
  const today = Math.floor(Date.now() / DAY);
  let cursor = set.has(today) ? today : set.has(today - 1) ? today - 1 : null;
  let current = 0;
  while (cursor !== null && set.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, longest };
}

function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const GOAL_KEY = "lexora:dailyGoal";

// ---------------------------------------------------------------------------
// Skill-group → DB SkillArea mapping (for useSkillMastery result lookup)
// ---------------------------------------------------------------------------

const GROUP_TO_SKILL: Record<string, string> = {
  "Grammar Tests": "GRAMMAR",
  "Vocabulary Tests": "VOCABULARY",
  "Reading Tests": "READING",
  "Listening Tests": "LISTENING",
  "Writing Tests": "WRITING",
  "Speaking Tests": "SPEAKING",
};

export default function DashboardPage() {
  const { user, loading } = useSession();
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Legacy localStorage data (always loaded; used as fallback when Supabase is
  // disabled, ignored when Supabase is enabled).
  // ---------------------------------------------------------------------------
  const localAttempts = useAttempts();
  const tests = useTests();

  // ---------------------------------------------------------------------------
  // Real Supabase data — all three hooks return empty/zero immediately when
  // SUPABASE_ENABLED is false, so they're always safe to call.
  // ---------------------------------------------------------------------------
  const { attempts: realAttempts, loading: attLoading } = useMyAttempts();
  const { mastery: realMastery, loading: masteryLoading } = useSkillMastery();
  // Badge truth comes from badge_unlocks, not from client-side re-derivation.
  const {
    codes: earnedCodes,
    loading: badgesLoading,
    error: badgesError,
  } = useEarnedBadges();
  const {
    current: realStreakCurrent,
    longest: realStreakLongest,
    loading: streakLoading,
  } = useStreak();

  // Lifetime XP + level from the SHARED source of truth (useStudentXp): the sum
  // of the student's own points_ledger rows, keyed by student_id and independent
  // of group. This is the same hook the top-bar pill uses, so the two never
  // disagree, and the score survives group changes, renames, and new devices.
  const { xp: displayXp, level } = useStudentXp();

  // Editable daily goal, persisted locally. Initialise to the constant default
  // on BOTH server and first client render (hydration-safe), then hydrate the
  // stored value in an effect.
  const [dailyGoal, setDailyGoal] = useState(3);
  useEffect(() => {
    const raw = Number(localStorage.getItem(GOAL_KEY));
    if (raw > 0) setDailyGoal(raw);
  }, []);
  function updateGoal(n: number) {
    const v = Math.max(1, Math.min(20, n));
    setDailyGoal(v);
    localStorage.setItem(GOAL_KEY, String(v));
  }

  // ---------------------------------------------------------------------------
  // Legacy: filter localStorage attempts by display name.
  // ---------------------------------------------------------------------------
  const localMine = useMemo(() => {
    if (!user) return [];
    const name = user.name.trim().toLowerCase();
    return localAttempts.filter((a) => a.takerName.trim().toLowerCase() === name);
  }, [localAttempts, user]);

  // ---------------------------------------------------------------------------
  // Whether real Supabase data is still loading. Show skeleton until resolved.
  //
  // Safety net: if a data hook stalls (e.g. a network request that never
  // settles), don't trap the page on the spinner forever — after a few seconds
  // render with whatever resolved (zeros/empties are the safe defaults). The
  // per-hook `.catch` handles thrown errors; this handles indefinite hangs.
  // ---------------------------------------------------------------------------
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoadTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  const dataLoading =
    SUPABASE_ENABLED &&
    !loadTimedOut &&
    (attLoading || masteryLoading || streakLoading || badgesLoading);

  // ---------------------------------------------------------------------------
  // Stats: sourced from Supabase when enabled, localStorage otherwise.
  // avg = mean accuracy across non-excluded attempts (0..100)
  // best = max accuracy (0..100)
  // count = total attempts
  // tests = distinct test ids
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    if (SUPABASE_ENABLED) {
      const nonExcluded = realAttempts.filter((a) => !a.excludedFromProgress);
      const accs = nonExcluded.map((a) => a.accuracy);
      const avg =
        accs.length > 0
          ? Math.round((accs.reduce((s, p) => s + p, 0) / accs.length) * 100)
          : 0;
      const best =
        accs.length > 0 ? Math.round(Math.max(...accs) * 100) : 0;
      return {
        count: realAttempts.length,
        avg,
        best,
        tests: new Set(nonExcluded.map((a) => a.testId)).size,
        streak: realStreakCurrent,
        longest: realStreakLongest,
      };
    }
    // Legacy localStorage path
    const pcts = localMine.map(pct);
    const avg =
      pcts.length > 0
        ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 100)
        : 0;
    const best = pcts.length > 0 ? Math.round(Math.max(...pcts) * 100) : 0;
    const bestByTestLocal = new Map<string, number>();
    for (const a of localMine) {
      bestByTestLocal.set(
        a.testId,
        Math.max(bestByTestLocal.get(a.testId) ?? 0, pct(a) * 100),
      );
    }
    const s = streaks(localMine.map((a) => a.submittedAt));
    return {
      count: localMine.length,
      avg,
      best,
      tests: bestByTestLocal.size,
      streak: s.current,
      longest: s.longest,
    };
  }, [
    realAttempts,
    localMine,
    realStreakCurrent,
    realStreakLongest,
  ]);

  // ---------------------------------------------------------------------------
  // Skill mastery per group: Supabase (useSkillMastery) or legacy (bestByTest).
  // ---------------------------------------------------------------------------

  // Legacy bestByTest — only used when SUPABASE_ENABLED is false.
  const localBestByTest = useMemo(() => {
    if (SUPABASE_ENABLED) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const a of localMine) {
      m.set(a.testId, Math.max(m.get(a.testId) ?? 0, pct(a) * 100));
    }
    return m;
  }, [localMine]);

  const skillProgress = useMemo(() => {
    return SKILL_GROUPS.map((g) => {
      if (SUPABASE_ENABLED) {
        // Map the test-group name to a DB SkillArea key and look up mastery.
        // `attempted` is reported by the hook from whether any graded row
        // exists, so a real 0% stays distinguishable from "never tried" — the
        // distinction the focus-area recommendation depends on.
        const skillKey = GROUP_TO_SKILL[g];
        const stat = skillKey
          ? realMastery[skillKey as keyof typeof realMastery]
          : undefined;
        return {
          group: g,
          label: g.replace(" Tests", ""),
          total: stat?.tests ?? 0,
          done: stat?.tests ?? 0,
          attempted: stat?.attempted ?? false,
          avg: stat?.avg ?? 0,
        };
      }
      // Legacy path
      const inGroup = tests.filter((t) => groupOf(t) === g);
      const done = inGroup.filter((t) => localBestByTest.has(t.id));
      const avg =
        done.length > 0
          ? Math.round(
              done.reduce((s, t) => s + (localBestByTest.get(t.id) ?? 0), 0) /
                done.length,
            )
          : 0;
      return {
        group: g,
        label: g.replace(" Tests", ""),
        total: inGroup.length,
        done: done.length,
        attempted: done.length > 0,
        avg,
      };
    });
  }, [tests, localBestByTest, realMastery]);

  // Focus area: the started skill with the lowest mastery.
  const focus = useMemo(() => {
    const started = skillProgress
      .filter((s) => s.attempted)
      .sort((a, b) => a.avg - b.avg);
    if (started.length > 0 && started[0].avg < 80) return started[0];
    const untouched = skillProgress.find((s) => !s.attempted);
    return untouched ?? started[0] ?? null;
  }, [skillProgress]);

  // ---------------------------------------------------------------------------
  // Momentum + activity sparkline: sourced from realAttempts or localMine.
  // MyAttempt.accuracy is 0..1; local pct() is also 0..1.
  // ---------------------------------------------------------------------------
  const momentum = useMemo(() => {
    const now = Date.now();
    if (SUPABASE_ENABLED) {
      const nonExcluded = realAttempts.filter((a) => !a.excludedFromProgress);
      const win = (from: number, to: number) => {
        const xs = nonExcluded.filter(
          (a) => a.submittedAt >= from && a.submittedAt < to,
        );
        return xs.length
          ? (xs.reduce((s, a) => s + a.accuracy, 0) / xs.length) * 100
          : null;
      };
      const thisWeek = win(now - 7 * DAY, now);
      const lastWeek = win(now - 14 * DAY, now - 7 * DAY);
      if (thisWeek === null || lastWeek === null) return null;
      return Math.round(thisWeek - lastWeek);
    }
    // Legacy
    const win = (from: number, to: number) => {
      const xs = localMine.filter(
        (a) => a.submittedAt >= from && a.submittedAt < to,
      );
      return xs.length
        ? (xs.reduce((s, a) => s + pct(a), 0) / xs.length) * 100
        : null;
    };
    const thisWeek = win(now - 7 * DAY, now);
    const lastWeek = win(now - 14 * DAY, now - 7 * DAY);
    if (thisWeek === null || lastWeek === null) return null;
    return Math.round(thisWeek - lastWeek);
  }, [realAttempts, localMine]);

  // 14-day activity sparkline (attempts per day).
  const activity = useMemo(() => {
    const today = Math.floor(Date.now() / DAY);
    const buckets = new Array(14).fill(0) as number[];
    const source: { submittedAt: number }[] = SUPABASE_ENABLED
      ? realAttempts
      : localMine;
    for (const a of source) {
      const d = Math.floor(a.submittedAt / DAY);
      const idx = 13 - (today - d);
      if (idx >= 0 && idx < 14) buckets[idx]++;
    }
    return buckets;
  }, [realAttempts, localMine]);

  // Daily goal progress.
  const goalDone = useMemo(() => {
    const today = Math.floor(Date.now() / DAY);
    const source: { submittedAt: number }[] = SUPABASE_ENABLED
      ? realAttempts
      : localMine;
    return source.filter(
      (a) => Math.floor(a.submittedAt / DAY) === today,
    ).length;
  }, [realAttempts, localMine]);

  // ---------------------------------------------------------------------------
  // Recent results list — newest 6, real or local.
  // Rendered differently: real (MyAttempt) vs local (Attempt) have different shapes.
  // We normalise to a common display shape.
  // ---------------------------------------------------------------------------
  type RecentItem = {
    id: string;
    testTitle: string;
    accuracy: number; // 0..1
    submittedAt: number;
    score: number;
    maxScore: number;
    testGroup?: string; // only available for local attempts
  };

  const testById = useMemo(
    () => new Map(tests.map((t) => [t.id, t])),
    [tests],
  );

  const recent = useMemo((): RecentItem[] => {
    if (SUPABASE_ENABLED) {
      return [...realAttempts]
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .slice(0, 6)
        .map(
          (a: MyAttempt): RecentItem => ({
            id: a.id,
            testTitle: a.testTitle,
            accuracy: a.accuracy,
            submittedAt: a.submittedAt,
            score: a.score,
            maxScore: a.maxScore,
          }),
        );
    }
    return [...localMine]
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, 6)
      .map(
        (a: Attempt): RecentItem => ({
          id: a.id,
          testTitle: a.testTitle,
          accuracy: pct(a),
          submittedAt: a.submittedAt,
          score: a.score,
          maxScore: a.maxScore,
          testGroup: (() => {
            const t = testById.get(a.testId);
            return t ? groupOf(t).replace(" Tests", "") : undefined;
          })(),
        }),
      );
  }, [realAttempts, localMine, testById]);

  // ---------------------------------------------------------------------------
  // Badges — fed from skillProgress (always computed above) + streak.
  // ---------------------------------------------------------------------------
  const { badgeGroups, earnedCount, totalCount } = useMemo(() => {
    // With the real backend on, earned state is whatever the server awarded
    // (badge_unlocks). The old client-side re-derivation ran on counts this
    // page never actually had — skill counts were a 0-or-1 sentinel and
    // unitsMastered was hardcoded 0 — so volume and unit badges could never
    // light up here regardless of what the student had done.
    const evaluated = SUPABASE_ENABLED
      ? BADGE_CATALOG.map((def) => ({ def, earned: earnedCodes.has(def.code) }))
      : (() => {
          const skillTests: Partial<Record<BadgeSkill, number>> = {};
          for (const s of skillProgress) {
            if (s.done > 0) {
              skillTests[s.label.toUpperCase() as BadgeSkill] = s.done;
            }
          }
          const counts: BadgeCounts = {
            skillTests,
            streakDays: stats.longest,
            unitsMastered: 0,
          };
          return BADGE_CATALOG.map((def) => ({
            def,
            earned: isBadgeEarned(def, counts),
          }));
        })();

    const groupFor = (def: BadgeDef): { key: string; label: string } => {
      if (def.metric === "skill_tests" && def.skillArea) {
        return {
          key: def.skillArea,
          label: def.skillArea[0] + def.skillArea.slice(1).toLowerCase(),
        };
      }
      if (def.metric === "streak_days") return { key: "streaks", label: "Streaks" };
      if (def.metric === "skills_touched") return { key: "breadth", label: "Breadth" };
      if (def.metric === "total_tests") return { key: "volume", label: "Volume" };
      return { key: "completion", label: "Completion" };
    };

    const order: string[] = [];
    const byKey = new Map<
      string,
      { key: string; label: string; badges: typeof evaluated }
    >();
    for (const b of evaluated) {
      const g = groupFor(b.def);
      if (!byKey.has(g.key)) {
        byKey.set(g.key, { ...g, badges: [] });
        order.push(g.key);
      }
      byKey.get(g.key)!.badges.push(b);
    }

    return {
      badgeGroups: order.map((k) => byKey.get(k)!),
      earnedCount: evaluated.filter((b) => b.earned).length,
      totalCount: evaluated.length,
    };
  }, [skillProgress, stats.longest, earnedCodes]);

  // ---------------------------------------------------------------------------
  // Gate: show spinner while auth is resolving OR while real data is loading.
  // ---------------------------------------------------------------------------
  if (loading || !user) {
    return <DashboardSkeleton />;
  }

  // While Supabase data is fetching, show a skeleton shaped like the real
  // layout so widgets don't flash zeros then correct values, and so the page
  // doesn't jump. A spinner in the middle of content is the wrong treatment
  // here: it tells the student nothing about what is arriving.
  if (dataLoading) {
    return <DashboardSkeleton />;
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  function signOut() {
    logout();
    router.replace("/login");
  }

  const started = stats.count > 0;

  return (
    <div className="space-y-6">
      {/* ============ Hero ============ */}
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-6 text-white shadow-card-hover sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl motion-reduce:hidden" />
        <div className="pointer-events-none absolute -bottom-28 left-16 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl motion-reduce:hidden" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold ring-1 ring-inset ring-white/25"
              >
                {initial}
              </span>
              <div>
                <p className="text-sm text-brand-100/80">{greeting()},</p>
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {user.name}
                </h1>
                <div className="mt-1 flex items-center gap-2 text-xs text-brand-100/80">
                  <span>@{user.username}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-semibold ring-1 ring-inset ring-white/20">
                    <Award className="h-3 w-3" />
                    {level.name}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={signOut}
              className="!border-white/25 !bg-white/10 !text-white hover:!bg-white/20"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>

          {/* Level progress */}
          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-brand-100/90">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                {displayXp.toLocaleString()} XP
              </span>
              <span>
                {level.next
                  ? `${level.toNext.toLocaleString()} XP to ${level.next.name}`
                  : "Max level reached"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${level.progress}%` }}
              />
            </div>
          </div>

          {/* Stat tiles — sourced from real Supabase data when enabled */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat icon={Flame} label="Day streak" value={stats.streak} />
            <HeroStat icon={TrendingUp} label="Avg score" value={`${stats.avg}%`} />
            <HeroStat icon={Star} label="Best score" value={`${stats.best}%`} />
            <HeroStat icon={BookOpen} label="Tests taken" value={stats.tests} />
          </div>
        </div>
      </header>

      {!started ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Sparkles className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            Your journey starts here
          </h2>
          <p className="max-w-sm text-sm text-slate-600">
            Start with practice: it is open to you any time, and it feeds your
            skill mastery, XP and streak. Tests arrive as a link from your
            teacher.
          </p>
          <LinkButton href="/practice" className="mt-1">
            Start practising
          </LinkButton>
        </Card>
      ) : (
        <>
          {/* ============ Skill radar + focus + goal ============ */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="!p-6">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Compass className="h-4 w-4 text-brand-600" />
                  Skill mastery
                </h2>
                <span className="text-xs text-slate-500">
                  avg accuracy per skill
                </span>
              </div>
              <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <SkillRadar data={skillProgress} />
                <div className="space-y-2.5">
                  {skillProgress.map((s) => (
                    <div key={s.group}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">
                          {s.label}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {s.done > 0 ? (
                            <span className="font-semibold text-slate-800">
                              {s.avg}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Not started
                            </span>
                          )}
                        </span>
                      </div>
                      <ProgressBar
                        value={s.avg}
                        tone={
                          s.avg >= 80 ? "success" : s.avg >= 40 ? "brand" : "amber"
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div className="space-y-6">
              {/* Focus area */}
              <Card className="!p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Target className="h-4 w-4 text-brand-600" />
                  Focus area
                </h2>
                {focus ? (
                  <div className="mt-3">
                    <p className="text-lg font-extrabold text-slate-900">
                      {focus.label}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {focus.attempted
                        ? `Your weakest skill at ${focus.avg}%. A little practice goes a long way.`
                        : "You haven't tried this skill yet. Give it a go."}
                    </p>
                    <LinkButton href="/practice" className="mt-3 w-full">
                      Practise {focus.label}
                    </LinkButton>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Great balance across every skill.
                  </p>
                )}
              </Card>

              {/* Daily goal */}
              <Card className="!p-5">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Flame className="h-4 w-4 text-amber-500" />
                    Daily goal
                  </h2>
                  <div className="flex items-center gap-1">
                    <GoalBtn
                      onClick={() => updateGoal(dailyGoal - 1)}
                      label="−"
                      disabled={dailyGoal <= 1}
                    />
                    <span className="w-6 text-center text-sm font-bold tabular-nums text-slate-800">
                      {dailyGoal}
                    </span>
                    <GoalBtn
                      onClick={() => updateGoal(dailyGoal + 1)}
                      label="+"
                      disabled={dailyGoal >= 20}
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold tabular-nums text-slate-900">
                    {Math.min(goalDone, dailyGoal)}
                    <span className="text-sm font-semibold text-slate-500">
                      {" "}
                      / {dailyGoal}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    tests today
                  </span>
                </div>
                <ProgressBar
                  value={(Math.min(goalDone, dailyGoal) / dailyGoal) * 100}
                  tone="success"
                  className="mt-2"
                />
                <p className="mt-3 text-xs font-medium text-slate-500">
                  {goalDone >= dailyGoal
                    ? "Goal smashed — see you tomorrow!"
                    : `${dailyGoal - goalDone} to go · ${stats.streak}-day streak`}
                </p>
              </Card>
            </div>
          </div>

          {/* ============ Momentum + achievements ============ */}
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Weekly momentum */}
            <Card className="!p-5">
              <h2 className="text-sm font-bold text-slate-900">This week</h2>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-slate-900">
                  {momentum === null ? "—" : `${momentum > 0 ? "+" : ""}${momentum}%`}
                </span>
                {momentum !== null && momentum !== 0 && (
                  <span
                    className={`mb-1 inline-flex items-center gap-0.5 text-sm font-semibold ${
                      momentum > 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {momentum > 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    vs last week
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {momentum === null
                  ? "Keep testing to see your weekly trend."
                  : momentum > 0
                    ? "You're improving — keep the momentum."
                    : momentum < 0
                      ? "A dip this week. A focused session will turn it around."
                      : "Holding steady."}
              </p>
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  Last 14 days
                </p>
                <Sparkline data={activity} />
              </div>
            </Card>

            {/* Badges */}
            <Card className="!p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Medal className="h-4 w-4 text-amber-500" />
                  Badges
                </h2>
                <span className="text-xs font-semibold tabular-nums text-slate-500">
                  {badgesError ? "Unavailable" : `${earnedCount}/${totalCount}`}
                </span>
              </div>
              <div className="space-y-4">
                {badgeGroups.map((group) => {
                  const groupEarned = group.badges.filter(
                    (b) => b.earned,
                  ).length;
                  return (
                    <div key={group.key}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {group.label}
                        </p>
                        <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                          {groupEarned}/{group.badges.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {group.badges.map(({ def, earned }) => {
                          const Icon = badgeIcon(def);
                          return (
                            <div
                              key={def.code}
                              className={`flex items-center gap-2.5 rounded-xl border p-2.5 ${
                                earned
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-slate-200 bg-slate-50"
                              }`}
                            >
                              <span
                                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                  earned
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                                {/* State is never colour-only: earned carries a
                                    check, locked carries a padlock. */}
                                <span
                                  className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${
                                    earned
                                      ? "bg-amber-600 text-white"
                                      : "bg-slate-300 text-slate-700"
                                  }`}
                                >
                                  {earned ? (
                                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                                  ) : (
                                    <Lock className="h-2.5 w-2.5" strokeWidth={3} />
                                  )}
                                </span>
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-800">
                                  {def.name}
                                  <span className="sr-only">
                                    {earned ? " — earned" : " — locked"}
                                  </span>
                                </p>
                                <p className="truncate text-[11px] text-slate-600">
                                  {def.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* ============ Recent results + leaderboard ============ */}
          <div className="grid gap-6 lg:grid-cols-2">
            {recent.length > 0 && (
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <h2 className="text-sm font-bold text-slate-900">
                    Recent results
                  </h2>
                  <Link
                    href="/results"
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800"
                  >
                    View all
                  </Link>
                </div>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {recent.map((item) => {
                    const p = Math.round(item.accuracy * 100);
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {item.testTitle}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.testGroup ? `${item.testGroup} · ` : ""}
                            {timeAgo(item.submittedAt)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {item.score}/{item.maxScore}
                        </span>
                        <Badge
                          tone={p >= 80 ? "success" : p >= 50 ? "brand" : "amber"}
                          className="tabular-nums"
                        >
                          {p}%
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {/* Leaderboard */}
            <Card className="!p-5">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-bold text-slate-900">Leaderboard</h2>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                See where you rank in your group.
              </p>
              <Link
                href="/leaderboard"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
              >
                View group leaderboard
              </Link>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

// Loading treatment: shapes that match the real layout (hero, mastery panel,
// side column, lower row) so the page doesn't jump when data lands. The product
// register rules out a spinner parked in the middle of content.
function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your dashboard</span>
      <div className="h-64 animate-pulse rounded-3xl bg-slate-200/70 sm:h-72" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-72 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="space-y-6">
          <div className="h-40 animate-pulse rounded-xl bg-slate-200/70" />
          <div className="h-44 animate-pulse rounded-xl bg-slate-200/70" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="h-52 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="h-52 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-inset ring-white/15">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-100/80">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums leading-tight">
        {value}
      </div>
    </div>
  );
}

// The visible chip stays small so the goal card keeps its density, but the
// button itself is a full 44px target on touch (PRODUCT.md accessibility
// floor); the negative margins stop that larger hit area from bloating the row.
function GoalBtn({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "Increase daily goal" : "Decrease daily goal"}
      className="-my-2.5 flex h-11 w-11 items-center justify-center text-sm font-bold text-slate-500 transition-colors hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 sm:-my-1.5 sm:h-9 sm:w-9"
    >
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 bg-white"
      >
        {label}
      </span>
    </button>
  );
}

/** SVG radar/spider chart of per-skill mastery — the signature visual. */
function SkillRadar({
  data,
}: {
  data: { label: string; avg: number; attempted: boolean }[];
}) {
  const size = 220;
  const c = size / 2;
  const r = c - 40;
  const n = data.length;
  const angleAt = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, radius: number) => {
    const a = angleAt(i);
    return [c + Math.cos(a) * radius, c + Math.sin(a) * radius] as const;
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const gridPoly = (frac: number) =>
    data.map((_, i) => point(i, r * frac).join(",")).join(" ");
  const valuePoly = data
    .map((d, i) => point(i, r * (Math.max(0, Math.min(100, d.avg)) / 100)).join(","))
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto h-auto w-full max-w-[240px]"
      role="img"
      aria-label={`Skill mastery: ${data
        .map((d) => `${d.label} ${d.attempted ? `${d.avg}%` : "not started"}`)
        .join(", ")}`}
    >
      {rings.map((frac) => (
        <polygon
          key={frac}
          points={gridPoly(frac)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {data.map((_, i) => {
        const [x, y] = point(i, r);
        return (
          <line
            key={i}
            x1={c}
            y1={c}
            x2={x}
            y2={y}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        );
      })}
      <polygon
        points={valuePoly}
        fill="rgba(90,63,202,0.18)"
        stroke="#5a3fca"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {data.map((d, i) => {
        const [x, y] = point(i, (r * Math.max(0, Math.min(100, d.avg))) / 100);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={d.attempted ? 3 : 2.5}
            fill={d.attempted ? "#5a3fca" : "#ffffff"}
            stroke="#5a3fca"
            strokeWidth={d.attempted ? 0 : 1.5}
          />
        );
      })}
      {data.map((d, i) => {
        const [x, y] = point(i, r + 18);
        return (
          <text
            key={d.label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-600 text-[11px] font-semibold"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

/** Minimal bar sparkline of per-day activity, oldest day first. */
function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const total = data.reduce((s, v) => s + v, 0);
  const activeDays = data.filter((v) => v > 0).length;
  return (
    <div
      className="flex h-12 items-end gap-1"
      role="img"
      aria-label={
        total === 0
          ? "No activity in the last 14 days"
          : `${total} test${total === 1 ? "" : "s"} across ${activeDays} day${
              activeDays === 1 ? "" : "s"
            } in the last 14 days`
      }
    >
      {data.map((v, i) => {
        const daysAgo = data.length - 1 - i;
        return (
          <div
            key={i}
            /* A day with no activity is a flat 2px rule, not a short tinted
               bar: the old 8% floor made a fortnight of nothing read as faint
               activity. */
            className={`flex-1 rounded-sm ${v > 0 ? "bg-brand-500" : "h-0.5 bg-slate-200"}`}
            style={v > 0 ? { height: `${Math.max(12, (v / max) * 100)}%` } : undefined}
            title={`${
              daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`
            }: ${v} test${v === 1 ? "" : "s"}`}
          />
        );
      })}
    </div>
  );
}
