"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Dumbbell } from "lucide-react";
import { Card } from "@/components/ui";
import { listReadingPassages, listVocabUnits } from "@/lib/vocab-store";

// Vocabulary landing — read a passage, then double-tap words to save them.
// Saved words are grouped by source text and practised from the Practice page,
// which is the single home for your collected-word drills.
export default function VocabIndexPage() {
  const passages = listReadingPassages();
  const units = listVocabUnits();

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

      {/* Book units — every unit is a full practice set (8 exercise types). */}
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Practice by unit · 4000 Essential Words · Book 1
          </h2>
          <p className="text-sm text-slate-600">
            Each unit has 8 exercises — translation, definition, gap-filling,
            sentence building and matching.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/practice/vocab/${u.id}`}
              className="group block focus-visible:outline-none"
            >
              <Card className="flex h-full items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
                    <Dumbbell className="size-5" />
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-slate-900">{u.title}</h3>
                    <p className="text-sm text-slate-600">
                      {u.wordCount} words · 8 exercises
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Your saved words live on the Practice page (Practice owns the drills). */}
      <Link href="/practice" className="group block focus-visible:outline-none">
        <Card className="flex items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
          <p className="text-sm text-slate-600">
            Your saved words are grouped by text and become drills on the{" "}
            <strong className="font-semibold text-slate-900">Practice</strong>{" "}
            page.
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600">
            Go to Practice
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Card>
      </Link>
    </div>
  );
}
