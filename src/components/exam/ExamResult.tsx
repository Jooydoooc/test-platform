"use client";

import Link from "next/link";
import { Card } from "@/components/ui";

// Merges the DB rail's finished-phase card (percentage, pendingReview,
// auto-submit cause banner, EXP/badges) into a shared terminal screen.
export function ExamResult({
  scoreEarned,
  scoreTotal,
  pendingReview = false,
  expAwarded = 0,
  newBadges = [],
  cause = "manual",
  primaryHref,
  primaryLabel,
  heading = "Test submitted",
}: {
  scoreEarned?: number | null;
  scoreTotal?: number | null;
  pendingReview?: boolean;
  expAwarded?: number;
  newBadges?: string[];
  cause?: "manual" | "timeout" | "left";
  primaryHref: string;
  primaryLabel: string;
  heading?: string;
}) {
  const pct =
    scoreEarned != null && scoreTotal != null && scoreTotal > 0
      ? Math.round((scoreEarned / scoreTotal) * 100)
      : null;
  const tone =
    pct == null
      ? "text-slate-900"
      : pct >= 80
        ? "text-success"
        : pct >= 50
          ? "text-brand-600"
          : "text-error";

  return (
    <Card className="mx-auto max-w-md text-center">
      <h1 className="font-display text-lg font-bold text-slate-900">{heading}</h1>

      {cause !== "manual" && (
        <p className="mx-auto mt-2 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
          {cause === "timeout"
            ? "Time ran out, so your answers were submitted automatically."
            : "You left the exam, so your answers were submitted automatically."}
        </p>
      )}

      {pendingReview ? (
        <p className="mt-3 text-sm text-slate-600">
          Your answers were recorded. Your teacher will grade the written
          questions, then your score appears in your results.
        </p>
      ) : pct != null ? (
        <div className="mt-4">
          <p className={`font-mono text-5xl font-bold tabular-nums ${tone}`}>
            {pct}%
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {scoreEarned} of {scoreTotal} points
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          Your answers were recorded.
        </p>
      )}

      {expAwarded > 0 && (
        <p className="mt-3 text-sm font-semibold text-brand-600">
          +{expAwarded} EXP earned
        </p>
      )}
      {newBadges.length > 0 && (
        <p className="mt-1 text-sm font-medium text-accent-700">
          New badge{newBadges.length > 1 ? "s" : ""}: {newBadges.join(", ")}
        </p>
      )}

      <Link
        href={primaryHref}
        className="mt-5 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        {primaryLabel}
      </Link>
    </Card>
  );
}
