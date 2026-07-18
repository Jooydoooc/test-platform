import { NextResponse } from "next/server";
import { getServerUser, isAdminRole } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import {
  BOOK_CONTENT_TYPES,
  QUESTION_TYPE_TO_FORMAT,
  isQuestionBook,
  type CreateBookPayload,
} from "@/lib/books";

const BUCKET = "book-uploads";

// Create an uploaded book from an already-parsed payload. The client parses the
// CSV/text (see src/lib/upload/parse.ts) and previews it; this handler persists
// the book + child rows and, best-effort, the original file to Storage.
//
// Authorization is enforced HERE (fail closed). Writes go through the user's
// RLS-scoped client, so the books/book_* policies (is_teacher) are the real gate.
export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "Uploads require the Supabase backend (not configured)." },
      { status: 503 },
    );
  }

  const user = await getServerUser().catch(() => null);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: "Admin access required." },
      { status: 403 },
    );
  }

  // multipart/form-data: `payload` (JSON) + optional `file` (original upload).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  let payload: CreateBookPayload;
  try {
    payload = JSON.parse(String(form.get("payload") ?? "")) as CreateBookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid payload JSON." }, { status: 400 });
  }

  const problem = validate(payload);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });

  const supabase = await createClient();

  // 1) Insert the book row (created_by must equal auth.uid() per RLS).
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .insert({
      title: payload.title.trim(),
      content_type: payload.contentType,
      level: payload.level,
      source_filename: payload.sourceFilename,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (bookErr || !book) {
    return NextResponse.json(
      { ok: false, error: bookErr?.message ?? "Could not create the book." },
      { status: 500 },
    );
  }

  // 2) Child rows. Questions ship for question books and for Articles that
  //    carry a comprehension set; passage + glossary are Articles-only.
  if (payload.questions.length > 0) {
    const rows = payload.questions.map((q, i) => ({
      book_id: book.id,
      order: i,
      format: QUESTION_TYPE_TO_FORMAT[q.type],
      prompt: q.prompt,
      choices: q.choices,
      correct: q.correct,
      points: q.points,
    }));
    const { error } = await supabase.from("book_questions").insert(rows);
    if (error) return await rollback(supabase, book.id, error.message);
  }
  if (!isQuestionBook(payload.contentType)) {
    if (payload.passage) {
      const { error } = await supabase.from("book_passages").insert({
        book_id: book.id,
        title: payload.passage.title,
        body: payload.passage.body,
        order: 0,
      });
      if (error) return await rollback(supabase, book.id, error.message);
    }
    if (payload.glossary.length > 0) {
      const rows = payload.glossary.map((g) => ({ book_id: book.id, ...g }));
      const { error } = await supabase.from("book_glossary").insert(rows);
      if (error) return await rollback(supabase, book.id, error.message);
    }
  }

  // 3) Best-effort: stash the original file. Never fails the request.
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const path = `${user.id}/${book.id}/${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
    if (!error) {
      await supabase.from("books").update({ source_path: path }).eq("id", book.id);
    }
  }

  return NextResponse.json({ ok: true, id: book.id });
}

// Delete an uploaded book (unit). Admin-gated; RLS is the real gate. Child rows
// (questions/passages/glossary) drop via ON DELETE CASCADE; the stored original
// file is removed best-effort.
export async function DELETE(req: Request) {
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "Uploads require the Supabase backend (not configured)." },
      { status: 503 },
    );
  }

  const user = await getServerUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing book id." }, { status: 400 });
  }

  const supabase = await createClient();

  // Grab the stored file path before the row goes away, so we can clean up Storage.
  const { data: existing } = await supabase
    .from("books")
    .select("source_path")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (existing?.source_path) {
    await supabase.storage.from(BUCKET).remove([existing.source_path]);
  }

  return NextResponse.json({ ok: true });
}

function validate(p: CreateBookPayload): string | null {
  if (!p || typeof p !== "object") return "Missing payload.";
  if (!p.title?.trim()) return "Title is required.";
  if (!BOOK_CONTENT_TYPES.includes(p.contentType)) return "Invalid content type.";
  if (isQuestionBook(p.contentType)) {
    if (!Array.isArray(p.questions) || p.questions.length === 0) {
      return "This book needs at least one question.";
    }
  } else {
    const hasPassage = p.passage && p.passage.body.trim().length > 0;
    if (!hasPassage) return "Reading/Articles books need passage text.";
  }
  return null;
}

// The book row was created but a child insert failed — remove the orphan so a
// retry starts clean (cascades drop any partial child rows).
async function rollback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  message: string,
) {
  await supabase.from("books").delete().eq("id", bookId);
  return NextResponse.json(
    { ok: false, error: message || "Could not save book content." },
    { status: 500 },
  );
}
