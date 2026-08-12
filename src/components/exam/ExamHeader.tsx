"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";
import { formatClock } from "./time";

// Discrete points to announce the countdown at, highest first. A ticking
// aria-live="assertive" region interrupts a screen-reader user every second
// once time is low — announcing only at these milestones (each fired once,
// tracked in a ref so a re-render can't repeat it) keeps the warning useful
// instead of relentless.
const ANNOUNCE_MILESTONES = [300, 60, 30, 10];

function milestoneLabel(sec: number): string {
  if (sec >= 60) return `${sec / 60} minute${sec === 60 ? "" : "s"} remaining`;
  return `${sec} seconds remaining`;
}

// Sticky exam chrome shared by both React rails. Countdown urgency (<=60s)
// drives the red styling; the live-announced milestones below are a
// separate, coarser cadence so a screen-reader user isn't interrupted once
// per second for the whole final minute.
//
// Layout: row 1 is title + timer (the two things a student needs at a
// glance, kept on one line at every width); row 2 is the secondary status
// cluster (position, answered count, proctor violations), which wraps
// instead of forcing row 1 to shrink. Cramming all four onto one row used
// to overflow horizontally at 360px — this two-row split is the fix, and it
// applies at every width rather than only below a breakpoint, so there's no
// layout jump as the viewport resizes.
export function ExamHeader({
  title,
  subtitle,
  index,
  total,
  answered,
  remainingSec,
  violations = 0,
  preview = false,
}: {
  title: string;
  subtitle?: string;
  index: number;
  total: number;
  answered: number;
  remainingSec?: number | null;
  violations?: number;
  preview?: boolean;
}) {
  const low = remainingSec != null && remainingSec <= 60;
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  const position = Math.min(index + 1, total);

  // Milestone announcer: fires each threshold in ANNOUNCE_MILESTONES at most
  // once, as remainingSec counts down THROUGH it. A milestone already behind us
  // on the first tick is retired silently rather than announced — otherwise a
  // 3-minute test opens by claiming "5 minutes remaining", and resuming an
  // attempt with 5 seconds left would announce "10 seconds remaining". Only a
  // real crossing (previous > m >= current) is worth interrupting a student for.
  const [announcement, setAnnouncement] = useState("");
  const firedRef = useRef<Set<number>>(new Set());
  const prevRef = useRef<number | null>(null);
  useEffect(() => {
    if (remainingSec == null) return;
    const prev = prevRef.current;
    prevRef.current = remainingSec;
    for (const m of ANNOUNCE_MILESTONES) {
      if (remainingSec > m || firedRef.current.has(m)) continue;
      firedRef.current.add(m);
      // prev == null is the first observation: adopt the milestone as already
      // passed without speaking it.
      if (prev != null && prev > m) setAnnouncement(milestoneLabel(m));
    }
  }, [remainingSec]);

  return (
    <header className="sticky top-2 z-10 overflow-hidden rounded-2xl bg-brand-600 p-4 text-white shadow-card sm:p-5">
      {/* Row 1: title + timer. min-w-0/truncate on the title side and
          shrink-0 on the timer keep this row from ever wrapping or
          overflowing, no matter how long the test title is. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-100 ring-1 ring-inset ring-white/15">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            {preview ? "Preview" : "Secure mode"}
          </span>
          <h1 className="mt-2 truncate text-base font-bold tracking-tight sm:text-lg">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 hidden truncate text-xs text-slate-200 sm:block">
              {subtitle}
            </p>
          )}
        </div>
        {remainingSec != null && (
          <span
            role="timer"
            aria-live="off"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums sm:text-sm ${
              low
                ? "bg-red-500/25 text-red-100 ring-1 ring-inset ring-red-400/40"
                : "bg-white/10 text-white ring-1 ring-inset ring-white/20"
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="sr-only">Time remaining: </span>
            {formatClock(remainingSec)}
          </span>
        )}
      </div>

      {/* Row 2: position, answered count, proctor violations. flex-wrap so
          this cluster wraps onto its own additional line rather than ever
          pushing width past the viewport — verified not to overflow at
          360px and 390px. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-200 sm:text-sm">
        <span className="font-mono font-semibold tabular-nums text-slate-100">
          {position}
          <span className="text-slate-300"> / {total}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="font-mono font-semibold tabular-nums text-slate-100">
            {answered}/{total}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-300">
            answered
          </span>
        </span>
        {violations > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200 ring-1 ring-inset ring-red-400/30"
            title="Proctor flags recorded for your teacher"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {violations}
          </span>
        )}
      </div>

      {/* Separate polite region: announces only the discrete milestones set
          above, decoupled from the visible (aria-live="off") timer span. */}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <div
        role="progressbar"
        aria-valuenow={position}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuetext={`Question ${position} of ${total}`}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15"
      >
        <div
          className="h-full rounded-full bg-accent-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </header>
  );
}
