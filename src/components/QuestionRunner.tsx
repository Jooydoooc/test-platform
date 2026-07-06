"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import type { Question, Test } from "@/lib/types";
import { gradeQuestion } from "@/lib/store";
import {
  OPTION_LETTERS,
  answeredCount,
  instructionFor,
  isAnswered,
  isMultiAnswer,
  optionsFor,
  selectionEcho,
} from "@/lib/mcq";

/** Metadata returned to the parent when a test is submitted. */
export interface SubmitMeta {
  timeTakenSec?: number;
  timedOut: boolean;
}

type Answers = Record<string, string[]>;

/** Seconds -> "M:SS" (or "H:MM:SS" past an hour). */
function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function QuestionRunner({
  test,
  mode,
  subtitle,
  timeLimitMin,
  onSubmit,
}: {
  test: Test;
  mode: "practice" | "test";
  /** Book / unit name shown in the top bar, if known. */
  subtitle?: string;
  /** Whole-test time limit (test mode only). Omitted = untimed. */
  timeLimitMin?: number;
  /** Called once when a test is submitted (test mode only). */
  onSubmit?: (answers: Answers, meta: SubmitMeta) => void;
}) {
  const total = test.questions.length;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  // Practice only: which questions have been checked (shows feedback + locks input).
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [practiceDone, setPracticeDone] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  const isTest = mode === "test";
  const q = test.questions[index]!;
  const answer = answers[q.id] ?? [];
  const checked = !!checkedMap[q.id];
  const answered = isAnswered(answer);
  const nAnswered = answeredCount(test, answers);

  // Practice-only running tally of correct checks (derived, not stored).
  const nCorrect = useMemo(
    () =>
      test.questions.filter(
        (qq) =>
          checkedMap[qq.id] &&
          gradeQuestion(qq, answers[qq.id] ?? []) === qq.points,
      ).length,
    [test, checkedMap, answers],
  );

  // Keep the newest submit closure reachable from the timer without re-arming it.
  const submitRef = useRef<(timedOut?: boolean) => void>(() => {});

  function submitTest(timedOut = false) {
    if (!isTest || submittedRef.current) return;
    submittedRef.current = true;
    const meta: SubmitMeta = {
      timedOut,
      timeTakenSec:
        timeLimitMin && timeLimitMin > 0
          ? Math.round((Date.now() - startedAtRef.current) / 1000)
          : undefined,
    };
    onSubmit?.(answers, meta);
  }
  submitRef.current = submitTest;

  // Countdown for timed tests.
  useEffect(() => {
    if (!isTest || !timeLimitMin || timeLimitMin <= 0) return;
    const deadline = startedAtRef.current + timeLimitMin * 60_000;
    const tick = () => {
      const rem = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemainingSec(rem);
      if (rem <= 0) submitRef.current(true);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [isTest, timeLimitMin]);

  function setAnswer(value: string[]) {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
  }

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(total - 1, next)));
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function checkAnswer() {
    if (!answered) return;
    setCheckedMap((prev) => ({ ...prev, [q.id]: true }));
  }

  function retry() {
    setAnswers((prev) => ({ ...prev, [q.id]: [] }));
    setCheckedMap((prev) => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
  }

  const verdict: "correct" | "incorrect" | null = checked
    ? gradeQuestion(q, answer) === q.points
      ? "correct"
      : "incorrect"
    : null;

  function restart() {
    setIndex(0);
    setAnswers({});
    setCheckedMap({});
    setPracticeDone(false);
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (practiceDone) {
    return <PracticeSummary test={test} answers={answers} onRestart={restart} />;
  }

  const atLast = index + 1 >= total;
  const timeLow = remainingSec !== null && remainingSec <= 60;
  const progress = ((index + 1) / total) * 100;

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-[#0F172A]">
      {/* ---- Top bar ---- */}
      <div className="sticky top-2 z-10 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold sm:text-lg">
              {test.title}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <div className="text-right">
              <div className="font-mono text-sm font-semibold tabular-nums sm:text-base">
                {index + 1}
                <span className="text-slate-400"> / {total}</span>
              </div>
              <div className="text-xs text-slate-500">
                {mode === "practice" ? (
                  <>
                    <span className="font-mono tabular-nums text-success">
                      {nCorrect}
                    </span>{" "}
                    correct
                  </>
                ) : (
                  <>
                    <span className="font-mono tabular-nums">{nAnswered}</span>{" "}
                    answered
                  </>
                )}
              </div>
            </div>
            {remainingSec !== null && (
              <div
                className="flex flex-col items-end border-l border-slate-200 pl-3 sm:pl-4"
                role="timer"
                aria-live={timeLow ? "assertive" : "off"}
              >
                <span
                  className={`flex items-center gap-1 font-mono text-base font-semibold tabular-nums sm:text-lg ${
                    timeLow ? "text-error" : "text-[#0F172A]"
                  }`}
                >
                  <Clock className="size-4" />
                  {formatTime(remainingSec)}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  time left
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Progress meter */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ---- Question card ---- */}
      <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-card sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 items-center rounded-full bg-brand-50 px-2.5 font-mono text-xs font-bold tabular-nums text-brand-700">
            Q{index + 1}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {instructionFor(q)}
          </span>
        </div>

        {q.type !== "gap" && (
          <p className="mt-4 font-display text-lg font-semibold leading-snug sm:text-2xl">
            {q.prompt}
          </p>
        )}

        <div className="mt-6">
          <Options
            question={q}
            answer={answer}
            disabled={checked}
            reveal={verdict !== null}
            onChange={setAnswer}
          />
        </div>

        {/* Single-answer selection echo, e.g. "You selected A." */}
        {!checked &&
          !isMultiAnswer(q) &&
          q.type !== "short" &&
          q.type !== "gap" && (
            <p className="mt-3 min-h-[1.25rem] text-sm text-slate-500">
              {selectionEcho(q, answer) ?? " "}
            </p>
          )}

        {/* Practice feedback */}
        {verdict && <Feedback verdict={verdict} question={q} />}
      </div>

      {/* ---- Question navigator ---- */}
      <Navigator test={test} answers={answers} current={index} onJump={goTo} />

      {/* ---- Bottom navigation ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SecondaryButton onClick={() => goTo(index - 1)} disabled={index === 0}>
          <ArrowLeft className="size-4" />
          Previous
        </SecondaryButton>

        <div className="flex items-center gap-3">
          {mode === "practice" ? (
            checked ? (
              <>
                <SecondaryButton onClick={retry}>
                  <RotateCcw className="size-4" />
                  Try again
                </SecondaryButton>
                <PrimaryButton
                  onClick={() =>
                    atLast ? setPracticeDone(true) : goTo(index + 1)
                  }
                >
                  {atLast ? "Finish" : "Next question"}
                  {!atLast && <ArrowRight className="size-4" />}
                </PrimaryButton>
              </>
            ) : (
              <PrimaryButton onClick={checkAnswer} disabled={!answered}>
                <Check className="size-4" />
                Check answer
              </PrimaryButton>
            )
          ) : (
            <>
              {!atLast && (
                <SecondaryButton onClick={() => goTo(index + 1)}>
                  Next
                  <ArrowRight className="size-4" />
                </SecondaryButton>
              )}
              <PrimaryButton onClick={() => setConfirmOpen(true)}>
                <Send className="size-4" />
                Submit test
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      {/* ---- Submit confirmation ---- */}
      {confirmOpen && (
        <ConfirmSubmit
          answered={nAnswered}
          total={total}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            submitTest(false);
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Options
// ----------------------------------------------------------------------------

function Options({
  question,
  answer,
  disabled,
  reveal,
  onChange,
}: {
  question: Question;
  answer: string[];
  disabled: boolean;
  reveal: boolean;
  onChange: (v: string[]) => void;
}) {
  const q = question;

  if (q.type === "gap") {
    return (
      <GapSentence
        question={q}
        answer={answer}
        disabled={disabled}
        reveal={reveal}
        onChange={onChange}
      />
    );
  }

  if (q.type === "short") {
    return (
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-[#0F172A] outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 sm:text-sm"
        value={answer[0] ?? ""}
        disabled={disabled}
        onChange={(e) => onChange([e.target.value])}
        placeholder="Type your answer…"
      />
    );
  }

  const multi = isMultiAnswer(q);
  const opts = optionsFor(q);

  return (
    <div className="space-y-3" role={multi ? "group" : "radiogroup"}>
      {opts.map((c, i) => {
        const selected = answer.includes(c.id);
        const isCorrect = q.correct.includes(c.id);
        // After checking: mark correct options green; mark a wrongly-picked one red.
        let state: "idle" | "selected" | "correct" | "wrong" = selected
          ? "selected"
          : "idle";
        if (reveal) {
          if (isCorrect) state = "correct";
          else if (selected) state = "wrong";
          else state = "idle";
        }
        return (
          <OptionCard
            key={c.id}
            letter={OPTION_LETTERS[i]!}
            text={c.text}
            name={q.id}
            multi={multi}
            selected={selected}
            disabled={disabled}
            state={state}
            onToggle={() => {
              if (multi) {
                onChange(
                  selected
                    ? answer.filter((id) => id !== c.id)
                    : [...answer, c.id],
                );
              } else {
                onChange([c.id]);
              }
            }}
          />
        );
      })}
    </div>
  );
}

const OPTION_STYLES: Record<
  "idle" | "selected" | "correct" | "wrong",
  { card: string; chip: string }
> = {
  idle: {
    card: "border-slate-200 bg-white hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-card-hover",
    chip: "bg-slate-100 text-slate-500",
  },
  selected: {
    card: "border-accent-400 bg-accent-50 ring-1 ring-accent-400",
    chip: "bg-accent-500 text-white",
  },
  correct: {
    card: "border-success bg-emerald-50 ring-1 ring-success/30",
    chip: "bg-success text-white",
  },
  wrong: {
    card: "border-error bg-red-50 ring-1 ring-error/30",
    chip: "bg-error text-white",
  },
};

function OptionCard({
  letter,
  text,
  name,
  multi,
  selected,
  disabled,
  state,
  onToggle,
}: {
  letter: string;
  text: string;
  name: string;
  multi: boolean;
  selected: boolean;
  disabled: boolean;
  state: "idle" | "selected" | "correct" | "wrong";
  onToggle: () => void;
}) {
  const s = OPTION_STYLES[state];
  return (
    <label
      className={`flex items-center gap-3.5 rounded-2xl border p-3.5 transition duration-200 focus-within:ring-2 focus-within:ring-brand-500/40 motion-reduce:hover:translate-y-0 sm:p-4 ${
        disabled ? "cursor-default" : "cursor-pointer"
      } ${s.card}`}
    >
      <input
        type={multi ? "checkbox" : "radio"}
        name={name}
        className="sr-only"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
      />
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-semibold transition ${s.chip}`}
        aria-hidden
      >
        {letter}
      </span>
      <span className="flex-1 text-sm leading-snug text-[#0F172A] sm:text-base">
        {text}
      </span>
      {state === "correct" && (
        <Check className="size-5 shrink-0 text-success" aria-hidden />
      )}
      {state === "wrong" && (
        <X className="size-5 shrink-0 text-error" aria-hidden />
      )}
    </label>
  );
}

// ----------------------------------------------------------------------------
// Gap-fill: the sentence with an inline blank the student types into
// ----------------------------------------------------------------------------

function GapSentence({
  question,
  answer,
  disabled,
  reveal,
  onChange,
}: {
  question: Question;
  answer: string[];
  disabled: boolean;
  reveal: boolean;
  onChange: (v: string[]) => void;
}) {
  // The prompt marks the blank with two or more underscores. Split into the
  // text before the blank and the text after it (first blank only in v1).
  const match = question.prompt.match(/_{2,}/);
  const before = match ? question.prompt.slice(0, match.index) : question.prompt;
  const after = match
    ? question.prompt.slice(match.index! + match[0].length)
    : "";

  // On reveal, colour the input by whether the typed answer was accepted.
  const isCorrect = reveal && gradeQuestion(question, answer) === question.points;
  const borderColor = reveal
    ? isCorrect
      ? "border-success"
      : "border-error"
    : "border-accent-400";

  const input = (
    <input
      className={`mx-1 inline-block min-w-[7rem] max-w-full border-b-2 bg-transparent px-1 pb-0.5 text-center text-lg font-semibold text-[#0F172A] outline-none sm:text-xl ${borderColor}`}
      value={answer[0] ?? ""}
      disabled={disabled}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      aria-label="Fill in the blank"
      placeholder="…"
      onChange={(e) => onChange([e.target.value])}
    />
  );

  return (
    <p className="font-display text-lg leading-relaxed text-[#0F172A] sm:text-xl">
      {before}
      {match ? input : null}
      {after}
      {/* No blank marker in the prompt: offer the input on its own line. */}
      {!match && <span className="mt-3 block">{input}</span>}
    </p>
  );
}

// ----------------------------------------------------------------------------
// Practice feedback
// ----------------------------------------------------------------------------

function Feedback({
  verdict,
  question,
}: {
  verdict: "correct" | "incorrect";
  question: Question;
}) {
  const correct = verdict === "correct";
  const opts = optionsFor(question);
  const correctText =
    question.type === "short" || question.type === "gap"
      ? question.correct.join(", ")
      : question.correct
          .map((id) => opts.find((o) => o.id === id)?.text)
          .filter(Boolean)
          .join(", ");

  return (
    <div
      className={`mt-6 flex gap-3 rounded-2xl border p-4 ${
        correct ? "border-success/30 bg-emerald-50" : "border-error/30 bg-red-50"
      }`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          correct ? "bg-success text-white" : "bg-error text-white"
        }`}
        aria-hidden
      >
        {correct ? <Check className="size-5" /> : <X className="size-5" />}
      </span>
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold ${
            correct ? "text-success" : "text-error"
          }`}
        >
          {correct ? "Correct." : "Not quite."}
        </p>
        {!correct && (
          <p className="mt-1 text-sm text-[#0F172A]">
            Correct answer: {correctText || "—"}
          </p>
        )}
        {question.explanation && (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {question.explanation}
          </p>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Question navigator (jump between questions)
// ----------------------------------------------------------------------------

function Navigator({
  test,
  answers,
  current,
  onJump,
}: {
  test: Test;
  answers: Answers;
  current: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap gap-2">
        {test.questions.map((question, i) => {
          const isCurrent = i === current;
          const done = isAnswered(answers[question.id]);
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Go to question ${i + 1}${done ? ", answered" : ""}`}
              aria-current={isCurrent ? "true" : undefined}
              className={`flex size-9 items-center justify-center rounded-xl border font-mono text-sm tabular-nums transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                isCurrent
                  ? "border-brand-600 bg-brand-600 font-semibold text-white shadow-sm"
                  : done
                    ? "border-brand-200 bg-brand-50 font-semibold text-brand-700 hover:border-brand-300"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Submit confirmation modal
// ----------------------------------------------------------------------------

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
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
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
      aria-labelledby="confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-slate-200/70 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-title"
          className="font-display text-lg font-semibold text-[#0F172A]"
        >
          Submit test?
        </h2>
        <p className="mt-2 text-sm text-[#0F172A]">
          You answered{" "}
          <span className="font-mono tabular-nums">{answered}</span> of{" "}
          <span className="font-mono tabular-nums">{total}</span> questions.
        </p>
        {unanswered > 0 && (
          <p className="mt-1 text-sm text-slate-500">
            Unanswered questions can lower your score.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton ref={confirmRef} onClick={onConfirm}>
            Submit test
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Practice summary
// ----------------------------------------------------------------------------

function PracticeSummary({
  test,
  answers,
  onRestart,
}: {
  test: Test;
  answers: Answers;
  onRestart: () => void;
}) {
  const attempted = test.questions.filter((q) => isAnswered(answers[q.id]));
  const correctCount = attempted.filter(
    (q) => gradeQuestion(q, answers[q.id]) === q.points,
  ).length;
  const pct =
    attempted.length > 0
      ? Math.round((correctCount / attempted.length) * 100)
      : 0;
  const tone =
    pct >= 80 ? "text-success" : pct >= 50 ? "text-brand-600" : "text-error";

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-[#0F172A]">
      <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-card">
        <div className="flex flex-col items-center bg-brand-600 px-6 py-8 text-center text-white">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10">
            <CheckCircle2 className="size-8 text-accent-400" />
          </span>
          <p className="mt-3 text-sm text-brand-100">
            Practice complete · {test.title}
          </p>
          <p className="mt-2 font-mono text-4xl font-bold tabular-nums">
            {correctCount} / {attempted.length}
          </p>
        </div>
        <div className="px-6 py-5 text-center">
          <p className={`font-mono text-2xl font-bold tabular-nums ${tone}`}>
            {pct}% correct
          </p>
          <p className="mt-1.5 text-sm text-slate-500">
            Practice runs are not saved or graded.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <PrimaryButton onClick={onRestart}>
          <RotateCcw className="size-4" />
          Practise again
        </PrimaryButton>
        <Link
          href="/practice"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:min-h-0 sm:py-2.5"
        >
          Back to practice
        </Link>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Buttons (Lexora tokens: navy primary, bordered secondary — gold stays an accent)
// ----------------------------------------------------------------------------

const buttonBase =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 disabled:opacity-45 disabled:pointer-events-none disabled:active:scale-100 sm:min-h-0 sm:py-2.5";

function PrimaryButton({
  ref,
  className = "",
  ...props
}: React.ComponentProps<"button"> & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      className={`${buttonBase} bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-card-hover ${className}`}
      {...props}
    />
  );
}

function SecondaryButton({
  className = "",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 ${className}`}
      {...props}
    />
  );
}
