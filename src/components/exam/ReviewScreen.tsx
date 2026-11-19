"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { formatClock } from "./time";

// Pre-submit checkpoint for GRADED (one-way) mode. A student arrives here
// after answering the last question, not before it — they've already moved
// past every question in the test, so there is nothing left to jump back
// to. This is deliberately read-only: no onJump, no items list of
// per-question buttons. Unanswered questions are listed as plain text so a
// student knows what they left blank, but the only way back into the test
// is onBack, which returns to the question they're currently sitting on
// (not an arbitrary earlier one — they haven't advanced past it, so this
// isn't a lock violation).
export function ReviewScreen({
  answeredCount,
  total,
  unanswered,
  onSubmit,
  onBack,
  submitting = false,
  timeRemainingSec,
}: {
  answeredCount: number;
  total: number;
  unanswered: number[];
  onSubmit: () => void;
  onBack: () => void;
  submitting?: boolean;
  timeRemainingSec?: number | null;
}) {
  const unansweredCount = unanswered.length;

  // Entering review swaps out the subtree that held keyboard focus, which
  // would otherwise drop focus to document.body with nothing announced.
  // Focusing the heading (tabIndex -1, so it's programmatic-only, never in
  // the Tab order) makes a screen reader announce it on arrival.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-xl font-bold text-slate-900 outline-none sm:text-2xl"
          >
            Review your answers
          </h1>
          <p className="mt-1 font-mono text-sm tabular-nums text-slate-600">
            {answeredCount} answered · {unansweredCount} unanswered
          </p>
        </div>
        {timeRemainingSec != null && (
          <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums text-slate-700">
            {formatClock(timeRemainingSec)}
          </span>
        )}
      </div>

      {unansweredCount > 0 && (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          <p className="font-medium">
            Blank answers score zero and can't be revisited — once you
            submit, this attempt is final.
          </p>
          <p className="font-mono tabular-nums">
            Unanswered: {unanswered.join(", ")}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back to test
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit test"}
        </Button>
      </div>
    </div>
  );
}
