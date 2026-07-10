"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BOOK,
  DEFAULT_CATEGORY,
  DEFAULT_TEST_GROUP,
  LEVEL_TESTS,
  type Attempt,
  type Category,
  type Question,
  type Test,
  type TestGroup,
} from "./types";
import { ESSENTIAL_WORDS_BOOK1 } from "./data/essential-words";

const TESTS_KEY = "tp.tests";
const ATTEMPTS_KEY = "tp.attempts";
// Bumped when new built-in seed tests are shipped, so existing users who were
// seeded earlier get them added on their next load (see loadTests).
const EEW1_SEED_FLAG = "tp.seed.eew1";
const GAP1_SEED_FLAG = "tp.seed.gap1";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- low-level persistence ----

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("tp.change"));
}

// ---- built-in vocabulary practice: 4000 Essential English Words, Book 1 ----
// Word data comes from the shared source (src/lib/data/essential-words.ts) so
// these quiz tests and the vocab drills never drift. Each unit becomes its own
// practice test of word→meaning multiple-choice questions.

type VocabWord = { w: string; pos: string; def: string };

const EEW1_BOOK1: { unit: number; words: VocabWord[] }[] =
  ESSENTIAL_WORDS_BOOK1.map((u) => ({
    unit: u.unit,
    words: u.words.map((word) => ({
      w: word.word,
      pos: word.part_of_speech,
      def: word.definition_en,
    })),
  }));

// Build one practice test per unit. For each word we ask for its meaning and
// draw three distractor definitions from other words in the same unit. Choices
// are placed deterministically (no Math.random) so the seeded data is stable
// across reloads rather than reshuffling every time.
function buildVocabTests(now: number): Test[] {
  const letters = ["a", "b", "c", "d"];
  return EEW1_BOOK1.map(({ unit, words }) => {
    const questions: Question[] = words.map((word, i) => {
      const distractors: VocabWord[] = [];
      let step = 1;
      while (distractors.length < 3) {
        const cand = words[(i + step * 7) % words.length];
        if (cand.w !== word.w && !distractors.includes(cand)) {
          distractors.push(cand);
        }
        step++;
      }
      const correctSlot = i % 4;
      let d = 0;
      const optionDefs = letters.map((_, slot) =>
        slot === correctSlot ? word.def : distractors[d++].def,
      );
      return {
        id: `u${unit}q${i + 1}`,
        type: "single" as const,
        prompt: `What does “${word.w}” (${word.pos}) mean?`,
        choices: letters.map((id, idx) => ({ id, text: optionDefs[idx] })),
        correct: [letters[correctSlot]],
        points: 1,
      };
    });
    return {
      id: `eew1-unit-${unit}`,
      title: `4000 Essential Words · Book 1 · Unit ${unit}`,
      description: `Vocabulary practice — choose the correct meaning for each of the 20 target words in Unit ${unit}.`,
      category: DEFAULT_CATEGORY,
      book: DEFAULT_BOOK,
      questions,
      createdAt: now,
      updatedAt: now,
    };
  });
}

// ---- built-in grammar gap-fill practice ----
// Single-blank fill-in-the-blank items. The blank is marked in the prompt with
// underscores; accepted answers live in `correct` (case-insensitive match).
function buildGapTest(now: number): Test {
  const items: Array<{ prompt: string; correct: string[]; explanation: string }> = [
    {
      prompt: "She ___ to school every morning.",
      correct: ["goes"],
      explanation: "Third-person singular in the present simple takes -s: he/she/it goes.",
    },
    {
      prompt: "They ___ watching a film at the moment.",
      correct: ["are"],
      explanation: "Present continuous with 'they' uses 'are' + verb-ing.",
    },
    {
      prompt: "I have lived in this city ___ 2015.",
      correct: ["since"],
      explanation: "'Since' marks a point in time; 'for' marks a length of time.",
    },
    {
      prompt: "If it rains tomorrow, we ___ stay at home.",
      correct: ["will", "'ll"],
      explanation: "First conditional: if + present simple, will + base verb.",
    },
    {
      prompt: "This is the ___ book I have ever read.",
      correct: ["best"],
      explanation: "The superlative of 'good' is 'best'.",
    },
    {
      prompt: "There aren't ___ apples left in the basket.",
      correct: ["any"],
      explanation: "Use 'any' with plural nouns in negative sentences.",
    },
    {
      prompt: "He was tired, ___ he went to bed early.",
      correct: ["so"],
      explanation: "'So' introduces a result; 'because' introduces a reason.",
    },
    {
      prompt: "I look forward ___ hearing from you.",
      correct: ["to"],
      explanation: "'Look forward to' is followed by a noun or verb-ing.",
    },
  ];
  const questions: Question[] = items.map((it, i) => ({
    id: `gap1q${i + 1}`,
    type: "gap" as const,
    prompt: it.prompt,
    choices: [],
    correct: it.correct,
    points: 1,
    explanation: it.explanation,
  }));
  return {
    id: "grammar-gap-1",
    title: "Grammar · Gap-Fill Practice",
    description: "Fill in the missing word to complete each sentence.",
    category: DEFAULT_CATEGORY,
    book: "Essential Grammar",
    group: "Grammar Tests",
    questions,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- seed data so the app isn't empty on first load ----

function seedTests(): Test[] {
  const now = Date.now();
  return [
    {
      id: "demo",
      title: "General Knowledge Sampler",
      description: "A short demo test covering each supported question type.",
      category: DEFAULT_CATEGORY,
      book: "General Knowledge",
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: "q1",
          type: "single",
          prompt: "What is the capital of France?",
          choices: [
            { id: "a", text: "Berlin" },
            { id: "b", text: "Paris" },
            { id: "c", text: "Madrid" },
            { id: "d", text: "Rome" },
          ],
          correct: ["b"],
          points: 1,
        },
        {
          id: "q2",
          type: "multiple",
          prompt: "Which of these are prime numbers? (select all)",
          choices: [
            { id: "a", text: "2" },
            { id: "b", text: "4" },
            { id: "c", text: "7" },
            { id: "d", text: "9" },
          ],
          correct: ["a", "c"],
          points: 2,
        },
        {
          id: "q3",
          type: "boolean",
          prompt: "The Earth orbits the Sun.",
          choices: [],
          correct: ["true"],
          points: 1,
        },
        {
          id: "q4",
          type: "short",
          prompt: "What gas do plants primarily absorb during photosynthesis?",
          choices: [],
          correct: ["carbon dioxide", "co2"],
          points: 1,
        },
      ],
    },
    ...buildVocabTests(now),
    buildGapTest(now),
  ];
}

// ---- public API ----

export function loadTests(): Test[] {
  const existing = read<Test[] | null>(TESTS_KEY, null);
  if (existing === null) {
    const seeded = seedTests();
    write(TESTS_KEY, seeded);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EEW1_SEED_FLAG, "1");
      window.localStorage.setItem(GAP1_SEED_FLAG, "1");
    }
    return seeded;
  }
  // One-time backfills: users seeded before a batch of built-in tests shipped
  // get the missing ones added (their edits/deletions of others are untouched).
  if (typeof window !== "undefined") {
    const have = new Set(existing.map((t) => t.id));
    const additions: Test[] = [];
    if (!window.localStorage.getItem(EEW1_SEED_FLAG)) {
      additions.push(
        ...buildVocabTests(Date.now()).filter((t) => !have.has(t.id)),
      );
      window.localStorage.setItem(EEW1_SEED_FLAG, "1");
    }
    if (!window.localStorage.getItem(GAP1_SEED_FLAG)) {
      const gap = buildGapTest(Date.now());
      if (!have.has(gap.id)) additions.push(gap);
      window.localStorage.setItem(GAP1_SEED_FLAG, "1");
    }
    if (additions.length > 0) {
      const merged = [...existing, ...additions];
      write(TESTS_KEY, merged);
      return merged;
    }
  }
  return existing;
}

export function saveTest(test: Test): void {
  const tests = loadTests();
  const idx = tests.findIndex((t) => t.id === test.id);
  const next = { ...test, updatedAt: Date.now() };
  if (idx >= 0) tests[idx] = next;
  else tests.push(next);
  write(TESTS_KEY, tests);
}

export function deleteTest(id: string): void {
  write(
    TESTS_KEY,
    loadTests().filter((t) => t.id !== id),
  );
}

export function getTest(id: string): Test | undefined {
  return loadTests().find((t) => t.id === id);
}

/**
 * The book a test belongs to. Falls back for tests seeded before the `book`
 * field existed (already in a user's localStorage), so no migration is needed.
 */
export function bookOf(test: Test): string {
  if (test.book) return test.book;
  if (test.id.startsWith("eew1")) return DEFAULT_BOOK;
  if (test.id === "demo") return "General Knowledge";
  return "Other";
}

/**
 * The Practice category a test belongs to. Legacy tests (seeded before the
 * `category` field existed) fall into the default category, so no migration is
 * needed for data already in a user's localStorage.
 */
export function categoryOf(test: Test): Category {
  return test.category ?? DEFAULT_CATEGORY;
}

/**
 * The Tests-page group a test belongs to. Uses the explicit `group` field when
 * set; otherwise infers one so legacy/seed data lands sensibly (vocabulary
 * units → Vocabulary Tests, titles matching a level test → Level Tests).
 */
export function groupOf(test: Test): TestGroup {
  if (test.group) return test.group;
  const title = test.title.toLowerCase();
  if (LEVEL_TESTS.some((n) => n.toLowerCase() === title)) return "Level Tests";
  if (test.id.startsWith("eew1")) return "Vocabulary Tests";
  return DEFAULT_TEST_GROUP;
}

// A few sample attempts so the leaderboard is meaningful before anyone plays.
function seedAttempts(): Attempt[] {
  const day = 86_400_000;
  const now = Date.now();
  const rows: Array<
    [string, string, Attempt["level"], number, number]
  > = [
    ["Maya", "Class A", "Advanced", 5, 0.5],
    ["Leo", "Class A", "Intermediate", 4, 1.5],
    ["Priya", "Class B", "Advanced", 5, 2],
    ["Tom", "Class B", "Beginner", 2, 1],
    ["Ana", "Class A", "Beginner", 3, 3],
    ["Ken", "Class B", "Intermediate", 4, 2.5],
  ];
  return rows.map(([takerName, group, level, score, daysAgo], i) => ({
    id: `seed-${i}`,
    testId: "demo",
    testTitle: "General Knowledge Sampler",
    takerName,
    group,
    level,
    answers: {},
    score,
    maxScore: 5,
    submittedAt: now - daysAgo * day,
  }));
}

export function loadAttempts(): Attempt[] {
  const existing = read<Attempt[] | null>(ATTEMPTS_KEY, null);
  if (existing === null) {
    const seeded = seedAttempts();
    write(ATTEMPTS_KEY, seeded);
    return seeded;
  }
  return existing;
}

export function saveAttempt(attempt: Attempt): void {
  write(ATTEMPTS_KEY, [attempt, ...loadAttempts()]);
}

// ---- grading ----

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Returns points earned for one question given the taker's answer. */
export function gradeQuestion(q: Question, answer: string[] = []): number {
  // short and gap both match a typed answer against accepted answers.
  if (q.type === "short" || q.type === "gap") {
    const given = norm(answer[0] ?? "");
    return given && q.correct.some((c) => norm(c) === given) ? q.points : 0;
  }
  if (q.type === "boolean" || q.type === "single") {
    return answer.length === 1 && answer[0] === q.correct[0] ? q.points : 0;
  }
  // multiple: exact set match required
  const a = [...answer].sort().join(",");
  const b = [...q.correct].sort().join(",");
  return a === b && a !== "" ? q.points : 0;
}

export function maxScore(test: Test): number {
  return test.questions.reduce((sum, q) => sum + q.points, 0);
}

export function gradeTest(
  test: Test,
  answers: Record<string, string[]>,
): number {
  return test.questions.reduce(
    (sum, q) => sum + gradeQuestion(q, answers[q.id]),
    0,
  );
}

// ---- reactive hooks ----

function useStoreValue<T>(getter: () => T): T {
  const [value, setValue] = useState<T>(getter);
  const refresh = useCallback(() => setValue(getter()), [getter]);
  useEffect(() => {
    refresh();
    window.addEventListener("tp.change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("tp.change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);
  return value;
}

export function useTests(): Test[] {
  return useStoreValue(loadTests);
}

export function useAttempts(): Attempt[] {
  return useStoreValue(loadAttempts);
}
