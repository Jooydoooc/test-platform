// Shared helpers for uploaded books — used by the upload UI, the API route, and
// (later) the student-facing display. Framework-agnostic (no client/server-only).

import type { QuestionType } from "@/lib/types";
import type {
  BookContentType,
  Level,
  QuestionFormat,
} from "@/lib/database.types";

export const BOOK_CONTENT_TYPES: BookContentType[] = [
  "VOCABULARY",
  "GRAMMAR",
  "READING",
  "ARTICLES",
];

export const CONTENT_TYPE_LABELS: Record<BookContentType, string> = {
  VOCABULARY: "Vocabulary",
  GRAMMAR: "Grammar",
  READING: "Reading",
  ARTICLES: "Articles",
};

/**
 * Question units hold a drilling CSV (quiz items); Articles hold a text + glossary.
 * Reading uploads the AI-generated drilling CSV too — only Articles stay passage-based.
 */
export function isQuestionBook(type: BookContentType): boolean {
  return type === "GRAMMAR" || type === "VOCABULARY" || type === "READING";
}

export const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "ELEMENTARY", label: "Elementary" },
  { value: "PRE_IELTS", label: "Pre-IELTS" },
  { value: "IELTS_INTRODUCTION", label: "IELTS Introduction" },
  { value: "IELTS_GRADUATION", label: "IELTS Graduation" },
];

// The parser emits app-level QuestionTypes; the DB stores the richer
// question_format enum. Map between them at the write/read boundary.
export const QUESTION_TYPE_TO_FORMAT: Record<QuestionType, QuestionFormat> = {
  single: "MULTIPLE_CHOICE_SINGLE",
  multiple: "MULTIPLE_CHOICE_MULTI",
  boolean: "TRUE_FALSE",
  short: "SHORT_ANSWER",
  gap: "GAP_FILL",
};

const FORMAT_TO_QUESTION_TYPE: Partial<Record<QuestionFormat, QuestionType>> = {
  MULTIPLE_CHOICE_SINGLE: "single",
  MULTIPLE_CHOICE_MULTI: "multiple",
  TRUE_FALSE: "boolean",
  SHORT_ANSWER: "short",
  GAP_FILL: "gap",
};

/** Reverse map for rendering stored questions; undefined for unsupported formats. */
export function formatToQuestionType(
  format: QuestionFormat,
): QuestionType | undefined {
  return FORMAT_TO_QUESTION_TYPE[format];
}

// Request body the upload page sends (as the JSON `payload` part of the form).
export type CreateBookPayload = {
  title: string;
  contentType: BookContentType;
  level: Level | null;
  sourceFilename: string | null;
  questions: {
    type: QuestionType;
    prompt: string;
    choices: string[];
    correct: string[];
    points: number;
  }[];
  passage: { title: string; body: string } | null;
  glossary: {
    word: string;
    definition_en: string;
    translation_uz: string;
    example: string;
  }[];
};
