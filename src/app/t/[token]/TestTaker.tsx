"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { startAttempt } from "@/lib/data/attempts";
import { submitAttempt } from "@/lib/data/submit";
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
  title,
  description,
  timeLimitSec,
  questions,
}: {
  testId: string;
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
  // Final graded score, once submitted. pendingReview means written answers
  // still need the teacher, so no definitive percentage is shown yet.
  const [score, setScore] = useState<{ earned: number; total: number } | null>(
    null,
  );
  const [pendingReview, setPendingReview] = useState(false);

  // Forward-only: index only ever increases; past questions are locked.
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const submittingRef = useRef(false);

  const finishSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase("submitting");
    const res = await submitAttempt(testId, responses);
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

  // Start (or resume) the single attempt, server-side.
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await startAttempt(testId);
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
  }, [testId, questions.length]);

  // Timer tick + auto-submit on expiry.
  useEffect(() => {
    if (phase !== "taking" || deadline == null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) finishSubmit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, deadline, finishSubmit]);

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

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const answered = responses[q.id] !== undefined;
  const submitting = phase === "submitting";

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {description && (
            <p className="text-sm text-slate-600">{description}</p>
          )}
        </div>
        {remaining != null && (
          <span
            role="timer"
            aria-live={remaining <= 30 ? "assertive" : "off"}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums ${
              remaining <= 30
                ? "bg-red-50 text-red-600"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            <span className="sr-only">Time remaining: </span>
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
            {remaining <= 30 && <span className="sr-only"> — hurry</span>}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <ProgressBar value={((index + 1) / questions.length) * 100} />
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Lock className="size-3.5 text-slate-400" aria-hidden />
          Question {index + 1} of {questions.length} · answers lock when you
          move on
        </p>
      </div>

      <Card className="space-y-4">
        <p className="font-medium text-slate-900">{q.prompt}</p>

        {isChoice ? (
          <div className="space-y-2">
            {choicesOf(q).map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    isMulti ? toggleChoiceMulti(c.id) : setChoiceSingle(c.id)
                  }
                  aria-pressed={on}
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
