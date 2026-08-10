// Browser-side reads for uploaded books (RLS-scoped anon client). Used by the
// student-facing pages. Returns empty/null when Supabase isn't configured so
// the localStorage prototype keeps working.

import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { uid } from "@/lib/store";
import { formatToQuestionType } from "@/lib/books";
import type { Question, Test } from "@/lib/types";
import type {
  BookGlossaryRow,
  BookPassageRow,
  BookQuestionRow,
  BookRow,
} from "@/lib/database.types";

export async function listBooks(): Promise<BookRow[]> {
  if (!SUPABASE_ENABLED) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data;
}

/** Delete an uploaded book (unit). Admin-gated on the server. */
export async function deleteBook(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/books?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Delete failed." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}

export type BookForRead = {
  book: BookRow;
  passages: BookPassageRow[];
  glossary: BookGlossaryRow[];
  questionCount: number;
  // Optional, additive: true when the corresponding query errored rather
  // than genuinely returning zero rows. `passages`/`glossary`/`questionCount`
  // are `[]`/0 in BOTH cases (a real empty book and a failed fetch look the
  // same in those fields on purpose, for backward compatibility) — callers
  // that want to distinguish "empty" from "couldn't load" must check these
  // flags. Absent/undefined must be treated as `false` (no error).
  passagesError?: boolean;
  glossaryError?: boolean;
  questionCountError?: boolean;
};

export async function getBookForRead(id: string): Promise<BookForRead | null> {
  if (!SUPABASE_ENABLED) return null;
  const supabase = createClient();
  const [
    { data: book, error: bookError },
    { data: passages, error: passagesError },
    { data: glossary, error: glossaryError },
    { count, error: countError },
  ] = await Promise.all([
    supabase.from("books").select("*").eq("id", id).single(),
    supabase.from("book_passages").select("*").eq("book_id", id).order("order"),
    supabase.from("book_glossary").select("*").eq("book_id", id).order("word"),
    supabase
      .from("book_questions")
      .select("id", { count: "exact", head: true })
      .eq("book_id", id),
  ]);
  // Fail closed: without the book row itself there is nothing safe to show.
  if (bookError || !book) return null;
  return {
    book,
    passages: passages ?? [],
    glossary: glossary ?? [],
    questionCount: count ?? 0,
    passagesError: Boolean(passagesError),
    glossaryError: Boolean(glossaryError),
    questionCountError: Boolean(countError),
  };
}

/**
 * A question book as an in-memory Test, so QuestionRunner can render it —
 * plus the book's passages (if any), so callers that need the source text
 * (e.g. the practice page, for comprehension questions) don't have to make
 * a second round trip. `passages` is `[]` both for question-only books
 * (Grammar/Vocabulary uploads, which genuinely have no `book_passages`
 * rows) AND when the `book_passages` query itself failed — check
 * `passagesError` to tell those two cases apart before treating a book as
 * "no article to show".
 */
export type BookAsTest = { test: Test; passages: BookPassageRow[]; passagesError: boolean };

export async function getBookAsTest(id: string): Promise<Test | null> {
  const result = await getBookAsTestWithPassages(id);
  return result?.test ?? null;
}

export async function getBookAsTestWithPassages(
  id: string,
): Promise<BookAsTest | null> {
  if (!SUPABASE_ENABLED) return null;
  const supabase = createClient();
  const [
    { data: book, error: bookError },
    { data: rows, error: rowsError },
    { data: passages, error: passagesError },
  ] = await Promise.all([
    supabase.from("books").select("*").eq("id", id).single(),
    supabase.from("book_questions").select("*").eq("book_id", id).order("order"),
    supabase.from("book_passages").select("*").eq("book_id", id).order("order"),
  ]);
  if (bookError || !book) return null;
  if (rowsError) return null;
  const questions = (rows ?? []).map(bookQuestionToQuestion);
  const test: Test = {
    id: book.id,
    title: book.title,
    description: book.description,
    questions,
    createdAt: Date.parse(book.created_at) || Date.now(),
    updatedAt: Date.parse(book.updated_at) || Date.now(),
  };
  return { test, passages: passages ?? [], passagesError: Boolean(passagesError) };
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

// Stored `choices`/`correct` are choice TEXT; single/multiple grading needs
// choice IDs, so re-issue ids and map the correct texts onto them.
function bookQuestionToQuestion(row: BookQuestionRow): Question {
  const type = formatToQuestionType(row.format) ?? "single";
  const choiceTexts = asStrings(row.choices);
  const correctTexts = asStrings(row.correct);

  if (type === "single" || type === "multiple") {
    const choices = choiceTexts.map((text) => ({ id: uid(), text }));
    const correct = choices
      .filter((c) => correctTexts.includes(c.text))
      .map((c) => c.id);
    return { id: row.id, type, prompt: row.prompt, choices, correct, points: row.points };
  }

  const correct =
    type === "boolean"
      ? [(correctTexts[0] ?? "true").toLowerCase()]
      : correctTexts;
  return { id: row.id, type, prompt: row.prompt, choices: [], correct, points: row.points };
}
