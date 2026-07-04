"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Question, Test } from "@/lib/types";
import { gradeQuestion } from "@/lib/store";
import {
  OPTION_LETTERS,
  TOKENS,
  answeredCount,
  instructionFor,
  isAnswered,
  isMultiAnswer,
  optionsFor,
  selectionEcho,
} from "@/lib/mcq";
import { sora, plexMono } from "@/lib/fonts";

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
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
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

  if (practiceDone) {
    return <PracticeSummary test={test} answers={answers} onRestart={restart} />;
  }

  function restart() {
    setIndex(0);
    setAnswers({});
    setCheckedMap({});
    setPracticeDone(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const atLast = index + 1 >= total;
  const timeLow = remainingSec !== null && remainingSec <= 60;

  return (
    <div className="space-y-5" style={{ color: TOKENS.text }}>
      {/* ---- Top bar ---- */}
      <div
        className="sticky top-0 z-10 -mx-4 border-b px-4 py-3 backdrop-blur sm:rounded-xl sm:border sm:px-5"
        style={{
          background: `${TOKENS.bg}f2`,
          borderColor: TOKENS.border,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className={`${sora.className} truncate text-base font-semibold sm:text-lg`}
            >
              {test.title}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-[#6b7280] sm:text-sm">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-5">
            <div className="text-right">
              <div
                className={`${plexMono.className} text-sm font-semibold tabular-nums sm:text-base`}
              >
                Question {index + 1} of {total}
              </div>
              <div className="text-xs text-[#6b7280]">
                <span className={`${plexMono.className} tabular-nums`}>{nAnswered}</span>{" "}
                answered
              </div>
            </div>
            {remainingSec !== null && (
              <div
                className="flex flex-col items-end border-l pl-3 sm:pl-5"
                style={{ borderColor: TOKENS.border }}
                role="timer"
                aria-live={timeLow ? "assertive" : "off"}
              >
                <span
                  className={`${plexMono.className} text-base font-semibold tabular-nums sm:text-lg`}
                  style={{ color: timeLow ? TOKENS.error : TOKENS.text }}
                >
                  {formatTime(remainingSec)}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                  time left
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Progress meter */}
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: TOKENS.border }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${((index + 1) / total) * 100}%`,
              background: TOKENS.info,
            }}
          />
        </div>
      </div>

      {/* ---- Question card ---- */}
      <div
        className="rounded-xl border bg-white p-5 sm:p-7"
        style={{ borderColor: TOKENS.border }}
      >
        <div className="flex items-baseline gap-3">
          <span
            className={`${plexMono.className} text-sm font-semibold tabular-nums`}
            style={{ color: TOKENS.accent }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">
            {instructionFor(q)}
          </span>
        </div>

        <p className={`${sora.className} mt-3 text-lg font-semibold leading-snug sm:text-xl`}>
          {q.prompt}
        </p>

        <div className="mt-5">
          <Options
            question={q}
            answer={answer}
            disabled={checked}
            reveal={verdict !== null}
            onChange={setAnswer}
          />
        </div>

        {/* Single-answer selection echo, e.g. "You selected A." */}
        {!checked && !isMultiAnswer(q) && q.type !== "short" && (
          <p className="mt-3 min-h-[1.25rem] text-sm text-[#6b7280]">
            {selectionEcho(q, answer) ?? " "}
          </p>
        )}

        {/* Practice feedback */}
        {verdict && (
          <Feedback verdict={verdict} question={q} />
        )}
      </div>

      {/* ---- Question navigator ---- */}
      <Navigator
        test={test}
        answers={answers}
        current={index}
        onJump={goTo}
      />

      {/* ---- Bottom navigation ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SecondaryButton onClick={() => goTo(index - 1)} disabled={index === 0}>
          Previous
        </SecondaryButton>

        <div className="flex items-center gap-3">
          {mode === "practice" ? (
            checked ? (
              <>
                <SecondaryButton onClick={retry}>Try again</SecondaryButton>
                <PrimaryButton
                  onClick={() => (atLast ? setPracticeDone(true) : goTo(index + 1))}
                >
                  {atLast ? "Finish" : "Next question"}
                </PrimaryButton>
              </>
            ) : (
              <PrimaryButton onClick={checkAnswer} disabled={!answered}>
                Check answer
              </PrimaryButton>
            )
          ) : (
            <>
              {!atLast && (
                <SecondaryButton onClick={() => goTo(index + 1)}>
                  Next
                </SecondaryButton>
              )}
              <PrimaryButton onClick={() => setConfirmOpen(true)}>
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

  if (q.type === "short") {
    return (
      <input
        className="w-full rounded-lg border bg-white px-3 py-2.5 text-base outline-none transition-colors placeholder:text-[#9ca3af] focus:ring-2 sm:text-sm"
        style={{ borderColor: TOKENS.border, color: TOKENS.text }}
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
    <div className="space-y-2.5" role={multi ? "group" : "radiogroup"}>
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
  const styles: Record<typeof state, { border: string; bg: string; chipBg: string; chipText: string }> = {
    idle: { border: TOKENS.border, bg: "#fff", chipBg: TOKENS.bg, chipText: "#6b7280" },
    selected: { border: TOKENS.accent, bg: "#FBF3E2", chipBg: TOKENS.accent, chipText: "#fff" },
    correct: { border: TOKENS.success, bg: "#EEF6F0", chipBg: TOKENS.success, chipText: "#fff" },
    wrong: { border: TOKENS.error, bg: "#F8ECEA", chipBg: TOKENS.error, chipText: "#fff" },
  };
  const s = styles[state];

  return (
    <label
      className={`flex items-center gap-3 rounded-lg border p-3.5 transition-colors focus-within:ring-2 sm:p-4 ${
        disabled ? "cursor-default" : "cursor-pointer"
      }`}
      style={{ borderColor: s.border, background: s.bg }}
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
        className={`${plexMono.className} flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold`}
        style={{ background: s.chipBg, color: s.chipText }}
        aria-hidden
      >
        {letter}
      </span>
      <span className="text-sm leading-snug sm:text-base" style={{ color: TOKENS.text }}>
        {text}
      </span>
    </label>
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
  const color = correct ? TOKENS.success : TOKENS.error;
  const opts = optionsFor(question);
  const correctText =
    question.type === "short"
      ? question.correct.join(", ")
      : question.correct
          .map((id) => opts.find((o) => o.id === id)?.text)
          .filter(Boolean)
          .join(", ");

  return (
    <div
      className="mt-5 rounded-lg border p-4"
      style={{ borderColor: color, background: correct ? "#EEF6F0" : "#F8ECEA" }}
    >
      <p className="text-sm font-semibold" style={{ color }}>
        {correct ? "Correct." : "Not quite."}
      </p>
      {!correct && (
        <p className="mt-1 text-sm" style={{ color: TOKENS.text }}>
          Correct answer: {correctText || "—"}
        </p>
      )}
      {question.explanation && (
        <p className="mt-2 text-sm leading-relaxed text-[#4b5563]">
          {question.explanation}
        </p>
      )}
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
    <div
      className="rounded-xl border bg-white p-3 sm:p-4"
      style={{ borderColor: TOKENS.border }}
    >
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
              className={`${plexMono.className} flex h-9 w-9 items-center justify-center rounded-md border text-sm tabular-nums transition-colors`}
              style={{
                borderColor: isCurrent ? TOKENS.accent : TOKENS.border,
                background: isCurrent ? "#FBF3E2" : done ? TOKENS.bg : "#fff",
                color: TOKENS.text,
                fontWeight: isCurrent || done ? 600 : 400,
              }}
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgb(27 33 48 / 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-lg"
        style={{ borderColor: TOKENS.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-title"
          className={`${sora.className} text-lg font-semibold`}
          style={{ color: TOKENS.text }}
        >
          Submit test?
        </h2>
        <p className="mt-2 text-sm" style={{ color: TOKENS.text }}>
          You answered{" "}
          <span className={`${plexMono.className} tabular-nums`}>{answered}</span> of{" "}
          <span className={`${plexMono.className} tabular-nums`}>{total}</span> questions.
        </p>
        {unanswered > 0 && (
          <p className="mt-1 text-sm text-[#6b7280]">
            Unanswered questions can lower your score.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton ref={confirmRef} onClick={onConfirm}>
            Submit Test
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

  return (
    <div className="space-y-5" style={{ color: TOKENS.text }}>
      <div
        className="rounded-xl border bg-white p-6 text-center"
        style={{ borderColor: TOKENS.border }}
      >
        <p className="text-sm text-[#6b7280]">Practice complete · {test.title}</p>
        <p className={`${plexMono.className} mt-2 text-4xl font-semibold tabular-nums`}>
          {correctCount} / {attempted.length}
        </p>
        <p className={`${plexMono.className} mt-1 text-lg font-semibold tabular-nums`} style={{ color: TOKENS.info }}>
          {pct}% correct
        </p>
        <p className="mt-2 text-sm text-[#6b7280]">
          Practice runs are not saved or graded.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <PrimaryButton onClick={onRestart}>Practise again</PrimaryButton>
        <a
          href="/practice"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-sm font-medium sm:min-h-0 sm:py-2"
          style={{ borderColor: TOKENS.border, color: TOKENS.text }}
        >
          Back to practice
        </a>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Buttons (Lexora tokens: navy primary, bordered secondary — gold stays an accent)
// ----------------------------------------------------------------------------

const buttonBase =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-45 disabled:pointer-events-none sm:min-h-0 sm:py-2.5";

function PrimaryButton({
  ref,
  ...props
}: React.ComponentProps<"button"> & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      className={`${buttonBase} text-white hover:opacity-90`}
      style={{ background: TOKENS.text }}
      {...props}
    />
  );
}

function SecondaryButton(props: React.ComponentProps<"button">) {
  return (
    <button
      className={`${buttonBase} border bg-white hover:bg-[#F3F2EE]`}
      style={{ borderColor: TOKENS.border, color: TOKENS.text }}
      {...props}
    />
  );
}
