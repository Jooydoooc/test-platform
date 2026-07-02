"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BOOK,
  DEFAULT_CATEGORY,
  type Attempt,
  type Category,
  type Question,
  type Test,
} from "./types";

const TESTS_KEY = "tp.tests";
const ATTEMPTS_KEY = "tp.attempts";
// Bumped when new built-in seed tests are shipped, so existing users who were
// seeded earlier get them added on their next load (see loadTests).
const EEW1_SEED_FLAG = "tp.seed.eew1";

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
// Official target words + definitions for Units 1–5 (20 words each). Each unit
// becomes its own practice test of word→meaning multiple-choice questions.

type VocabWord = { w: string; pos: string; def: string };

const EEW1_BOOK1: { unit: number; words: VocabWord[] }[] = [
  {
    unit: 1,
    words: [
      { w: "agree", pos: "v.", def: "to have the same opinion or belief as another person" },
      { w: "alcohol", pos: "n.", def: "a type of drink that can make people drunk" },
      { w: "arrive", pos: "v.", def: "to get somewhere" },
      { w: "August", pos: "n.", def: "the eighth month of the year" },
      { w: "boat", pos: "n.", def: "a vehicle that moves across water" },
      { w: "breakfast", pos: "n.", def: "the morning meal" },
      { w: "camera", pos: "n.", def: "a piece of equipment that takes pictures" },
      { w: "capital", pos: "n.", def: "a city where a country’s government is based" },
      { w: "catch", pos: "v.", def: "to grab or get something" },
      { w: "duck", pos: "n.", def: "a small water bird" },
      { w: "enjoy", pos: "v.", def: "to like something" },
      { w: "invite", pos: "v.", def: "to ask someone to come to a place or event" },
      { w: "love", pos: "v.", def: "to like something or someone a lot" },
      { w: "month", pos: "n.", def: "one of 12 periods of time in one year" },
      { w: "travel", pos: "v.", def: "to go to a faraway place on vacation or business" },
      { w: "typical", pos: "adj.", def: "it is normal, or something that usually happens" },
      { w: "visit", pos: "v.", def: "to go and spend time in another place or see another person" },
      { w: "weather", pos: "n.", def: "the temperature and the state of the outdoors" },
      { w: "week", pos: "n.", def: "a period of time that is seven days long" },
      { w: "wine", pos: "n.", def: "an alcoholic drink made from grapes" },
    ],
  },
  {
    unit: 2,
    words: [
      { w: "adventure", pos: "n.", def: "a fun or exciting thing that you do" },
      { w: "approach", pos: "v.", def: "to move close to it" },
      { w: "carefully", pos: "adv.", def: "with great attention, especially to detail or safety" },
      { w: "chemical", pos: "n.", def: "something that scientists use in chemistry" },
      { w: "create", pos: "v.", def: "to make something new" },
      { w: "evil", pos: "adj.", def: "something or someone bad or cruel, not good" },
      { w: "experiment", pos: "n.", def: "a test that you do to see what will happen" },
      { w: "kill", pos: "v.", def: "to make them die" },
      { w: "laboratory", pos: "n.", def: "a room where a scientist works" },
      { w: "laugh", pos: "n.", def: "the sound made when someone is happy or a funny thing occurs" },
      { w: "loud", pos: "adj.", def: "strong and very easy to hear" },
      { w: "nervous", pos: "adj.", def: "they think something bad will happen" },
      { w: "noise", pos: "n.", def: "an unpleasant sound" },
      { w: "project", pos: "n.", def: "a type of work that you do for school or a job" },
      { w: "scare", pos: "v.", def: "to make them feel afraid" },
      { w: "secret", pos: "n.", def: "something that you do not tell other people" },
      { w: "shout", pos: "v.", def: "to say something loudly" },
      { w: "smell", pos: "v.", def: "to use your nose to sense it" },
      { w: "terrible", pos: "adj.", def: "it is very bad" },
      { w: "worse", pos: "adj.", def: "it is of poorer quality than another thing" },
    ],
  },
  {
    unit: 3,
    words: [
      { w: "alien", pos: "n.", def: "a creature from a different world" },
      { w: "among", pos: "prep.", def: "they are all around you" },
      { w: "chart", pos: "n.", def: "a list of information" },
      { w: "cloud", pos: "n.", def: "a group of water drops in the sky" },
      { w: "describe", pos: "v.", def: "to say or write what someone or something is like" },
      { w: "ever", pos: "adv.", def: "at any time" },
      { w: "fail", pos: "v.", def: "you do not succeed in what you try to do" },
      { w: "grade", pos: "n.", def: "a score or mark given to someone’s work" },
      { w: "instead", pos: "adv.", def: "in place of" },
      { w: "library", pos: "n.", def: "a place where you go to read books" },
      { w: "photograph", pos: "n.", def: "a representation of a person or scene in the form of a print" },
      { w: "planet", pos: "n.", def: "a large round thing in space" },
      { w: "report", pos: "n.", def: "something someone writes for school or work" },
      { w: "several", pos: "adj.", def: "more than two but not many" },
      { w: "shape", pos: "n.", def: "the arrangement of its sides and surfaces" },
      { w: "solve", pos: "v.", def: "to find an answer to it" },
      { w: "suddenly", pos: "adv.", def: "it happens quickly and unexpectedly" },
      { w: "suppose", pos: "v.", def: "to guess" },
      { w: "understand", pos: "v.", def: "you need to know what it means" },
      { w: "view", pos: "v.", def: "to look at something" },
    ],
  },
  {
    unit: 4,
    words: [
      { w: "appropriate", pos: "adj.", def: "it is right or normal" },
      { w: "avoid", pos: "v.", def: "to stay away from it" },
      { w: "behave", pos: "v.", def: "to act in a particular way, especially to be good" },
      { w: "calm", pos: "adj.", def: "they do not get excited or upset" },
      { w: "concern", pos: "n.", def: "a feeling of worry" },
      { w: "content", pos: "adj.", def: "to be happy and not want more" },
      { w: "expect", pos: "v.", def: "to happen, you believe it will happen" },
      { w: "frequently", pos: "adv.", def: "it happens often" },
      { w: "habit", pos: "n.", def: "a thing that you do often" },
      { w: "instruct", pos: "v.", def: "to teach" },
      { w: "issue", pos: "n.", def: "an important topic" },
      { w: "none", pos: "pron.", def: "not any of something" },
      { w: "patient", pos: "adj.", def: "they don’t become angry or upset easily" },
      { w: "positive", pos: "adj.", def: "it is good" },
      { w: "punish", pos: "v.", def: "to make someone suffer for breaking the rules or laws" },
      { w: "represent", pos: "v.", def: "to speak or act for a person or group" },
      { w: "shake", pos: "v.", def: "to move back and forth or up and down quickly" },
      { w: "spread", pos: "v.", def: "to move out to cover a larger area" },
      { w: "stroll", pos: "v.", def: "to walk slowly and calmly" },
      { w: "village", pos: "n.", def: "a very small town" },
    ],
  },
  {
    unit: 5,
    words: [
      { w: "active", pos: "adj.", def: "they move a lot or have a lot of things to do" },
      { w: "adult", pos: "n.", def: "a person who is more than 18 years old" },
      { w: "age", pos: "n.", def: "how many years someone has lived" },
      { w: "bad", pos: "adj.", def: "it is not good" },
      { w: "balance", pos: "n.", def: "when two or more things are equal" },
      { w: "bike", pos: "n.", def: "a vehicle with two wheels powered by a human" },
      { w: "choose", pos: "v.", def: "to pick something or make a decision" },
      { w: "doctor", pos: "n.", def: "a person who studies medicine and helps sick people" },
      { w: "during", pos: "prep.", def: "while the event was happening" },
      { w: "football", pos: "n.", def: "a sport with eleven members and an oval-shaped ball" },
      { w: "fun", pos: "adj.", def: "it is enjoyable" },
      { w: "game", pos: "n.", def: "an activity where people compete against each other" },
      { w: "heart", pos: "n.", def: "an organ that keeps the body alive" },
      { w: "golf", pos: "n.", def: "a sport with clubs and a small white ball" },
      { w: "increase", pos: "v.", def: "to make something larger" },
      { w: "life", pos: "n.", def: "the time when a person is alive" },
      { w: "kilometer", pos: "n.", def: "a unit of measurement that is 1,000 meters" },
      { w: "often", pos: "adv.", def: "when something happens many times" },
      { w: "plenty", pos: "pron.", def: "there is a lot of it" },
      { w: "weight", pos: "n.", def: "how heavy something or someone is" },
    ],
  },
];

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
    }
    return seeded;
  }
  // One-time backfill: users seeded before the vocabulary tests shipped get any
  // missing units added (existing edits/deletions of other tests are untouched).
  if (typeof window !== "undefined" && !window.localStorage.getItem(EEW1_SEED_FLAG)) {
    const have = new Set(existing.map((t) => t.id));
    const additions = buildVocabTests(Date.now()).filter((t) => !have.has(t.id));
    window.localStorage.setItem(EEW1_SEED_FLAG, "1");
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
  if (q.type === "short") {
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
