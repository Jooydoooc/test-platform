"use client";

import type { ReactNode, ComponentType } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Lock,
  Maximize,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui";
import { fullscreenSupported } from "@/components/Proctor";

export function BriefingRule({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

// Merges the DB-rail and local-rail pre-exam briefing screens. Rendered
// before the student clicks Begin — the gesture that actually enters
// fullscreen and starts the real clock, which stays owned by the caller.
export function SecureBriefing({
  title,
  subtitle,
  questionCount,
  timeLimitSec,
  rules,
  notice,
  error,
  busy = false,
  onBegin,
}: {
  title: string;
  subtitle?: string;
  questionCount: number;
  timeLimitSec?: number | null;
  rules?: ReactNode;
  notice?: ReactNode;
  error?: string | null;
  busy?: boolean;
  onBegin: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card-hover">
        <div className="bg-brand-600 p-7 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100 ring-1 ring-inset ring-white/15">
            <ShieldCheck className="h-3.5 w-3.5" />
            Proctored exam
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-200">{subtitle}</p>}
        </div>
        <div className="space-y-4 p-7">
          {notice}
          <p className="text-sm text-slate-600">
            This is a secure, single-attempt test. Before you begin, please
            read how it’s monitored:
          </p>
          <ul className="space-y-2.5 text-sm text-slate-700">
            {fullscreenSupported() && (
              <BriefingRule icon={Maximize}>
                It runs in <b>fullscreen</b>. Leaving fullscreen is recorded.
              </BriefingRule>
            )}
            <BriefingRule icon={AlertTriangle}>
              <b>Stay on this tab.</b> Switching tabs or apps is recorded —
              leaving twice submits your test automatically.
            </BriefingRule>
            <BriefingRule icon={ArrowRight}>
              <b>Answers lock once you move to the next question.</b> There's
              no going back to change or review an earlier answer, and any
              question you leave blank stays blank.
            </BriefingRule>
            <BriefingRule icon={Lock}>
              Copy, paste and right-click are disabled.
            </BriefingRule>
            {timeLimitSec ? (
              <BriefingRule icon={Clock}>
                Total time limit:{" "}
                <b>
                  {Math.floor(timeLimitSec / 60)} minute
                  {timeLimitSec >= 120 ? "s" : ""}
                </b>
                .
              </BriefingRule>
            ) : null}
            {rules}
          </ul>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            autoFocus
            onClick={onBegin}
            disabled={busy}
            className="w-full justify-center"
          >
            <ShieldCheck className="h-4 w-4" />
            {busy ? "Starting…" : "Begin secure test"}
          </Button>
          <p className="text-center text-xs text-slate-500">
            {questionCount} question{questionCount === 1 ? "" : "s"} · one
            attempt
          </p>
        </div>
      </div>
    </div>
  );
}
