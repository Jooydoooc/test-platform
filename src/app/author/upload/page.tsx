"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { Button, Card, Field, LinkButton, inputClass } from "@/components/ui";
import { useSession, SUPABASE_ENABLED } from "@/lib/auth";
import {
  BOOK_CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  LEVEL_OPTIONS,
  isQuestionBook,
  type CreateBookPayload,
} from "@/lib/books";
import {
  GLOSSARY_CSV_TEMPLATE,
  QUESTIONS_CSV_TEMPLATE,
  parseGlossaryCsv,
  parseQuestionsCsv,
  readTextFile,
  type ParsedGlossaryWord,
  type ParsedQuestion,
} from "@/lib/upload/parse";
import type { BookContentType, Level } from "@/lib/database.types";

type SubmitState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "done"; id: string }
  | { phase: "error"; message: string };

function downloadTemplate(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function UploadBookPage() {
  const { user } = useSession();

  const [contentType, setContentType] = useState<BookContentType>("GRAMMAR");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<Level | "">("");

  // Question-book state
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [questionErrors, setQuestionErrors] = useState<string[]>([]);

  // Reading-book state
  const [passageText, setPassageText] = useState("");
  const [glossary, setGlossary] = useState<ParsedGlossaryWord[]>([]);
  const [glossaryErrors, setGlossaryErrors] = useState<string[]>([]);

  // The original file we stash in Storage (primary input for the category).
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });
  const formTopRef = useRef<HTMLDivElement>(null);

  const isQuestion = isQuestionBook(contentType);

  const canSubmit = useMemo(() => {
    if (!title.trim() || submit.phase === "saving") return false;
    return isQuestion ? questions.length > 0 : passageText.trim().length > 0;
  }, [title, isQuestion, questions.length, passageText, submit.phase]);

  function resetContent() {
    setQuestions([]);
    setQuestionErrors([]);
    setPassageText("");
    setGlossary([]);
    setGlossaryErrors([]);
    setPrimaryFile(null);
    setSubmit({ phase: "idle" });
  }

  async function onQuestionsFile(file: File | null) {
    if (!file) return;
    const text = await readTextFile(file);
    const res = parseQuestionsCsv(text);
    setQuestions(res.items);
    setQuestionErrors(res.errors);
    setPrimaryFile(file);
    setSubmit({ phase: "idle" });
  }

  async function onPassageFile(file: File | null) {
    if (!file) return;
    const text = await readTextFile(file);
    setPassageText(text);
    setPrimaryFile(file);
    setSubmit({ phase: "idle" });
  }

  async function onGlossaryFile(file: File | null) {
    if (!file) return;
    const text = await readTextFile(file);
    const res = parseGlossaryCsv(text);
    setGlossary(res.items);
    setGlossaryErrors(res.errors);
    setSubmit({ phase: "idle" });
  }

  async function handleSave() {
    setSubmit({ phase: "saving" });
    const payload: CreateBookPayload = {
      title: title.trim(),
      contentType,
      level: level || null,
      sourceFilename: primaryFile?.name ?? null,
      questions: isQuestion ? questions : [],
      passage: isQuestion
        ? null
        : { title: title.trim(), body: passageText.trim() },
      glossary: isQuestion ? [] : glossary,
    };

    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    if (primaryFile) form.append("file", primaryFile);

    try {
      const res = await fetch("/api/books", { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; id?: string; error?: string };
      if (!res.ok || !data.ok) {
        setSubmit({ phase: "error", message: data.error ?? "Upload failed." });
      } else {
        setSubmit({ phase: "done", id: data.id ?? "" });
      }
    } catch {
      setSubmit({ phase: "error", message: "Network error — please try again." });
    }
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (user?.role !== "teacher") {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Uploading books is available to admins only.
        </p>
      </Card>
    );
  }

  return (
    <div ref={formTopRef} className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Upload a book
          </h1>
          <p className="text-sm text-slate-600">
            Add a book and tag it with a category. Grammar & Vocabulary take a
            questions CSV; Reading & Articles take a text plus a glossary CSV.
          </p>
        </div>
        <LinkButton href="/author" variant="secondary">
          Back
        </LinkButton>
      </div>

      {!SUPABASE_ENABLED && (
        <Banner tone="warn">
          The Supabase backend isn&apos;t configured, so saving is disabled.
          Set the Supabase env vars to enable uploads.
        </Banner>
      )}

      {submit.phase === "done" && (
        <Banner tone="ok">
          Book saved.{" "}
          <Link href="/books" className="font-semibold underline">
            View in Books
          </Link>{" "}
          or{" "}
          <button
            type="button"
            onClick={() => {
              setTitle("");
              resetContent();
            }}
            className="font-semibold underline"
          >
            upload another
          </button>
          .
        </Banner>
      )}
      {submit.phase === "error" && <Banner tone="warn">{submit.message}</Banner>}

      {/* Meta */}
      <Card className="space-y-4">
        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {BOOK_CONTENT_TYPES.map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => {
                  setContentType(ct);
                  resetContent();
                }}
                aria-pressed={ct === contentType}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  ct === contentType
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {CONTENT_TYPE_LABELS[ct]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Essential Grammar — Unit 1"
          />
        </Field>

        <Field label="Level (optional)">
          <select
            className={`${inputClass} sm:w-64`}
            value={level}
            onChange={(e) => setLevel(e.target.value as Level | "")}
          >
            <option value="">No level</option>
            {LEVEL_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {/* Content */}
      {isQuestion ? (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Questions</h2>
            <button
              type="button"
              onClick={() => downloadTemplate("questions-template.csv", QUESTIONS_CSV_TEMPLATE)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Download className="size-4" /> Template
            </button>
          </div>
          <FileDrop
            accept=".csv,text/csv"
            label="Upload a questions CSV"
            onFile={onQuestionsFile}
          />
          {questionErrors.length > 0 && <IssueList issues={questionErrors} />}
          {questions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Preview · {questions.length} question
                {questions.length === 1 ? "" : "s"}
              </p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {questions.slice(0, 8).map((q, i) => (
                  <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      {q.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {q.prompt}
                    </span>
                  </li>
                ))}
              </ul>
              {questions.length > 8 && (
                <p className="text-xs text-slate-400">
                  + {questions.length - 8} more
                </p>
              )}
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <h2 className="font-semibold text-slate-900">Reading text</h2>
            <FileDrop
              accept=".txt,.md,text/plain,text/markdown"
              label="Upload a .txt / .md file"
              onFile={onPassageFile}
            />
            <p className="text-center text-xs text-slate-400">or paste below</p>
            <textarea
              className={`${inputClass} min-h-[160px]`}
              value={passageText}
              onChange={(e) => {
                setPassageText(e.target.value);
                setSubmit({ phase: "idle" });
              }}
              placeholder="Paste the reading passage here…"
            />
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Glossary</h2>
                <p className="text-sm text-slate-600">
                  Words students can save &amp; drill. Optional but recommended.
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadTemplate("glossary-template.csv", GLOSSARY_CSV_TEMPLATE)}
                className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                <Download className="size-4" /> Template
              </button>
            </div>
            <FileDrop
              accept=".csv,text/csv"
              label="Upload a glossary CSV"
              onFile={onGlossaryFile}
            />
            {glossaryErrors.length > 0 && <IssueList issues={glossaryErrors} />}
            {glossary.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview · {glossary.length} word{glossary.length === 1 ? "" : "s"}
                </p>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {glossary.slice(0, 8).map((g, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-800">{g.word}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-500">
                        {g.translation_uz || g.definition_en}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button onClick={handleSave} disabled={!canSubmit || !SUPABASE_ENABLED}>
          {submit.phase === "saving" ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-4 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Upload className="size-4" /> Save book
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

function FileDrop({
  accept,
  label,
  onFile,
}: {
  accept: string;
  label: string;
  onFile: (file: File | null) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm transition hover:border-brand-300 hover:bg-white">
      <FileText className="size-5 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate text-slate-600">
        {name ?? label}
      </span>
      <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-brand-600 ring-1 ring-inset ring-brand-200">
        Choose file
      </span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setName(file?.name ?? null);
          onFile(file);
        }}
      />
    </label>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
        <AlertTriangle className="size-3.5" /> {issues.length} row
        {issues.length === 1 ? "" : "s"} skipped
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
        {issues.slice(0, 6).map((e, i) => (
          <li key={i}>{e}</li>
        ))}
        {issues.length > 6 && <li>+ {issues.length - 6} more…</li>}
      </ul>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {tone === "ok" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
