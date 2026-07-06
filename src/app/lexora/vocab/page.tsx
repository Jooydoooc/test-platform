"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Card } from "@/components/ui";
import { listVocabUnits } from "@/lib/vocab-store";

// Vocabulary landing — lists the units available for practice.
export default function VocabIndexPage() {
  const units = listVocabUnits();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">Vocabulary</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Practice your words
        </h1>
        <p className="text-sm text-slate-600">
          Pick a unit to run definition, translation, and gap-fill drills.
        </p>
      </header>

      {units.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No vocabulary units are available yet.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/lexora/vocab/${u.id}`}
              className="group block focus-visible:outline-none"
            >
              <Card className="flex h-full items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
                    <BookOpen className="size-5" />
                  </span>
                  <div className="space-y-0.5">
                    <h2 className="font-semibold text-slate-900">{u.title}</h2>
                    <p className="text-sm text-slate-600">
                      {u.wordCount} {u.wordCount === 1 ? "word" : "words"}
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
