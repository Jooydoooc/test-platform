"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clock,
  Lock,
  Maximize,
  ShieldCheck,
} from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { startAttempt } from "@/lib/data/attempts";
import { submitAttempt } from "@/lib/data/submit";
import {
  useProctor,
  FullscreenGuard,
  ProctorWarning,
  fullscreenSupported,
  type Integrity,
} from "@/components/Proctor";
import type { Json, QuestionFormat } from "@/lib/database.types";

export interface TakerQuestion {
  id: string;
  format: QuestionFormat;
  prompt: string;
  content: Json;
}

type Choice = { id: string; text: string };

// Pull renderable choices from a question's content. Single/multi choice ship
// {choices:[{id,text}]}; true/false falls back to a fixed pair.
function choicesOf(q: TakerQuestion): Choice[] {
  const c = q.content as { choices?: unknown } | null;
  if (c && Array.isArray(c.choices)) {
    return c.choices.filter(
      (x): x is Choice =>
        !!x && typeof x === "object" && "id" in x && "text" in x,
    );
  }
  if (q.format === "TRUE_FALSE") {
    return [
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ];
  }
  return [];
}

const CHOICE_FORMATS: QuestionFormat[] = [
  "MULTIPLE_CHOICE_SINGLE",
  "MULTIPLE_CHOICE_MULTI",
  "TRUE_FALSE",
];

type Phase = "loading" | "blocked" | "done" | "taking" | "submitting" | "finished";

export function TestTaker({
  testId,
  token,
  title,
  description,
  timeLimitSec,
  questions,
}: {
  testId: string;
  /** Share token from the URL — the key that unlocks the attempt (0025). */
  token: string;
  title: string;
  description: string;
  timeLimitSec: number | null;
  questions: TakerQuestion[];
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | undefined>();
  const [expAwarded, setExpAwarded] = useState(0);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Secure-mode gate: the exam only reveals its questions after the student
  // clicks "Begin" (which enters fullscreen — fullscreen needs a user gesture).
  const [secureStarted, setSecureStarted] = useState(false);
  // Final graded score, once submitted. pendingReview means written answers
  // still need the teacher, so no definitive percentage is shown yet.
  const [score, setScore] = useState<{ earned: number; total: number } | null>(
    null,
  );
  const [pendingReview, setPendingReview] = useState(false);
  // Why the attempt was submitted, so the result screen can explain an
  // automatic submit instead of showing a bare "Test submitted".
  const [submitCause, setSubmitCause] = useState<"manual" | "timeout" | "left">(
    "manual",
  );

  // Forward-only: index only ever increases; past questions are locked.
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const submittingRef = useRef(false);
  // The proctor is engaged after finishSubmit is defined; finishSubmit reads the
  // tally through this ref to avoid a definition cycle with useProctor.
  const getIntegrityRef = useRef<() => Integrity>(() => ({
    violations: 0,
    flags: {},
  }));

  const finishSubmit = useCallback(async (
    cause: "manual" | "timeout" | "left" = "manual",
  ) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitCause(cause);
    setPhase("submitting");
    const res = await submitAttempt(
      testId,
      responses,
      getIntegrityRef.current(),
    );
    if (!res.ok) {
      setError(res.error ?? "Could not submit.");
      setPhase("taking");
      submittingRef.current = false;
      return;
    }
    setResultId(res.resultId);
    setExpAwarded(res.expAwarded ?? 0);
    setNewBadges(res.newBadges ?? []);
    setPendingReview(res.pendingReview ?? false);
    setScore(
      res.scoreTotal != null && res.scoreEarned != null
        ? { earned: res.scoreEarned, total: res.scoreTotal }
        : null,
    );
    setPhase("finished");
  }, [testId, responses]);

  // Proctor (strict lockdown). Enabled while the exam is live; auto-submits when
  // the student switches tabs/windows. getIntegrity feeds the submit payload.
  const proctor = useProctor({
    enabled: phase === "taking" || phase === "submitting",
    onAutoSubmit: () => finishSubmit("left"),
  });
  getIntegrityRef.current = proctor.getIntegrity;

  // Release the lockdown (and exit fullscreen) once the exam is over.
  useEffect(() => {
    if (phase === "finished" || phase === "done" || phase === "blocked") {
      proctor.disengage();
    }
  }, [phase, proctor]);

  // Start (or resume) the single attempt, server-side.
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await startAttempt(token);
      if (!active) return;
      if (!res.ok) {
        setError(res.error ?? "Could not start.");
        setPhase("blocked");
        return;
      }
      if (res.alreadyCompleted) {
        setResultId(res.resultId);
        setPhase("done");
        return;
      }
      if (questions.length === 0) {
        setPhase("taking"); // empty-state handled in render
        return;
      }
      // Server-anchored countdown: deadline = server start + limit.
      if (res.timeLimitSec && res.startedAt) {
        const end = new Date(res.startedAt).getTime() + res.timeLimitSec * 1000;
        setDeadline(end);
      }
      setPhase("taking");
    })();
    return () => {
      active = false;
    };
  }, [token, questions.length]);

  // Timer tick + auto-submit on expiry. Only counts down once the student has
  // begun (secureStarted), matching when questions become visible.
  useEffect(() => {
    if (phase !== "taking" || deadline == null || !secureStarted) return;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) finishSubmit("timeout");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, deadline, secureStarted, finishSubmit]);

  const beginSecure = useCallback(() => {
    setSecureStarted(true);
    void proctor.engage();
  }, [proctor]);

  // -------------------------------------------------------------------------
  // Terminal / gate screens
  // -------------------------------------------------------------------------
  if (phase === "loading") {
    return <p className="py-16 text-center text-slate-500">Loading test…</p>;
  }

  if (phase === "blocked") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-bold text-slate-900">Can’t open this test</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
      </Card>
    );
  }

  if (phase === "done") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-bold text-slate-900">Already completed</h1>
        <p className="mt-2 text-sm text-slate-600">
          You’ve already taken this test. Each test can be taken once.
        </p>
        {resultId && (
          <Link
            href={`/results?r=${resultId}`}
            className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            View your result
          </Link>
        )}
      </Card>
    );
  }

  if (phase === "finished") {
    const pct =
      score && score.total > 0
        ? Math.round((score.earned / score.total) * 100)
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
        <h1 className="text-lg font-bold text-slate-900">Test submitted</h1>

        {submitCause !== "manual" && (
          <p className="mx-auto mt-2 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
            {submitCause === "timeout"
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
              {score!.earned} of {score!.total} points
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
          <p className="mt-1 text-sm font-medium text-amber-700">
            New badge{newBadges.length > 1 ? "s" : ""}: {newBadges.join(", ")}
          </p>
        )}
        <Link
          href={resultId ? `/results?r=${resultId}` : "/tests"}
          className="mt-5 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          {resultId ? "View full result" : "Back to Tests"}
        </Link>
      </Card>
    );
  }

  if (questions.length === 0) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          This test has no questions yet.
        </p>
      </Card>
    );
  }

  // Secure-start screen: premium pre-exam briefing + the gesture that enters
  // fullscreen and engages the proctor.
  if (!secureStarted) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card-hover">
          <div className="relative bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-7 text-white">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-500/30 blur-3xl" />
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              Proctored exam
            </span>
            <h1 className="relative mt-4 text-2xl font-extrabold tracking-tight">
              {title}
            </h1>
            {description && (
              <p className="relative mt-1.5 text-sm text-brand-100/90">
                {description}
              </p>
            )}
          </div>
          <div className="space-y-4 p-7">
            <p className="text-sm text-slate-600">
              This is a secure, single-attempt test. Before you begin, please
              read how it’s monitored:
            </p>
            <ul className="space-y-2.5 text-sm text-slate-700">
              {fullscreenSupported() && (
                <RuleItem icon={Maximize}>
                  It runs in <b>fullscreen</b>. Leaving fullscreen is recorded.
                </RuleItem>
              )}
              <RuleItem icon={AlertTriangle}>
                <b>Stay on this tab.</b> Switching tabs or apps is recorded —
                leaving twice submits your test automatically.
              </RuleItem>
              <RuleItem icon={Lock}>
                Copy, paste and right-click are disabled. Answers lock as you
                advance.
              </RuleItem>
              {timeLimitSec ? (
                <RuleItem icon={Clock}>
                  Time limit:{" "}
                  <b>
                    {Math.floor(timeLimitSec / 60)} minute
                    {timeLimitSec >= 120 ? "s" : ""}
                  </b>
                  . The timer runs on the server.
                </RuleItem>
              ) : null}
            </ul>
            <Button autoFocus onClick={beginSecure} className="w-full justify-center">
              <ShieldCheck className="h-4 w-4" />
              Begin secure test
            </Button>
            <p className="text-center text-xs text-slate-500">
              {questions.length} question{questions.length === 1 ? "" : "s"} ·
              one attempt
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Live exam
  // -------------------------------------------------------------------------
  const q = questions[index];
  const isLast = index === questions.length - 1;
  const answered = responses[q.id] !== undefined;
  const submitting = phase === "submitting";
  const lowTime = remaining != null && remaining <= 30;

  const setChoiceSingle = (choiceId: string) =>
    setResponses((r) => ({ ...r, [q.id]: { selected: [choiceId] } }));

  const toggleChoiceMulti = (choiceId: string) =>
    setResponses((r) => {
      const cur =
        (r[q.id] as { selected?: string[] } | undefined)?.selected ?? [];
      const next = cur.includes(choiceId)
        ? cur.filter((c) => c !== choiceId)
        : [...cur, choiceId];
      return { ...r, [q.id]: { selected: next } };
    });

  const setText = (text: string) =>
    setResponses((r) => ({ ...r, [q.id]: { text } }));

  const isChoice = CHOICE_FORMATS.includes(q.format);
  const isMulti = q.format === "MULTIPLE_CHOICE_MULTI";
  const selected =
    (responses[q.id] as { selected?: string[] } | undefined)?.selected ?? [];
  const textValue =
    (responses[q.id] as { text?: string } | undefined)?.text ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {proctor.needsFullscreen && (
        <FullscreenGuard onReenter={proctor.reenterFullscreen} />
      )}
      {proctor.tabWarning && !proctor.needsFullscreen && (
        <ProctorWarning onDismiss={proctor.dismissTabWarning} />
      )}

      {/* Premium exam header */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-5 text-white shadow-card">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-100 ring-1 ring-inset ring-white/20">
              <ShieldCheck className="h-3 w-3" />
              Secure mode
            </span>
            <h1 className="mt-2 truncate text-lg font-bold tracking-tight">
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {proctor.violations > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-2.5 py-1.5 text-sm font-semibold text-red-200 ring-1 ring-inset ring-red-400/30"
                title="Proctor flags recorded for your teacher"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {proctor.violations}
              </span>
            )}
            {remaining != null && (
              <span
                role="timer"
                aria-live={lowTime ? "assertive" : "off"}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums ${
                  lowTime
                    ? "bg-red-500/25 text-red-100 ring-1 ring-inset ring-red-400/40"
                    : "bg-white/10 text-white ring-1 ring-inset ring-white/20"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span className="sr-only">Time remaining: </span>
                {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, "0")}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-1.5">
        <ProgressBar value={((index + 1) / questions.length) * 100} />
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Lock className="size-3.5 text-slate-400" aria-hidden />
          Question {index + 1} of {questions.length} · answers lock when you
          move on
        </p>
      </div>

      <Card className="space-y-4 select-none">
        <p className="font-medium text-slate-900">{q.prompt}</p>

        {isChoice ? (
          <ChoiceList
            choices={choicesOf(q)}
            selected={selected}
            multi={isMulti}
            groupLabel={q.prompt}
            onSelectSingle={setChoiceSingle}
            onToggleMulti={toggleChoiceMulti}
          />
        ) : (
          <textarea
            value={textValue}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Type your answer…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        )}
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col items-end gap-1.5">
        {isLast ? (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!answered || submitting}
          >
            {submitting ? "Submitting…" : "Submit test"}
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)} disabled={!answered}>
            Next question
          </Button>
        )}
        {answered && (
          <p className="text-xs text-slate-500">
            {isLast
              ? "You can’t change answers after submitting."
              : "This locks your answer — you can’t come back."}
          </p>
        )}
      </div>

      {confirmOpen && (
        <ConfirmSubmit
          answered={Object.keys(responses).length}
          total={questions.length}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            finishSubmit();
          }}
        />
      )}
    </div>
  );
}

// Accessible answer options. Single-choice / true-false render as an ARIA
// radiogroup with roving tabindex + arrow-key selection; multi renders as a
// group of checkboxes (each tab-focusable, Space/Enter toggles). Visuals are
// identical to the prior button list — this only adds screen-reader semantics
// and keyboard navigation.
function ChoiceList({
  choices,
  selected,
  multi,
  groupLabel,
  onSelectSingle,
  onToggleMulti,
}: {
  choices: Choice[];
  selected: string[];
  multi: boolean;
  groupLabel: string;
  onSelectSingle: (id: string) => void;
  onToggleMulti: (id: string) => void;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  btnRefs.current = [];

  // For a radiogroup, exactly one option is tab-focusable: the selected one, or
  // the first when nothing is picked yet.
  const activeIdx = (() => {
    const i = choices.findIndex((c) => selected.includes(c.id));
    return i === -1 ? 0 : i;
  })();

  const moveAndSelect = (from: number, dir: 1 | -1) => {
    const n = choices.length;
    if (n === 0) return;
    const to = ((from + dir) % n + n) % n;
    btnRefs.current[to]?.focus();
    onSelectSingle(choices[to].id);
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (multi) return; // checkbox group: native tab + Space/Enter is correct
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      moveAndSelect(i, 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      moveAndSelect(i, -1);
    }
  };

  return (
    <div
      role={multi ? "group" : "radiogroup"}
      aria-label={groupLabel}
      className="space-y-2"
    >
      {choices.map((c, i) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            tabIndex={multi ? 0 : i === activeIdx ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => (multi ? onToggleMulti(c.id) : onSelectSingle(c.id))}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
              on
                ? "border-brand-500 bg-brand-50 text-slate-900 ring-1 ring-brand-500"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                on
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-slate-300"
              }`}
            >
              {on && <Check className="size-3" strokeWidth={3} />}
            </span>
            {c.text}
          </button>
        );
      })}
    </div>
  );
}

function RuleItem({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
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

function ConfirmSubmit({
  answered,
  total,
  onCancel,
  onConfirm,
}: {
  answered: number;
  total: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    document.getElementById("taker-confirm-submit")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const unanswered = total - answered;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="taker-confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="taker-confirm-title"
          className="text-lg font-bold text-slate-900"
        >
          Submit test?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          You answered{" "}
          <span className="font-mono tabular-nums">{answered}</span> of{" "}
          <span className="font-mono tabular-nums">{total}</span>. This can’t be
          undone — each test is taken once.
        </p>
        {unanswered > 0 && (
          <p className="mt-1 text-sm text-amber-700">
            {unanswered} unanswered question{unanswered > 1 ? "s" : ""} will
            score zero.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Keep working
          </Button>
          <Button id="taker-confirm-submit" onClick={onConfirm}>
            Submit test
          </Button>
        </div>
      </div>
    </div>
  );
}
