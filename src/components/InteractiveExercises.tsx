"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { Card, LinkButton, ProgressBar } from "@/components/ui";
import { awardExerciseExp } from "@/lib/data/activity-exp";
import {
  getVocabWords,
  saveVocabProgress,
  type VocabWord,
} from "@/lib/vocab-store";
import {
  INTERACTIVE_CONFIG,
  type InteractiveConfig,
  type InteractiveExerciseType,
} from "@/lib/vocab";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function esc(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** An example sentence that actually contains the word, or null. */
function exampleWith(w: VocabWord): string | null {
  const re = new RegExp(`\\b${esc(w.word)}\\b`, "i");
  const hit = (w.examples ?? []).find((e) => re.test(e));
  return hit ?? w.examples?.[0] ?? null;
}

/** Replace whole-word occurrences of `word` with a blank. */
function blankOut(sentence: string, word: string): string {
  const b = sentence.replace(new RegExp(`\\b${esc(word)}\\b`, "gi"), "_____");
  return b !== sentence ? b : sentence.replace(new RegExp(esc(word), "gi"), "_____");
}

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/[.,!?;:"']/g, "");
}

/** Pick up to `count` words (no repeats) that have a usable example sentence. */
function pickWordsWithExamples(words: VocabWord[], count: number): VocabWord[] {
  const usable = words.filter((w) => exampleWith(w));
  return shuffle(usable).slice(0, count);
}

// ---------------------------------------------------------------------------
// Shared scaffold (loading / not-enough / results wrapper)
// ---------------------------------------------------------------------------

type Phase = "loading" | "not-enough" | "error" | "active" | "results";

function useDrillWords(unitId: string) {
  const [words, setWords] = useState<VocabWord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  useEffect(() => {
    try {
      const rows = getVocabWords(unitId);
      setWords(rows);
      setPhase(rows.length < 4 ? "not-enough" : "active");
    } catch {
      setPhase("error");
    }
  }, [unitId]);
  return { words, phase, setPhase };
}

function Header({
  unitTitle,
  config,
  current,
  total,
}: {
  unitTitle?: string;
  config: InteractiveConfig;
  current: number;
  total: number;
}) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  return (
    <header className="space-y-2">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span className="font-medium text-slate-700">
          {unitTitle ? `${unitTitle} · ` : ""}
          {config.label}
        </span>
        <span className="font-mono tabular-nums">
          {current} / {total}
        </span>
      </div>
      <ProgressBar value={progress} />
    </header>
  );
}

function Notice({
  title,
  body,
  unitId,
  words,
}: {
  title: string;
  body: string;
  unitId: string;
  words?: number;
}) {
  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-3 text-center">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">
          {body}
          {typeof words === "number" && words > 0
            ? ` It currently has ${words}.`
            : ""}
        </p>
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
}: {
  score: number;
  total: number;
  unitId: string;
  exerciseType: InteractiveExerciseType;
  onRetry: () => void;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const savedRef = useRef(false);
  useEffect(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    try {
      saveVocabProgress(unitId, exerciseType, score, total);
    } catch {
      /* score above is still correct */
    }
    // Award real EXP for the completed exercise (feeds the leaderboard).
    // Fire-and-forget: a failed award must never block showing the result.
    void awardExerciseExp(unitId, exerciseType, score, total).catch(() => {});
  }, [unitId, exerciseType, score, total]);

  const tone = pct >= 80 ? "success" : pct >= 50 ? "brand" : "error";
  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-5 text-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {INTERACTIVE_CONFIG[exerciseType].label}
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
          <LinkButton href={`/practice/vocab/${unitId}`} variant="secondary">
            Back to word set
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function InteractiveExercise({
  unitId,
  exerciseType,
  unitTitle,
}: {
  unitId: string;
  exerciseType: InteractiveExerciseType;
  unitTitle?: string;
}) {
  if (exerciseType === "gap_fill_typed")
    return <GapFill unitId={unitId} unitTitle={unitTitle} />;
  if (exerciseType === "sentence_builder")
    return <SentenceBuilder unitId={unitId} unitTitle={unitTitle} />;
  return <MatchWords unitId={unitId} unitTitle={unitTitle} />;
}

// ---------------------------------------------------------------------------
// 1. Gap filling — type the missing word
// ---------------------------------------------------------------------------

type GapQuestion = { word: VocabWord; sentence: string };

function GapFill({ unitId, unitTitle }: { unitId: string; unitTitle?: string }) {
  const config = INTERACTIVE_CONFIG.gap_fill_typed;
  const { words, phase, setPhase } = useDrillWords(unitId);
  const [questions, setQuestions] = useState<GapQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const build = useCallback((rows: VocabWord[]) => {
    return pickWordsWithExamples(rows, config.questionCount).map((w) => ({
      word: w,
      sentence: blankOut(exampleWith(w)!, w.word),
    }));
  }, [config.questionCount]);

  useEffect(() => {
    if (phase === "active" && questions.length === 0) {
      const q = build(words);
      if (q.length < 4) setPhase("not-enough");
      else setQuestions(q);
    }
  }, [phase, words, questions.length, build, setPhase]);

  useEffect(() => {
    if (checked === null) inputRef.current?.focus();
  }, [index, checked]);

  const restart = useCallback(() => {
    setQuestions(build(words));
    setIndex(0);
    setValue("");
    setChecked(null);
    setScore(0);
    setPhase("active");
  }, [words, build, setPhase]);

  if (phase === "loading") return <Skeleton />;
  if (phase === "error")
    return <Notice title="Couldn’t load this exercise" body="Please try again." unitId={unitId} />;
  if (phase === "not-enough")
    return <Notice title="Not enough words yet" body="This exercise needs at least 4 words with example sentences." unitId={unitId} words={words.length} />;
  if (phase === "results")
    return <Results score={score} total={questions.length} unitId={unitId} exerciseType="gap_fill_typed" onRetry={restart} />;
  if (questions.length === 0) return <Skeleton />;

  const q = questions[index];
  function submit() {
    if (checked !== null) {
      // advance
      if (index + 1 >= questions.length) setPhase("results");
      else {
        setIndex((i) => i + 1);
        setValue("");
        setChecked(null);
      }
      return;
    }
    if (!value.trim()) return;
    const ok = normalizeAnswer(value) === normalizeAnswer(q.word.word);
    if (ok) setScore((s) => s + 1);
    setChecked(ok);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Header unitTitle={unitTitle} config={config} current={index + 1} total={questions.length} />
      <Card className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {config.caption}
        </p>
        <p className="text-xl font-semibold leading-relaxed text-slate-900">
          {q.sentence}
        </p>
        <p className="text-sm text-slate-500">
          Hint: <span className="text-slate-700">{q.word.translation_uz}</span>
        </p>
      </Card>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={checked !== null}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type the missing word…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={`w-full rounded-xl border px-4 py-3 text-lg outline-none transition-colors ${
            checked === null
              ? "border-slate-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
              : checked
                ? "border-success/50 bg-success/10 text-slate-900"
                : "border-error/50 bg-error/10 text-slate-900"
          }`}
        />

        {checked !== null && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              checked ? "bg-success/10 text-slate-800" : "bg-error/10 text-slate-800"
            }`}
          >
            {checked ? (
              <Check className="size-4 text-success" />
            ) : (
              <X className="size-4 text-error" />
            )}
            {checked ? (
              "Correct!"
            ) : (
              <span>
                Answer: <strong className="font-semibold">{q.word.word}</strong>
              </span>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={checked === null && !value.trim()}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {checked === null ? (
            "Check"
          ) : index + 1 >= questions.length ? (
            "See results"
          ) : (
            <>
              Next <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Sentence builder — put the words in order
// ---------------------------------------------------------------------------

type BuildQuestion = { target: string[]; pool: string[] };

function buildSentenceQuestions(
  words: VocabWord[],
  count: number,
): BuildQuestion[] {
  return pickWordsWithExamples(words, count)
    .map((w) => {
      const sentence = exampleWith(w)!.trim();
      const target = sentence.split(/\s+/);
      return target.length >= 3 && target.length <= 12
        ? { target, pool: [] as string[] }
        : null;
    })
    .filter((q): q is BuildQuestion => q !== null)
    .map((q) => {
      // Shuffle until the order actually differs (single-word edge aside).
      let pool = shuffle(q.target);
      let guard = 0;
      while (pool.join(" ") === q.target.join(" ") && guard++ < 8) {
        pool = shuffle(q.target);
      }
      return { target: q.target, pool };
    });
}

function SentenceBuilder({
  unitId,
  unitTitle,
}: {
  unitId: string;
  unitTitle?: string;
}) {
  const config = INTERACTIVE_CONFIG.sentence_builder;
  const { words, phase, setPhase } = useDrillWords(unitId);
  const [questions, setQuestions] = useState<BuildQuestion[]>([]);
  const [index, setIndex] = useState(0);
  // Indexes into the pool, in the order the user placed them.
  const [placed, setPlaced] = useState<number[]>([]);
  const [checked, setChecked] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (phase === "active" && questions.length === 0) {
      const q = buildSentenceQuestions(words, config.questionCount);
      if (q.length < 3) setPhase("not-enough");
      else setQuestions(q);
    }
  }, [phase, words, questions.length, config.questionCount, setPhase]);

  const restart = useCallback(() => {
    setQuestions(buildSentenceQuestions(words, config.questionCount));
    setIndex(0);
    setPlaced([]);
    setChecked(null);
    setScore(0);
    setPhase("active");
  }, [words, config.questionCount, setPhase]);

  if (phase === "loading") return <Skeleton />;
  if (phase === "error")
    return <Notice title="Couldn’t load this exercise" body="Please try again." unitId={unitId} />;
  if (phase === "not-enough")
    return <Notice title="Not enough words yet" body="This exercise needs a few words with example sentences." unitId={unitId} words={words.length} />;
  if (phase === "results")
    return <Results score={score} total={questions.length} unitId={unitId} exerciseType="sentence_builder" onRetry={restart} />;
  if (questions.length === 0) return <Skeleton />;

  const q = questions[index];
  const remaining = q.pool
    .map((_, i) => i)
    .filter((i) => !placed.includes(i));
  const complete = placed.length === q.target.length;

  function place(i: number) {
    if (checked !== null) return;
    setPlaced((p) => [...p, i]);
  }
  function unplace(i: number) {
    if (checked !== null) return;
    setPlaced((p) => p.filter((x) => x !== i));
  }
  function advance() {
    if (index + 1 >= questions.length) setPhase("results");
    else {
      setIndex((i) => i + 1);
      setPlaced([]);
      setChecked(null);
    }
  }
  function check() {
    const built = placed.map((i) => q.pool[i]).join(" ");
    const ok = built === q.target.join(" ");
    if (ok) setScore((s) => s + 1);
    setChecked(ok);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Header unitTitle={unitTitle} config={config} current={index + 1} total={questions.length} />
      <Card className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {config.caption}
        </p>
      </Card>

      {/* Build tray */}
      <div
        className={`min-h-[64px] rounded-xl border-2 border-dashed p-3 transition-colors ${
          checked === null
            ? "border-slate-200 bg-slate-50"
            : checked
              ? "border-success/40 bg-success/10"
              : "border-error/40 bg-error/10"
        }`}
      >
        {placed.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-400">
            Tap words below to build the sentence
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {placed.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => unplace(i)}
                disabled={checked !== null}
                className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-base font-medium text-slate-800 shadow-sm transition hover:border-brand-400 disabled:cursor-default"
              >
                {q.pool[i]}
              </button>
            ))}
          </div>
        )}
      </div>

      {checked === false && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Correct order:{" "}
          <strong className="font-semibold text-slate-900">
            {q.target.join(" ")}
          </strong>
        </p>
      )}

      {/* Word bank */}
      <div className="flex flex-wrap gap-2">
        {remaining.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => place(i)}
            disabled={checked !== null}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-base font-medium text-slate-800 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40"
          >
            {q.pool[i]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {checked === null ? (
          <>
            <button
              type="button"
              onClick={check}
              disabled={!complete}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              Check
            </button>
            {placed.length > 0 && (
              <button
                type="button"
                onClick={() => setPlaced([])}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-base font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RotateCcw className="size-4" /> Clear
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={advance}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-brand-700"
          >
            {index + 1 >= questions.length ? (
              "See results"
            ) : (
              <>
                Next <ArrowRight className="size-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Matching — match each word to its sentence
// ---------------------------------------------------------------------------

const MATCH_PER_ROUND = 5;

type MatchPair = { word: VocabWord; sentence: string };
type MatchRound = { pairs: MatchPair[]; sentenceOrder: number[] };

function buildMatchRounds(words: VocabWord[]): MatchRound[] {
  const usable = shuffle(words.filter((w) => exampleWith(w)));
  const rounds: MatchRound[] = [];
  for (let i = 0; i < usable.length; i += MATCH_PER_ROUND) {
    const chunk = usable.slice(i, i + MATCH_PER_ROUND);
    if (chunk.length < 2) break; // a lone pair isn't a match
    const pairs = chunk.map((w) => ({
      word: w,
      sentence: blankOut(exampleWith(w)!, w.word),
    }));
    // Shuffle the sentence column so answers aren't aligned.
    let order = shuffle(pairs.map((_, idx) => idx));
    let guard = 0;
    while (order.every((v, idx) => v === idx) && guard++ < 6) {
      order = shuffle(order);
    }
    rounds.push({ pairs, sentenceOrder: order });
  }
  return rounds;
}

function MatchWords({
  unitId,
  unitTitle,
}: {
  unitId: string;
  unitTitle?: string;
}) {
  const config = INTERACTIVE_CONFIG.match_words;
  const { words, phase, setPhase } = useDrillWords(unitId);
  const [rounds, setRounds] = useState<MatchRound[]>([]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  // sentenceSlot (position in sentenceOrder) -> word index it's assigned
  const [assign, setAssign] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);

  const totalPairs = useMemo(
    () => rounds.reduce((s, r) => s + r.pairs.length, 0),
    [rounds],
  );

  useEffect(() => {
    if (phase === "active" && rounds.length === 0) {
      const r = buildMatchRounds(words);
      if (r.length === 0) setPhase("not-enough");
      else setRounds(r);
    }
  }, [phase, words, rounds.length, setPhase]);

  const restart = useCallback(() => {
    setRounds(buildMatchRounds(words));
    setRoundIdx(0);
    setSelectedWord(null);
    setAssign({});
    setChecked(false);
    setScore(0);
    setPhase("active");
  }, [words, setPhase]);

  if (phase === "loading") return <Skeleton />;
  if (phase === "error")
    return <Notice title="Couldn’t load this exercise" body="Please try again." unitId={unitId} />;
  if (phase === "not-enough")
    return <Notice title="Not enough words yet" body="Matching needs at least 2 words with example sentences." unitId={unitId} words={words.length} />;
  if (phase === "results")
    return <Results score={score} total={totalPairs} unitId={unitId} exerciseType="match_words" onRetry={restart} />;
  if (rounds.length === 0) return <Skeleton />;

  const round = rounds[roundIdx];
  const usedWords = new Set(Object.values(assign));
  const allAssigned = Object.keys(assign).length === round.pairs.length;

  function assignSentence(slot: number) {
    if (checked) return;
    if (selectedWord === null) return;
    setAssign((a) => {
      const next: Record<number, number> = {};
      // remove this word from any previous slot, and clear this slot
      for (const [s, w] of Object.entries(a)) {
        if (w !== selectedWord && Number(s) !== slot) next[Number(s)] = w;
      }
      next[slot] = selectedWord;
      return next;
    });
    setSelectedWord(null);
  }

  function check() {
    let correct = 0;
    round.sentenceOrder.forEach((wordIdx, slot) => {
      if (assign[slot] === wordIdx) correct++;
    });
    setScore((s) => s + correct);
    setChecked(true);
  }
  function advance() {
    if (roundIdx + 1 >= rounds.length) setPhase("results");
    else {
      setRoundIdx((i) => i + 1);
      setSelectedWord(null);
      setAssign({});
      setChecked(false);
    }
  }

  const current = rounds
    .slice(0, roundIdx)
    .reduce((s, r) => s + r.pairs.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Header
        unitTitle={unitTitle}
        config={config}
        current={current + (checked ? round.pairs.length : Object.keys(assign).length)}
        total={totalPairs}
      />
      <Card className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {config.caption}
        </p>
        <p className="text-sm text-slate-600">
          Pick a word, then tap the sentence it belongs in.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Words column */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Words
          </h3>
          {round.pairs.map((p, wordIdx) => {
            const used = usedWords.has(wordIdx);
            const selected = selectedWord === wordIdx;
            return (
              <button
                key={wordIdx}
                type="button"
                disabled={checked}
                onClick={() => setSelectedWord(selected ? null : wordIdx)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-base font-medium transition-colors disabled:cursor-default ${
                  selected
                    ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30"
                    : used
                      ? "border-slate-200 bg-slate-50 text-slate-400"
                      : "border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                {p.word.word}
                {used && <Check className="size-4 text-slate-400" />}
              </button>
            );
          })}
        </div>

        {/* Sentences column */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sentences
          </h3>
          {round.sentenceOrder.map((wordIdx, slot) => {
            const assignedWord = assign[slot];
            const showWord =
              assignedWord !== undefined ? round.pairs[assignedWord].word.word : null;
            const isCorrect = checked && assignedWord === wordIdx;
            const isWrong =
              checked && assignedWord !== undefined && assignedWord !== wordIdx;
            return (
              <button
                key={slot}
                type="button"
                disabled={checked || selectedWord === null}
                onClick={() => assignSentence(slot)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-default ${
                  isCorrect
                    ? "border-success/40 bg-success/10"
                    : isWrong
                      ? "border-error/40 bg-error/10"
                      : selectedWord !== null && !checked
                        ? "border-brand-300 bg-white hover:border-brand-400 hover:bg-brand-50"
                        : "border-slate-200 bg-white"
                }`}
              >
                <span className="text-slate-800">
                  {round.pairs[wordIdx].sentence}
                </span>
                {showWord && (
                  <span
                    className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${
                      isWrong ? "text-error" : "text-brand-600"
                    }`}
                  >
                    → {showWord}
                    {checked &&
                      (isCorrect ? (
                        <Check className="size-3.5 text-success" />
                      ) : (
                        <X className="size-3.5 text-error" />
                      ))}
                    {checked && isWrong && (
                      <span className="ml-1 text-slate-500">
                        (answer: {round.pairs[wordIdx].word.word})
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {!checked ? (
          <button
            type="button"
            onClick={check}
            disabled={!allAssigned}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            onClick={advance}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-brand-700"
          >
            {roundIdx + 1 >= rounds.length ? (
              "See results"
            ) : (
              <>
                Next <ArrowRight className="size-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className="flex justify-between">
          <div className="h-4 w-32 rounded bg-slate-200/80" />
          <div className="h-4 w-16 rounded bg-slate-200/80" />
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100" />
      </div>
      <div className="h-24 rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="h-3 w-40 rounded bg-slate-200/70" />
        <div className="mt-3 h-6 w-3/4 rounded bg-slate-200/80" />
      </div>
      <span className="sr-only">Loading exercise…</span>
    </div>
  );
}
