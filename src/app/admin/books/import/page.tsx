"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button, Card, LinkButton, inputClass } from "@/components/ui";
import { useSession } from "@/lib/auth";
import {
  BOOK_CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  isQuestionBook,
  type CreateBookPayload,
} from "@/lib/books";

type Result = { title: string; ok: boolean; error?: string };

// Loosely validate one entry and normalize it into a CreateBookPayload.
function coerce(raw: unknown): { payload?: CreateBookPayload; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Not an object." };
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return { error: "Missing title." };
  const contentType = o.contentType as CreateBookPayload["contentType"];
  if (!BOOK_CONTENT_TYPES.includes(contentType)) {
    return { error: `Invalid contentType "${String(o.contentType)}".` };
  }
  const questions = Array.isArray(o.questions)
    ? (o.questions as CreateBookPayload["questions"])
    : [];
  const glossary = Array.isArray(o.glossary)
    ? (o.glossary as CreateBookPayload["glossary"])
    : [];
  const passage =
    o.passage && typeof o.passage === "object"
      ? (o.passage as CreateBookPayload["passage"])
      : null;

  if (isQuestionBook(contentType) && questions.length === 0) {
    return { error: `${CONTENT_TYPE_LABELS[contentType]} needs questions.` };
  }
  if (!isQuestionBook(contentType) && !passage?.body?.trim()) {
    return { error: "Articles need passage text." };
  }

  return {
    payload: {
      title,
      contentType,
      level: (o.level as CreateBookPayload["level"]) ?? null,
      sourceFilename: typeof o.sourceFilename === "string" ? o.sourceFilename : null,
      questions,
      passage,
      glossary,
    },
  };
}

export default function BulkImportPage() {
  const { user, loading } = useSession();
  const isAdmin = user?.role === "admin";

  const [raw, setRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  // Parse the pasted JSON into normalized payloads + per-row problems.
  const parsed = useMemo(() => {
    const text = raw.trim();
    if (!text) return { items: [] as CreateBookPayload[], errors: [] as string[] };
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { items: [], errors: ["Invalid JSON."] };
    }
    const arr = Array.isArray(data) ? data : [data];
    const items: CreateBookPayload[] = [];
    const errors: string[] = [];
    arr.forEach((entry, i) => {
      const { payload, error } = coerce(entry);
      if (payload) items.push(payload);
      else errors.push(`Item ${i + 1}: ${error}`);
    });
    return { items, errors };
  }, [raw]);

  async function run() {
    setRunning(true);
    setResults([]);
    for (const payload of parsed.items) {
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      try {
        const res = await fetch("/api/books", { method: "POST", body: form });
        const data = (await res.json()) as { ok: boolean; error?: string };
        setResults((prev) => [
          ...prev,
          { title: payload.title, ok: res.ok && data.ok, error: data.error },
        ]);
      } catch {
        setResults((prev) => [
          ...prev,
          { title: payload.title, ok: false, error: "Network error." },
        ]);
      }
    }
    setRunning(false);
  }

  if (!loading && !isAdmin) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Bulk import is available to admins only.
        </p>
      </Card>
    );
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  const done = results.length;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/books"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Books &amp; units
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Bulk import units
        </h1>
        <p className="text-sm text-slate-600">
          Paste a JSON array of units. Each is created through the normal upload
          pipeline (same validation). Shape per item:{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
            {"{ title, contentType, level, questions[], passage, glossary[] }"}
          </code>
        </p>
      </div>

      <Card className="space-y-3">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm transition hover:border-brand-300 hover:bg-white">
          <span className="min-w-0 flex-1 truncate text-slate-600">
            Upload a .json file (or paste below)
          </span>
          <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-brand-600 ring-1 ring-inset ring-brand-200">
            Choose file
          </span>
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            disabled={running}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setRaw(await file.text());
            }}
          />
        </label>
        <textarea
          className={`${inputClass} min-h-[280px] font-mono text-xs`}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='[ { "title": "…", "contentType": "ARTICLES", "level": "ELEMENTARY", "passage": { "title": "…", "body": "…" }, "questions": [], "glossary": [] } ]'
          disabled={running}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {parsed.items.length} valid unit{parsed.items.length === 1 ? "" : "s"}
            {parsed.errors.length > 0 && (
              <span className="text-amber-700">
                {" "}
                · {parsed.errors.length} skipped
              </span>
            )}
          </p>
          <Button
            onClick={run}
            disabled={running || parsed.items.length === 0}
          >
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" /> Importing {done}/
                {parsed.items.length}…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Upload className="size-4" /> Import {parsed.items.length}
              </span>
            )}
          </Button>
        </div>

        {parsed.errors.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {parsed.errors.slice(0, 8).map((e, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {e}
              </li>
            ))}
            {parsed.errors.length > 8 && (
              <li>+ {parsed.errors.length - 8} more…</li>
            )}
          </ul>
        )}
      </Card>

      {results.length > 0 && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              {okCount} imported
              {failCount > 0 && <span className="text-red-600"> · {failCount} failed</span>}
            </h2>
            {!running && (
              <LinkButton href="/admin/books" variant="secondary">
                View in Books &amp; units
              </LinkButton>
            )}
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {results.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                {r.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0 text-red-500" />
                )}
                <span className="min-w-0 flex-1 truncate text-slate-700">{r.title}</span>
                {!r.ok && (
                  <span className="shrink-0 text-xs text-red-600">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
