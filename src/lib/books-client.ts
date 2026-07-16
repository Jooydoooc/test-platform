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
};

export async function getBookForRead(id: string): Promise<BookForRead | null> {
  if (!SUPABASE_ENABLED) return null;
  const supabase = createClient();
  const [{ data: book }, { data: passages }, { data: glossary }] =
    await Promise.all([
      supabase.from("books").select("*").eq("id", id).single(),
      supabase.from("book_passages").select("*").eq("book_id", id).order("order"),
      supabase.from("book_glossary").select("*").eq("book_id", id).order("word"),
    ]);
  if (!book) return null;
  return { book, passages: passages ?? [], glossary: glossary ?? [] };
}

/** A question book as an in-memory Test, so QuestionRunner can render it. */
export async function getBookAsTest(id: string): Promise<Test | null> {
  if (!SUPABASE_ENABLED) return null;
  const supabase = createClient();
  const [{ data: book }, { data: rows }] = await Promise.all([
    supabase.from("books").select("*").eq("id", id).single(),
    supabase.from("book_questions").select("*").eq("book_id", id).order("order"),
  ]);
  if (!book) return null;
  const questions = (rows ?? []).map(bookQuestionToQuestion);
  return {
    id: book.id,
    title: book.title,
    description: book.description,
    questions,
    createdAt: Date.parse(book.created_at) || Date.now(),
    updatedAt: Date.parse(book.updated_at) || Date.now(),
  };
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
