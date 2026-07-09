"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { Card } from "@/components/ui";
import {
  listReadingPassages,
  useCollections,
} from "@/lib/vocab-store";

// Vocabulary landing — read a passage, then double-tap words to save them.
// Saved words are grouped by source text and practised from the Practice page.
export default function VocabIndexPage() {
  const passages = listReadingPassages();
  const collections = useCollections();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">Vocabulary</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Read and collect words
        </h1>
        <p className="text-sm text-slate-600">
          Open a text and <strong>double-tap</strong> any highlighted word to
          save it. Your saved words are grouped by text and become drills on the
          Practice page.
        </p>
      </header>

      {/* Reading passages */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Reading texts
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {passages.map((p) => (
            <Link
              key={p.id}
              href={`/lexora/vocab/read/${p.id}`}
              className="group block focus-visible:outline-none"
            >
              <Card className="flex h-full items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
                    <BookOpen className="size-5" />
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-slate-900">{p.title}</h3>
                    <p className="text-sm text-slate-600">
                      {p.level} · {p.wordCount} words to learn
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* My Vocabulary */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          My vocabulary
        </h2>
        {collections.length === 0 ? (
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500 ring-1 ring-inset ring-amber-500/15">
                <Sparkles className="size-5" />
              </span>
              <p className="text-sm text-slate-600">
                You haven&apos;t saved any words yet. Open a text above and
                double-tap the words you want to learn.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {collections.map((c) => (
              <Link
                key={c.passageId}
                href={`/practice/vocab/${c.passageId}`}
                className="group block focus-visible:outline-none"
              >
                <Card className="flex h-full items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-900">
                      {c.title}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {c.wordCount} saved {c.wordCount === 1 ? "word" : "words"}
                      {c.wordCount < 4 && " · need 4+ to practise"}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600">
                    Practise
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
