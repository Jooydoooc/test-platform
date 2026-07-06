"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Card, LinkButton, ProgressBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth";
import type { WordRow } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Config: one lookup drives every MC-style exercise. Adding another MC variant
// later is a new entry here, NOT a new component.
// ---------------------------------------------------------------------------

export type McExerciseType =
  | "mc_definition"
  | "mc_translation_en_uz"
  | "mc_translation_uz_en"
  | "mc_filling";

type WordField = "word" | "translation_uz" | "definition_en";

export type QuizConfig = {
  exerciseType: McExerciseType;
  // `example_blanked` is synthesised (a sentence with the word blanked out);
  // every other field is read straight off the word row.
  questionField: WordField | "example_blanked";
  answerField: WordField;
  questionCount: number;
  // Short human label + prompt caption shown above each question.
  label: string;
  caption: string;
};

const DEFAULT_COUNT = 20;

export const QUIZ_CONFIG: Record<McExerciseType, QuizConfig> = {
  mc_definition: {
    exerciseType: "mc_definition",
    questionField: "word",
    answerField: "definition_en",
    questionCount: DEFAULT_COUNT,
    label: "Definitions",
    caption: "Choose the correct definition",
  },
  mc_translation_en_uz: {
    exerciseType: "mc_translation_en_uz",
    questionField: "word",
    answerField: "translation_uz",
    questionCount: DEFAULT_COUNT,
    label: "English → Uzbek",
    caption: "Choose the correct translation",
  },
  mc_translation_uz_en: {
    exerciseType: "mc_translation_uz_en",
    questionField: "translation_uz",
    answerField: "word",
    questionCount: DEFAULT_COUNT,
    label: "Uzbek → English",
    caption: "Choose the correct English word",
  },
  mc_filling: {
    exerciseType: "mc_filling",
    questionField: "example_blanked",
    answerField: "word",
    questionCount: DEFAULT_COUNT,
    label: "Fill the gap",
    caption: "Choose the word that fits the sentence",
  },
};

export function isMcExerciseType(v: string): v is McExerciseType {
  return v in QUIZ_CONFIG;
}

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

function fieldValue(w: WordRow, field: WordField): string {
  if (field === "word") return w.word;
  if (field === "translation_uz") return w.translation_uz;
  return w.definition_en;
}

function examplesOf(w: WordRow): string[] {
  return Array.isArray(w.examples)
    ? (w.examples.filter((e) => typeof e === "string") as string[])
    : [];
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
function blankedExample(w: WordRow): string {
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
function pickWords(words: WordRow[], count: number): WordRow[] {
  if (words.length >= count) return shuffle(words).slice(0, count);
  const out: WordRow[] = [];
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
function buildQuestions(words: WordRow[], config: QuizConfig): Question[] {
  const answerOf = (w: WordRow) => fieldValue(w, config.answerField);
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
}: {
  unitId: string;
  exerciseType: McExerciseType;
  unitTitle?: string;
}) {
  const config = QUIZ_CONFIG[exerciseType];
  const { user } = useSession();

  const [words, setWords] = useState<WordRow[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  // Fetch the unit's words once.
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("words")
        .select("*")
        .eq("unit_id", unitId);
      if (!active) return;
      if (error) {
        setPhase("error");
        return;
      }
      const rows = (data ?? []) as WordRow[];
      setWords(rows);
      if (rows.length < 4) {
        setPhase("not-enough");
        return;
      }
      setQuestions(buildQuestions(rows, config));
      setPhase("quiz");
    })();
    return () => {
      active = false;
    };
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
        userId={user?.id}
        onRetry={restart}
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
            {config.label}
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
          <LinkButton href={`/lexora/vocab/${unitId}`} variant="secondary">
            Back to unit
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
  userId,
  onRetry,
}: {
  score: number;
  total: number;
  unitId: string;
  exerciseType: McExerciseType;
  userId?: string;
  onRetry: () => void;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const savedRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  // Log one user_progress row on mount, with an incremented attempt_number.
  useEffect(() => {
    if (savedRef.current) return; // guard React strict-mode double-invoke
    savedRef.current = true;
    if (!userId) return; // no session -> nothing to log
    const supabase = createClient();
    (async () => {
      setSaveState("saving");
      const { data: prior } = await supabase
        .from("user_progress")
        .select("attempt_number")
        .eq("user_id", userId)
        .eq("unit_id", unitId)
        .eq("exercise_type", exerciseType)
        .order("attempt_number", { ascending: false })
        .limit(1);
      const nextAttempt = (prior?.[0]?.attempt_number ?? 0) + 1;
      const { error } = await supabase.from("user_progress").insert({
        user_id: userId,
        unit_id: unitId,
        exercise_type: exerciseType,
        score,
        total,
        attempt_number: nextAttempt,
      });
      setSaveState(error ? "error" : "saved");
    })();
  }, [userId, unitId, exerciseType, score, total]);

  const tone = pct >= 80 ? "success" : pct >= 50 ? "brand" : "error";

  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-5 text-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {QUIZ_CONFIG[exerciseType].label}
          </p>
          <p className="mt-2 font-mono text-5xl font-bold tabular-nums text-slate-900">
            {pct}%
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {score} of {total} correct
          </p>
        </div>

        <ProgressBar value={pct} tone={tone} />

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800 sm:min-h-0"
          >
            <RotateCcw className="size-4" />
            Retry
          </button>
          <LinkButton href={`/lexora/vocab/${unitId}`} variant="secondary">
            Back to unit
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
