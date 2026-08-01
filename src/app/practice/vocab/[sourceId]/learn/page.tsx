"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  LayoutGrid,
  Rows3,
  RotateCw,
} from "lucide-react";
import { Card, LinkButton, ProgressBar } from "@/components/ui";
import {
  getSourceTitle,
  getVocabWords,
  type VocabWord,
} from "@/lib/vocab-store";

// /practice/vocab/:sourceId/learn — study mode. Read the words (front = word,
// back = meaning) before drilling them. Nothing here is graded; it's the
// "learn" step that precedes the exercises on the unit hub.
export default function VocabLearnPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = use(params);

  // Words + title come from localStorage, so resolve on the client only.
  const [words, setWords] = useState<VocabWord[] | null>(null);
  const [title, setTitle] = useState("Word set");

  useEffect(() => {
    setTitle(getSourceTitle(sourceId));
    setWords(getVocabWords(sourceId));
  }, [sourceId]);

  if (words === null) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href={`/practice/vocab/${sourceId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          {title}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Learn the words
        </h1>
        <p className="text-sm text-slate-600">
          Study each word and its meaning first — then practise. Nothing here is
          graded.
        </p>
      </header>

      {words.length === 0 ? (
        <EmptyState sourceId={sourceId} />
      ) : (
        <LearnStudio sourceId={sourceId} words={words} />
      )}
    </div>
  );
}

/* ------------------------------ studio --------------------------------- */

type Mode = "cards" | "list";

function LearnStudio({
  sourceId,
  words,
}: {
  sourceId: string;
  words: VocabWord[];
}) {
  const [mode, setMode] = useState<Mode>("cards");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">
          {words.length} {words.length === 1 ? "word" : "words"} to learn
        </p>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {mode === "cards" ? (
        <Flashcards sourceId={sourceId} words={words} />
      ) : (
        <WordList sourceId={sourceId} words={words} />
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const opts: { value: Mode; label: string; Icon: typeof LayoutGrid }[] = [
    { value: "cards", label: "Cards", Icon: LayoutGrid },
    { value: "list", label: "List", Icon: Rows3 },
  ];
  return (
    <div
      className="inline-flex rounded-xl bg-slate-100 p-1"
      role="group"
      aria-label="Study mode"
    >
      {opts.map(({ value, label, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------- flashcards ------------------------------- */

function Flashcards({
  sourceId,
  words,
}: {
  sourceId: string;
  words: VocabWord[];
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));

  const total = words.length;
  const word = words[index];
  const atEnd = index === total - 1;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      setIndex(clamped);
      setFlipped(false);
      setSeen((prev) => {
        const s = new Set(prev);
        s.add(clamped);
        return s;
      });
    },
    [total],
  );

  const flip = useCallback(() => setFlipped((f) => !f), []);

  // Keyboard: ← / → to move, space or enter to flip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, flip]);

  return (
    <div className="space-y-4">
      {/* progress */}
      <div className="flex items-center gap-3">
        <ProgressBar value={Math.round((seen.size / total) * 100)} />
        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
          {index + 1} / {total}
        </span>
      </div>

      {/* card */}
      <button
        type="button"
        onClick={flip}
        aria-label={flipped ? "Show word" : "Show meaning"}
        className="group relative flex min-h-[260px] w-full flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:min-h-[300px]"
      >
        {!flipped ? (
          <>
            <p className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              {word.word}
            </p>
            {word.part_of_speech && (
              <p className="mt-2 text-sm italic text-slate-400">
                {word.part_of_speech}
              </p>
            )}
            <p className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <RotateCw className="size-3.5" />
              Tap to reveal meaning
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-lg font-semibold leading-snug text-slate-900">
              {word.definition_en}
            </p>
            <p className="text-base font-medium text-brand-600">
              {word.translation_uz}
            </p>
            {word.examples[0] && (
              <p className="mx-auto max-w-md text-sm italic leading-relaxed text-slate-500">
                “{word.examples[0]}”
              </p>
            )}
          </div>
        )}
      </button>

      {/* controls */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
        >
          <ArrowLeft className="size-4" />
          Prev
        </button>

        <button
          type="button"
          onClick={flip}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700"
        >
          <RotateCw className="size-4" />
          Flip
        </button>

        {atEnd ? (
          <LinkButton
            href={`/practice/vocab/${sourceId}`}
            className="gap-1.5"
          >
            <Check className="size-4" />
            Done
          </LinkButton>
        ) : (
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Next
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>

      <PracticeCta sourceId={sourceId} />
    </div>
  );
}

/* ------------------------------ list ----------------------------------- */

function WordList({
  sourceId,
  words,
}: {
  sourceId: string;
  words: VocabWord[];
}) {
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {words.map((w, i) => (
          <li key={w.id}>
            <Card className="flex gap-4">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-display text-lg font-bold text-slate-900">
                    {w.word}
                  </span>
                  {w.part_of_speech && (
                    <span className="text-sm italic text-slate-400">
                      {w.part_of_speech}
                    </span>
                  )}
                  <span className="font-medium text-brand-600">
                    · {w.translation_uz}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{w.definition_en}</p>
                {w.examples[0] && (
                  <p className="text-sm italic text-slate-500">
                    “{w.examples[0]}”
                  </p>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <PracticeCta sourceId={sourceId} />
    </div>
  );
}

/* ---------------------------- shared bits ------------------------------ */

function PracticeCta({ sourceId }: { sourceId: string }) {
  return (
    <Link
      href={`/practice/vocab/${sourceId}`}
      className="group mt-2 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/40 px-5 py-4 transition hover:border-brand-300 hover:bg-brand-50"
    >
      <div>
        <p className="font-semibold text-slate-900">Ready to practise?</p>
        <p className="text-sm text-slate-600">
          Try the exercises and skills test over these words.
        </p>
      </div>
      <ArrowRight className="size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function EmptyState({ sourceId }: { sourceId: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      <div
        aria-hidden
        className="flex size-16 items-center justify-center rounded-2xl bg-slate-100"
      >
        <BookOpen className="size-8 text-slate-400" />
      </div>
      <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
        No words to learn yet
      </h2>
      <p className="mt-1.5 max-w-xs text-sm text-slate-600">
        Collect some words from a text first, then come back to study them.
      </p>
      <LinkButton href={`/practice/vocab/${sourceId}`} className="mt-5">
        Back to the set
      </LinkButton>
    </div>
  );
}
