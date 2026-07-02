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
  questions: Question[];
  createdAt: number;
  updatedAt: number;
}

/** Top-level Practice categories, in display order. */
export const CATEGORIES = ["Beginner", "Elementary", "Pre-Ielts"] as const;
export type Category = (typeof CATEGORIES)[number];

/** The category new/legacy tests fall into by default. */
export const DEFAULT_CATEGORY: Category = "Beginner";

/** The first book, always pinned to the front of the Practice book bar. */
export const DEFAULT_BOOK = "Essential 1";

/** Ordered list of book names: DEFAULT_BOOK first, then the rest as given. */
export function orderBooks(books: Iterable<string>): string[] {
  const rest = [...new Set(books)].filter((b) => b !== DEFAULT_BOOK).sort();
  return [DEFAULT_BOOK, ...rest];
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
}
