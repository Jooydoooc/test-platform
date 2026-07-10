"use client";

import Link from "next/link";
import { Card, LinkButton } from "@/components/ui";
import {
  ArrowIcon,
  BookIcon,
  BrainIcon,
  ChartIcon,
  CheckSquareIcon,
  SlidersIcon,
  TrophyIcon,
} from "@/components/icons";
import { useSession } from "@/lib/auth";

export default function Home() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const firstName = user?.name.split(" ")[0];

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-brand-600/20 bg-brand-600 px-6 py-8 text-white shadow-card sm:px-8 sm:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative max-w-2xl space-y-3">
          <p className="text-sm font-medium text-brand-100">
            {user ? "Welcome back" : "English practice, made personal"}
          </p>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {firstName ? `Ready to practise, ${firstName}?` : "Lexora"}
          </h1>
          <p className="max-w-xl text-pretty text-brand-50/90">
            Your private space to practise English, work through textbook
            exercises, take tests, review your mistakes, and watch your progress
            grow.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <LinkButton
              href="/practice"
              variant="secondary"
              className="border-transparent bg-white text-brand-700 hover:bg-brand-50"
            >
              Start practising
            </LinkButton>
            <LinkButton
              href="/tests"
              variant="ghost"
              className="text-white ring-1 ring-inset ring-white/40 hover:bg-white/10 hover:text-white"
            >
              Browse tests
            </LinkButton>
          </div>
        </div>
      </section>

      {/* Activity hub */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          What would you like to do?
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            href="/practice"
            icon={<BrainIcon />}
            title="Practice"
            desc="Work through exercises one question at a time with instant feedback. Not graded, so you can repeat as often as you like."
          />
          <ActionCard
            href="/tests"
            icon={<CheckSquareIcon />}
            title="Tests"
            desc="Take grammar, reading, listening, and vocabulary tests and get a scored breakdown right away."
          />
          <ActionCard
            href="/books"
            icon={<BookIcon />}
            title="Books & vocabulary"
            desc="Textbook-based practice and vocabulary sets chosen by your admin, organised by level."
          />
          <ActionCard
            href="/dashboard"
            icon={<ChartIcon />}
            title="Your progress"
            desc="See your recent results, review mistakes, and track how you're improving over time."
          />
          <ActionCard
            href="/leaderboard"
            icon={<TrophyIcon />}
            title="Leaderboard"
            desc="See where you stand against your classmates and stay motivated to climb the ranks."
          />
          {isAdmin && (
            <ActionCard
              href="/admin"
              icon={<SlidersIcon />}
              title="Admin tools"
              desc="Manage students and groups, upload tasks and tests, and track class progress."
              accent
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ActionCard({
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
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            accent
              ? "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/15"
              : "bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15"
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
