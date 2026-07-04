"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, LinkButton } from "@/components/ui";
import {
  ArrowIcon,
  ChartIcon,
  LogOutIcon,
  SlidersIcon,
  TrophyIcon,
} from "@/components/icons";
import { logout, useSession } from "@/lib/auth";
import { useAttempts } from "@/lib/store";

export default function ProfilePage() {
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
    if (mine.length === 0) return { count: 0, avg: 0, best: 0 };
    const pcts = mine.map((a) => (a.maxScore > 0 ? a.score / a.maxScore : 0));
    return {
      count: mine.length,
      avg: Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 100),
      best: Math.round(Math.max(...pcts) * 100),
    };
  }, [mine]);

  // AuthGate handles the redirect for signed-out users; render nothing meanwhile.
  if (loading || !user) return null;

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="space-y-8">
      {/* Identity */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-card"
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

      {/* Activity */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Your activity</h2>
        {stats.count === 0 ? (
          <Card className="space-y-3">
            <p className="text-sm text-slate-600">
              You haven&rsquo;t completed any tests yet. Take one and your
              results will show up here.
            </p>
            <LinkButton href="/tests">Browse tests</LinkButton>
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Tests taken" value={stats.count} />
            <Stat label="Average" value={`${stats.avg}%`} />
            <Stat label="Best" value={`${stats.best}%`} tone="amber" />
          </div>
        )}
      </section>

      {/* Shortcuts */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Shortcuts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LinkCard
            href="/dashboard"
            icon={<ChartIcon />}
            title="Dashboard"
            desc="Your recent results and progress over time."
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
  tone = "brand",
}: {
  label: string;
  value: string | number;
  tone?: "brand" | "amber";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          tone === "amber" ? "text-amber-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
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
