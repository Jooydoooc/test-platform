// Core domain types for the test platform.

export type QuestionType = "single" | "multiple" | "boolean" | "short";

export interface Choice {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  /** Choices for single/multiple. Empty for boolean/short. */
  choices: Choice[];
  /** IDs of correct choices (single/multiple), "true"/"false" (boolean),
   *  or accepted answer strings (short). */
  correct: string[];
  points: number;
}

export interface Test {
  id: string;
  title: string;
  description: string;
  /** Practice category / course level shown in the top Practice menu bar. */
  category?: Category;
  /** The book/collection this test belongs to, e.g. "Essential 1". */
  book?: string;
  /** The Tests-page group this test belongs to, e.g. "Grammar Tests". */
  group?: TestGroup;
  /** Time limit in minutes for a timed test. Omitted/0 means untimed. */
  durationMinutes?: number;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
}

/** Top-level Practice categories, in display order. */
export const CATEGORIES = [
  "Beginner",
  "Elementary",
  "Pre-IELTS",
  "IELTS Introduction",
  "IELTS Graduation",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The category new/legacy tests fall into by default. */
export const DEFAULT_CATEGORY: Category = "Beginner";

/** Top-level groups shown in the Tests-page left menu, in display order. */
export const TEST_GROUPS = [
  "Level Tests",
  "Grammar Tests",
  "Vocabulary Tests",
  "Reading Tests",
  "Listening Tests",
  "Writing Tests",
] as const;
export type TestGroup = (typeof TEST_GROUPS)[number];

/** The group new/legacy tests fall into by default. */
export const DEFAULT_TEST_GROUP: TestGroup = "Level Tests";

/**
 * The four fixed level tests nested under the "Level Tests" group. They appear
 * in the menu even before a matching test exists; a test joins one when its
 * title matches (case-insensitive) or it sets `group: "Level Tests"`.
 */
export const LEVEL_TESTS = [
  "Beginner Level Test",
  "Elementary Level Test",
  "Pre-IELTS Level Test",
  "IELTS Level Test",
] as const;

/** The first book, always pinned to the front of the Practice book bar. */
export const DEFAULT_BOOK = "Essential 1";

/**
 * The book/course catalog shown in each Practice level's left-side menu.
 * These appear even before any test is assigned to them; books that have
 * tests but aren't listed here are appended after the catalog.
 */
export const BOOKS_BY_CATEGORY: Record<Category, string[]> = {
  Beginner: [
    "Round Up 2",
    "Essential Grammar",
    "Vocabulary Book 1",
    "Beginner Reading Practice",
  ],
  Elementary: [
    "Grammarway 2",
    "Solutions Elementary",
    "Tactics for Listening Basic",
    "Vocabulary Practice",
  ],
  "Pre-IELTS": [
    "Reading Skills",
    "Listening Skills",
    "Writing Basics",
    "Speaking Topics",
  ],
  "IELTS Introduction": [
    "Cambridge Practice",
    "Task 1 Practice",
    "Task 2 Practice",
    "Speaking Part 1/2/3",
  ],
  "IELTS Graduation": [
    "Full IELTS Practice",
    "Advanced Reading",
    "Advanced Listening",
    "Band 7+ Writing",
    "Band 7+ Speaking",
  ],
};

/**
 * Ordered book list for a category: the fixed catalog first, then any extra
 * books that have tests but aren't in the catalog (e.g. legacy seed data).
 */
export function orderBooks(
  category: Category,
  booksWithTests: Iterable<string>,
): string[] {
  const catalog = BOOKS_BY_CATEGORY[category] ?? [];
  const extras = [...new Set(booksWithTests)]
    .filter((b) => !catalog.includes(b))
    .sort();
  return [...catalog, ...extras];
}

/** Proficiency / difficulty levels used to categorise leaderboard entries. */
export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type Level = (typeof LEVELS)[number];

export interface Attempt {
  id: string;
  testId: string;
  testTitle: string;
  takerName: string;
  /** Cohort / class the taker belongs to, e.g. "Class A". Optional. */
  group?: string;
  /** Proficiency level the taker entered. Optional. */
  level?: Level;
  /** questionId -> selected choice ids / answer strings */
  answers: Record<string, string[]>;
  score: number;
  maxScore: number;
  submittedAt: number;
  /** Seconds the taker spent on a timed test. Omitted for untimed tests. */
  timeTakenSec?: number;
  /** True when the test was auto-submitted because the timer ran out. */
  timedOut?: boolean;
}
