"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Sparkles, X } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { getBookForRead, type BookForRead } from "@/lib/books-client";
import { CONTENT_TYPE_LABELS } from "@/lib/books";
import {
  addExternalWord,
  getCollectedEntries,
  normalizeWord,
  removeCollectedWord,
} from "@/lib/vocab-store";
import type { BookGlossaryRow } from "@/lib/database.types";

const MIN_TO_PRACTISE = 4;

// Read an uploaded Reading/Articles book. Double-tapping a glossary word saves
// it (with its data) to the student's collection under the book id, so the
// Practice drills work exactly like seeded passages.
export default function BookReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<BookForRead | null | "missing">(null);
  const [collected, setCollected] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBookForRead(id)
      .then((d) => {
        if (!active) return;
        if (!d) {
          setData("missing");
          return;
        }
        setData(d);
        setCollected(getCollectedEntries(id).map((e) => e.wordKey));
      })
      .catch(() => setData("missing"));
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (data === "missing") router.replace("/books");
  }, [data, router]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);

  const targets = useMemo(() => {
    const m: Record<string, BookGlossaryRow> = {};
    if (data && data !== "missing") {
      for (const g of data.glossary) m[normalizeWord(g.word)] = g;
    }
    return m;
  }, [data]);

  const body =
    data && data !== "missing" ? (data.passages[0]?.body ?? "") : "";
  const tokens = useMemo(
    () => body.match(/[A-Za-z']+|[^A-Za-z']+/g) ?? [],
    [body],
  );

  if (!data || data === "missing") {
    return <p className="text-slate-500">Loading…</p>;
  }

  const book = data.book;
  const hasGlossary = data.glossary.length > 0;
  const hasQuestions = data.questionCount > 0;
  const collectedSet = new Set(collected);
  const canPractise = collected.length >= MIN_TO_PRACTISE;

  function onWord(token: string) {
    const key = normalizeWord(token);
    if (!key) return;
    const g = targets[key];
    if (!g) {
      setFlash(`“${token}” isn’t in the glossary`);
      return;
    }
    setCollected((prev) => {
      if (prev.includes(key)) {
        removeCollectedWord(id, key);
        return prev.filter((k) => k !== key);
      }
      addExternalWord(id, book.title, {
        word: g.word,
        definition_en: g.definition_en,
        translation_uz: g.translation_uz,
        example: g.example,
        part_of_speech: g.part_of_speech,
      });
      return [...prev, key];
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">
          {CONTENT_TYPE_LABELS[book.content_type]}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {book.title}
        </h1>
        <p className="text-sm text-slate-600">
          {hasGlossary ? (
            <>
              Double-tap a{" "}
              <span className="underline decoration-dotted decoration-brand-400 underline-offset-4">
                highlighted
              </span>{" "}
              word to save it. Tap again to remove it.
            </>
          ) : (
            "This book has no glossary, so it’s for reading only."
          )}
        </p>
      </header>

      {hasQuestions && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-brand-200 bg-brand-50/40">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Comprehension questions</p>
            <p className="text-sm text-slate-600">
              {data.questionCount} question{data.questionCount === 1 ? "" : "s"} on this
              passage.
            </p>
          </div>
          <LinkButton href={`/books/practice/${id}`} className="shrink-0 gap-1.5">
            Practise
            <ArrowRight className="size-4" />
          </LinkButton>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="text-[17px] leading-9 text-slate-800">
          <p>
            {tokens.map((tok, i) => {
              const key = normalizeWord(tok);
              const isTarget = Boolean(key && targets[key]);
              if (!isTarget) return <span key={i}>{tok}</span>;
              const active = collectedSet.has(key);
              return (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  onDoubleClick={() => onWord(tok)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onWord(tok);
                    }
                  }}
                  title={active ? "Saved — tap to remove" : "Double-tap to save"}
                  className={`cursor-pointer touch-manipulation select-none rounded px-0.5 underline decoration-dotted underline-offset-4 transition-colors ${
                    active
                      ? "bg-brand-600 text-white decoration-transparent"
                      : "decoration-brand-400 hover:bg-brand-50"
                  }`}
                >
                  {tok}
                </span>
              );
            })}
          </p>
        </Card>

        {hasGlossary && (
          <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Saved ({collected.length})
            </h2>

            {collected.length === 0 ? (
              <Card className="text-sm text-slate-600">
                <div className="flex items-center gap-2 text-slate-500">
                  <Sparkles className="size-4 text-amber-400" />
                  No words saved yet.
                </div>
              </Card>
            ) : (
              <Card className="space-y-1.5 p-2">
                {collected.map((key) => {
                  const g = targets[key];
                  if (!g) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {g.word}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {g.translation_uz || g.definition_en}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onWord(g.word)}
                        aria-label={`Remove ${g.word}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </Card>
            )}

            {canPractise ? (
              <LinkButton
                href={`/practice/vocab/${id}`}
                className="w-full justify-center gap-1.5"
              >
                Practise these
                <ArrowRight className="size-4" />
              </LinkButton>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-center text-xs text-slate-500">
                Save {MIN_TO_PRACTISE - collected.length} more to start practising.
              </p>
            )}
          </aside>
        )}
      </div>

      {!hasGlossary && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Info className="size-3.5 shrink-0" /> Add a glossary CSV when uploading
          to make words saveable and drillable.
        </p>
      )}

      {flash && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {flash}
        </div>
      )}
    </div>
  );
}
