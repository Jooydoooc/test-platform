"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Card, LinkButton, ProgressBar } from "@/components/ui";
import { awardVocabTestExp } from "@/lib/data/activity-exp";
import {
  getVocabWords,
  saveVocabProgress,
  type VocabWord,
} from "@/lib/vocab-store";
import {
  QUIZ_CONFIG,
  type McExerciseType,
  type QuizConfig,
  type WordField,
} from "@/lib/vocab";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Fisher–Yates — returns a new shuffled array, never mutates the input. */
function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fieldValue(w: VocabWord, field: WordField): string {
  if (field === "word") return w.word;
  if (field === "translation_uz") return w.translation_uz;
  return w.definition_en;
}

function examplesOf(w: VocabWord): string[] {
  return Array.isArray(w.examples) ? w.examples : [];
}

/** Replace whole-word occurrences of `word` in `sentence` with a blank. */
function blankOut(sentence: string, word: string): string {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = sentence.replace(new RegExp(`\\b${esc}\\b`, "gi"), "_____");
  if (boundary !== sentence) return boundary;
  // Fall back to a loose replace (handles attached punctuation / inflections
  // poorly, but guarantees a gap rather than revealing the answer).
  const loose = sentence.replace(new RegExp(esc, "gi"), "_____");
  return loose !== sentence ? loose : `${sentence} (_____)`;
}

/** Prefer an example that actually contains the word; blank it. */
function blankedExample(w: VocabWord): string {
  const examples = examplesOf(w);
  if (examples.length === 0) return "_____";
  const withWord = examples.filter((e) =>
    new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(e),
  );
  const pool = withWord.length ? withWord : examples;
  return blankOut(pool[Math.floor(Math.random() * pool.length)], w.word);
}

type Question = {
  key: string;
  prompt: string;
  options: string[];
  correct: string;
};

/**
 * Pick `count` words. If the unit has enough, sample without repeats; otherwise
 * allow repeats but never the same word twice in a row.
 */
function pickWords(words: VocabWord[], count: number): VocabWord[] {
  if (words.length >= count) return shuffle(words).slice(0, count);
  const out: VocabWord[] = [];
  let lastId: string | null = null;
  while (out.length < count) {
    const candidates = words.filter((w) => w.id !== lastId);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    out.push(pick);
    lastId = pick.id;
  }
  return out;
}

/** Build a fresh, fully re-shuffled question set from the unit's words. */
function buildQuestions(words: VocabWord[], config: QuizConfig): Question[] {
  const answerOf = (w: VocabWord) => fieldValue(w, config.answerField);
  return pickWords(words, config.questionCount).map((w, i) => {
    const correct = answerOf(w);
    // Distractors: distinct answer-field values from other words.
    const distractors: string[] = [];
    for (const o of shuffle(words)) {
      if (distractors.length === 3) break;
      const v = answerOf(o);
      if (v && v !== correct && !distractors.includes(v)) distractors.push(v);
    }
    const prompt =
      config.questionField === "example_blanked"
        ? blankedExample(w)
        : fieldValue(w, config.questionField);
    return {
      key: `${w.id}-${i}`,
      prompt,
      options: shuffle([correct, ...distractors]),
      correct,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FEEDBACK_MS = 800;

type Phase = "loading" | "not-enough" | "error" | "quiz" | "results";

export function QuizShell({
  unitId,
  exerciseType,
  unitTitle,
  test = false,
  labelOverride,
}: {
  unitId: string;
  exerciseType: McExerciseType;
  unitTitle?: string;
  // Test mode: a graded skills test that awards EXP on completion (once per
  // unit). Practice mode (default) awards nothing.
  test?: boolean;
  labelOverride?: string;
}) {
  const config = QUIZ_CONFIG[exerciseType];

  const [words, setWords] = useState<VocabWord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  // Load the unit's words from the local store (client-only: reads localStorage
  // conventions via the store, so it runs in an effect after mount).
  useEffect(() => {
    try {
      const rows = getVocabWords(unitId);
      setWords(rows);
      if (rows.length < 4) {
        setPhase("not-enough");
        return;
      }
      setQuestions(buildQuestions(rows, config));
      setPhase("quiz");
    } catch {
      setPhase("error");
    }
  }, [unitId, config]);

  const restart = useCallback(() => {
    setQuestions(buildQuestions(words, config));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setPhase("quiz");
  }, [words, config]);

  function answer(option: string) {
    if (picked !== null) return; // lock once chosen
    const current = questions[index];
    const correct = option === current.correct;
    setPicked(option);
    if (correct) setScore((s) => s + 1);
    window.setTimeout(() => {
      if (index + 1 >= questions.length) {
        setPhase("results");
      } else {
        setIndex((i) => i + 1);
        setPicked(null);
      }
    }, FEEDBACK_MS);
  }

  if (phase === "loading") return <QuizSkeleton />;

  if (phase === "error") {
    return (
      <Notice
        title="Couldn’t load this exercise"
        body="Something went wrong fetching the words. Please try again."
        unitId={unitId}
      />
    );
  }

  if (phase === "not-enough") {
    return (
      <Notice
        title="Not enough words yet"
        body={`This unit needs at least 4 words to build a quiz${
          words.length ? ` — it currently has ${words.length}.` : "."
        } Check back once more vocabulary has been added.`}
        unitId={unitId}
      />
    );
  }

  if (phase === "results") {
    return (
      <Results
        score={score}
        total={questions.length}
        unitId={unitId}
        exerciseType={exerciseType}
        onRetry={restart}
        test={test}
        labelOverride={labelOverride}
      />
    );
  }

  // quiz phase
  const current = questions[index];
  const progress = ((index + (picked ? 1 : 0)) / questions.length) * 100;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="font-medium text-slate-700">
            {unitTitle ? `${unitTitle} · ` : ""}
            {labelOverride ?? config.label}
          </span>
          <span className="font-mono tabular-nums">
            Question {index + 1} / {questions.length}
          </span>
        </div>
        <ProgressBar value={progress} />
      </header>

      <Card className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {config.caption}
        </p>
        <p className="text-xl font-semibold leading-snug text-slate-900">
          {current.prompt}
        </p>
      </Card>

      <div className="grid gap-3">
        {current.options.map((option) => {
          const isPicked = picked === option;
          const isCorrect = option === current.correct;
          const reveal = picked !== null;
          // Correct answer -> green once revealed; a wrong pick -> red.
          const tone =
            reveal && isCorrect
              ? "correct"
              : reveal && isPicked
                ? "wrong"
                : "idle";
          return (
            <button
              key={option}
              type="button"
              onClick={() => answer(option)}
              disabled={reveal}
              className={optionClass(tone)}
            >
              <span className="flex-1">{option}</span>
              {tone === "correct" && (
                <Check className="size-5 shrink-0 text-success" aria-hidden />
              )}
              {tone === "wrong" && (
                <X className="size-5 shrink-0 text-error" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type OptionTone = "idle" | "correct" | "wrong";

function optionClass(tone: OptionTone): string {
  const base =
    "flex min-h-[52px] items-center gap-3 rounded-xl border px-4 py-3 text-left text-base font-medium transition-colors";
  if (tone === "correct")
    return `${base} border-success/40 bg-success/10 text-slate-900`;
  if (tone === "wrong")
    return `${base} border-error/40 bg-error/10 text-slate-900`;
  return `${base} border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50 active:bg-brand-100 disabled:pointer-events-none`;
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function QuizSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className="flex justify-between">
          <div className="h-4 w-32 rounded bg-slate-200/80" />
          <div className="h-4 w-24 rounded bg-slate-200/80" />
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100" />
      </div>
      <div className="h-24 rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="h-3 w-40 rounded bg-slate-200/70" />
        <div className="mt-3 h-6 w-3/4 rounded bg-slate-200/80" />
      </div>
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[52px] rounded-xl border border-slate-200 bg-slate-50"
          />
        ))}
      </div>
      <span className="sr-only">Loading exercise…</span>
    </div>
  );
}

function Notice({
  title,
  body,
  unitId,
}: {
  title: string;
  body: string;
  unitId: string;
}) {
  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-3 text-center">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{body}</p>
        <div className="pt-1">
          <LinkButton href={`/practice/vocab/${unitId}`} variant="secondary">
            Back to word set
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

function Results({
  score,
  total,
  unitId,
  exerciseType,
  onRetry,
  test = false,
  labelOverride,
}: {
  score: number;
  total: number;
  unitId: string;
  exerciseType: McExerciseType;
  onRetry: () => void;
  test?: boolean;
  labelOverride?: string;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const savedRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [xpResult, setXpResult] =
    useState<Awaited<ReturnType<typeof awardVocabTestExp>> | null>(null);

  // Log one progress row on mount, with an incremented attempt_number.
  useEffect(() => {
    if (savedRef.current) return; // guard React strict-mode double-invoke
    savedRef.current = true;
    try {
      saveVocabProgress(unitId, exerciseType, score, total);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
    // Skills test awards EXP once per unit (server-deduped). Practice awards none.
    if (test) {
      awardVocabTestExp(unitId, score, total)
        .then(setXpResult)
        .catch(() => setXpResult({ status: "error" }));
    }
  }, [unitId, exerciseType, score, total, test]);

  const tone = pct >= 80 ? "success" : pct >= 50 ? "brand" : "error";

  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-5 text-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {labelOverride ?? QUIZ_CONFIG[exerciseType].label}
          </p>
          <p className="mt-2 font-mono text-5xl font-bold tabular-nums text-slate-900">
            {pct}%
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {score} of {total} correct
          </p>
        </div>

        <ProgressBar value={pct} tone={tone} />

        {test && xpResult && xpResult.status !== "ineligible" && (
          <p
            className={`text-sm font-semibold ${
              xpResult.status === "error" ? "text-red-600" : "text-brand-600"
            }`}
          >
            {xpResult.status === "granted"
              ? `+${xpResult.xp} XP earned`
              : xpResult.status === "duplicate"
                ? "No new XP — this test's XP was already earned."
                : "Couldn't save your XP. Check your connection and try again."}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800 sm:min-h-0"
          >
            <RotateCcw className="size-4" />
            Retry
          </button>
          <LinkButton href={`/practice/vocab/${unitId}`} variant="secondary">
            Back to word set
          </LinkButton>
        </div>

        {saveState === "error" && (
          <p className="text-xs text-error">
            Your result couldn’t be saved, but your score above is correct.
          </p>
        )}
        {saveState === "saved" && (
          <p className="text-xs text-slate-400">Result saved.</p>
        )}
      </Card>
    </div>
  );
}
