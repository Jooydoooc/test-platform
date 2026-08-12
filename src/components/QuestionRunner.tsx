"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  RotateCcw,
  X,
} from "lucide-react";
import type { Question, Test } from "@/lib/types";
import { gradeQuestion } from "@/lib/store";
import { setLiveTest } from "@/lib/live-test";
import {
  OPTION_LETTERS,
  answeredCount,
  instructionFor,
  isAnswered,
  isMultiAnswer,
  optionsFor,
  selectionEcho,
} from "@/lib/mcq";
import {
  FullscreenGuard,
  ProctorWarning,
  useProctor,
  type Integrity,
  type ProctorApi,
} from "@/components/Proctor";
import { Button } from "@/components/ui";
import {
  ExamHeader,
  ProgressStrip,
  QuestionPalette,
  ConfirmSubmit,
  SecureBriefing,
  type PaletteItem,
} from "@/components/exam";

/** Metadata returned to the parent when a test is submitted. */
export interface SubmitMeta {
  timeTakenSec?: number;
  timedOut: boolean;
  /** Proctor violation snapshot, taken before the proctor disengages. */
  integrity: Integrity;
}

type Answers = Record<string, string[]>;

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
  // Test only: questions the student has advanced past via Next. Graded mode
  // is strictly one-way now — there is no Previous and no palette to jump
  // back with — but that alone is only a UI-level guarantee. This map is the
  // real enforcement: once a question id is locked here, its answer inputs
  // render `disabled` no matter what triggers a re-render (a future edit
  // that reintroduces backward navigation, a resumed/rehydrated state, a
  // stray setIndex somewhere), because the disabled check reads this map,
  // not the current index. A question is locked the moment the student
  // presses Next and leaves it — not before, so the question they're
  // currently sitting on (including after backing out of the review screen)
  // stays editable.
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({});
  // Test only: the submit confirmation modal. There is no pre-submit review
  // screen any more — it opens directly over the current (last) question.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Test only: true from the moment the student confirms submission. Passed
  // straight through to ConfirmSubmit as `submitting` so it freezes its own
  // buttons/Escape/backdrop — this is the piece of state that has to be set
  // BEFORE submitTest() runs (see submitTest handler below) so a fast
  // double-click can't slip a second call in ahead of submittedRef flipping.
  // The component is swapped out for the results view right after submit, so
  // this never needs to be reset back to false.
  const [submitting, setSubmitting] = useState(false);
  const [practiceDone, setPracticeDone] = useState(false);
  const [secureStarted, setSecureStarted] = useState(mode === "practice");

  const startedAtRef = useRef<number | null>(
    mode === "practice" ? Date.now() : null,
  );
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

  // Palette items for the practice-only inline QuestionPalette. Graded mode
  // no longer has a jumpable palette (ProgressStrip is read-only and needs
  // no per-item data), and flagging was never part of graded mode, so this
  // list — and the "flagged" field the shared PaletteItem type still
  // carries — only matters here for practice.
  const paletteItems: PaletteItem[] = useMemo(
    () =>
      test.questions.map((qq) => ({
        id: qq.id,
        label: qq.prompt,
        answered: isAnswered(answers[qq.id]),
        flagged: false,
      })),
    [test, answers],
  );

  // Test only: 1-based numbers of questions with no answer, used only for
  // its length (the ConfirmSubmit unanswered count). Blank answers are
  // always allowed — this is informational, never a block on Next.
  const unansweredNumbers = useMemo(
    () =>
      test.questions
        .map((qq, i) => (isAnswered(answers[qq.id]) ? null : i + 1))
        .filter((n): n is number => n !== null),
    [test, answers],
  );

  // Keep the newest submit closure reachable from the timer without re-arming it.
  const submitRef = useRef<(timedOut?: boolean) => void>(() => {});
  // Mirrors `proctor` so submitTest (defined before useProctor runs) can reach
  // disengage() without a definition-order cycle.
  const proctorRef = useRef<ProctorApi | null>(null);

  function submitTest(timedOut = false) {
    if (!isTest || submittedRef.current) return;
    submittedRef.current = true;
    // Snapshot the integrity tally BEFORE disengage() runs. disengage() doesn't
    // currently clear the tally, but capture order still matters: engagedRef
    // flips false inside disengage(), and getIntegrity() must read the final
    // count from a still-live proctor, not one that's already been torn down.
    const integrity: Integrity = proctorRef.current?.getIntegrity() ?? {
      violations: 0,
      flags: {},
    };
    // Release the lockdown (including exiting fullscreen) synchronously, before
    // the onSubmit callback runs. The parent swaps this component out for the
    // results view right after onSubmit — by the time that unmount happens the
    // proctor is already disengaged, so there's no race between "exit
    // fullscreen" and "the component that would exit it disappears".
    proctorRef.current?.disengage();
    const meta: SubmitMeta = {
      timedOut,
      timeTakenSec:
        timeLimitMin && timeLimitMin > 0 && startedAtRef.current !== null
          ? Math.round((Date.now() - startedAtRef.current) / 1000)
          : undefined,
      integrity,
    };
    onSubmit?.(answers, meta);
  }
  submitRef.current = submitTest;

  const proctor = useProctor({
    enabled: isTest && secureStarted && !submittedRef.current,
    onAutoSubmit: () => submitRef.current(false),
  });
  proctorRef.current = proctor;

  // Global chrome hides on exactly the same condition that arms the proctor:
  // a graded test the student has actually begun. This lives here rather than
  // in the parent page because secureStarted is internal to the runner — the
  // parent flips to "running" when the student clicks "Start test", but the
  // secure-start briefing below still stands between them and the exam, and
  // that screen is one they must be able to back out of. Practice mode never
  // hides chrome (secureStarted starts true there, so isTest gates it out).
  useEffect(() => {
    setLiveTest(isTest && secureStarted);
    return () => setLiveTest(false);
  }, [isTest, secureStarted]);

  // Safety net: if the runner unmounts without ever reaching submitTest (e.g.
  // the student navigates away mid-test via the "Leave test" link in the
  // fullscreen guard, or a browser back/forward), still release the lockdown.
  // disengage() is idempotent — a no-op if already disengaged — so this never
  // double-fires anything observable.
  useEffect(() => {
    return () => {
      proctorRef.current?.disengage();
    };
  }, []);

  function beginSecureTest() {
    startedAtRef.current = Date.now();
    setSecureStarted(true);
    void proctor.engage();
  }

  // Countdown for timed tests.
  useEffect(() => {
    if (
      !isTest ||
      !secureStarted ||
      startedAtRef.current === null ||
      !timeLimitMin ||
      timeLimitMin <= 0
    )
      return;
    const deadline = startedAtRef.current + timeLimitMin * 60_000;
    const tick = () => {
      const rem = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemainingSec(rem);
      if (rem <= 0) submitRef.current(true);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [isTest, secureStarted, timeLimitMin]);

  function setAnswer(value: string[]) {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
  }

  // Focus target for the question card. When a palette / Previous / Next
  // click swaps the question card's contents out from under a focused
  // control, nothing in the new subtree is focused by default and
  // keyboard/screen-reader users lose their place silently. Moving focus
  // here on every index change keeps that position honest in both modes.
  // The ConfirmSubmit modal sits on top of this card rather than replacing
  // it, so opening or dismissing it never changes `index` and never needs to
  // steal focus back — the modal manages its own focus trap.
  const cardRef = useRef<HTMLDivElement>(null);
  // secureStarted is a dependency because the question card does not exist
  // behind the briefing screen: without it the effect's first run finds no
  // target and focus stays on the body for the entire first question.
  useEffect(() => {
    cardRef.current?.focus();
  }, [index, secureStarted]);

  // Practice navigates freely in both directions via Previous/Next/the
  // palette. Test mode calls this too (from nextTestQuestion below) but only
  // ever with an increasing index — there is no Previous button and no
  // palette to jump backward with in graded mode.
  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(total - 1, next)));
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Test only: the sole forward-navigation action. Locks the question being
  // left (see lockedMap above) and either advances to the next question or,
  // on the last question, opens ConfirmSubmit directly over it. The last
  // question is deliberately NOT locked here — opening the modal isn't
  // "advancing past" it, and dismissing the modal ("Continue test") returns
  // the student to exactly this question, which must still be editable.
  function nextTestQuestion() {
    if (atLast) {
      setConfirmOpen(true);
      return;
    }
    setLockedMap((prev) => ({ ...prev, [q.id]: true }));
    goTo(index + 1);
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

  if (isTest && !secureStarted) {
    return (
      <SecureBriefing
        title={test.title}
        subtitle={subtitle}
        questionCount={total}
        timeLimitSec={
          timeLimitMin && timeLimitMin > 0 ? timeLimitMin * 60 : undefined
        }
        onBegin={beginSecureTest}
      />
    );
  }

  const atLast = index + 1 >= total;

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-brand-600">
      {isTest && proctor.needsFullscreen && (
        <FullscreenGuard onReenter={proctor.reenterFullscreen} />
      )}
      {isTest && proctor.tabWarning && !proctor.needsFullscreen && (
        <ProctorWarning onDismiss={proctor.dismissTabWarning} />
      )}

      {/* ---- Top bar ---- */}
      {isTest ? (
        <ExamHeader
          title={test.title}
          subtitle={subtitle}
          index={index}
          total={total}
          answered={nAnswered}
          remainingSec={remainingSec}
          violations={proctor.violations}
        />
      ) : (
        <PracticeHeader
          title={test.title}
          subtitle={subtitle}
          index={index}
          total={total}
          nCorrect={nCorrect}
        />
      )}

      {/* ---- Question card ---- */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-card outline-none sm:p-8"
      >
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
            // Practice: input disables once the answer is checked (existing
            // behaviour, unchanged). Test: input disables once this question
            // has been locked via nextTestQuestion — reading lockedMap here,
            // not the current index, is what makes the lock real rather than
            // cosmetic (see the lockedMap declaration above for why).
            disabled={isTest ? !!lockedMap[q.id] : checked}
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

      {/* ---- Question navigator ----
          Practice keeps the jumpable palette. Test mode is strictly
          one-way now, so it gets the read-only ProgressStrip instead —
          no buttons, no jumping, just an honest "where am I" readout. */}
      {isTest ? (
        <ProgressStrip total={total} index={index} answered={nAnswered} />
      ) : (
        <QuestionPalette items={paletteItems} current={index} onJump={goTo} />
      )}

      {/* ---- Bottom navigation ----
          Practice keeps Previous. Test mode has no Previous at all — the
          lock above only means anything because there's no button here
          that could route the student back to a locked question. */}
      <div
        className={`flex flex-wrap items-center gap-3 ${
          mode === "practice" ? "justify-between" : "justify-end"
        }`}
      >
        {mode === "practice" && (
          <Button
            variant="secondary"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
          >
            <ArrowLeft className="size-4" />
            Previous
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {mode === "practice" ? (
            checked ? (
              <>
                <Button variant="secondary" onClick={retry}>
                  <RotateCcw className="size-4" />
                  Try again
                </Button>
                <Button
                  onClick={() =>
                    atLast ? setPracticeDone(true) : goTo(index + 1)
                  }
                >
                  {atLast ? "Finish" : "Next question"}
                  {!atLast && <ArrowRight className="size-4" />}
                </Button>
              </>
            ) : (
              <Button onClick={checkAnswer} disabled={!answered}>
                <Check className="size-4" />
                Check answer
              </Button>
            )
          ) : (
            <Button onClick={nextTestQuestion}>
              {atLast ? "Finish test" : "Next"}
              {!atLast && <ArrowRight className="size-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* ---- Submit confirmation ----
          Opens directly over the current (last) question — there is no
          review screen underneath it. "Continue test" just closes this
          modal, leaving the question exactly as it was. */}
      {confirmOpen && (
        <ConfirmSubmit
          answered={nAnswered}
          total={total}
          unanswered={unansweredNumbers.length}
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            // Set BEFORE submitTest() so a fast double-click can't fire
            // onConfirm twice ahead of submittedRef flipping inside it —
            // submittedRef stays the real backstop, this is the UI-level one.
            setSubmitting(true);
            submitTest(false);
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Practice header (no proctor, no briefing — a running "N correct" tally that
// the shared ExamHeader doesn't model, so it stays local to this file).
// ----------------------------------------------------------------------------

function PracticeHeader({
  title,
  subtitle,
  index,
  total,
  nCorrect,
}: {
  title: string;
  subtitle?: string;
  index: number;
  total: number;
  nCorrect: number;
}) {
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  return (
    <header className="sticky top-2 z-10 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md sm:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-semibold sm:text-lg">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              {subtitle}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-semibold tabular-nums sm:text-base">
            {Math.min(index + 1, total)}
            <span className="text-slate-400"> / {total}</span>
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-mono tabular-nums text-success">
              {nCorrect}
            </span>{" "}
            correct
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </header>
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
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-brand-600 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 sm:text-sm"
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
      <span className="flex-1 text-sm leading-snug text-brand-600 sm:text-base">
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
      className={`mx-1 inline-block min-w-[7rem] max-w-full border-b-2 bg-transparent px-1 pb-0.5 text-center text-lg font-semibold text-brand-600 outline-none sm:text-xl ${borderColor}`}
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
    <p className="font-display text-lg leading-relaxed text-brand-600 sm:text-xl">
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
          <p className="mt-1 text-sm text-brand-600">
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
    <div className="mx-auto max-w-3xl space-y-5 text-brand-600">
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
        <Button onClick={onRestart}>
          <RotateCcw className="size-4" />
          Practise again
        </Button>
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
