"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Card } from "@/components/ui";
import { QUIZ_CONFIG, type McExerciseType } from "@/lib/vocab";
import {
  getCollectedWords,
  getReadingPassage,
  getSourceTitle,
} from "@/lib/vocab-store";

// Vocabulary practice hub — the drills for one saved word set (a reading
// passage the student has collected words from).
export default function VocabPracticePage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = use(params);
  // Seeded passages live under /lexora/vocab/read; uploaded books under /books/read.
  const isSeeded = Boolean(getReadingPassage(sourceId));
  const readHref = isSeeded
    ? `/lexora/vocab/read/${sourceId}`
    : `/books/read/${sourceId}`;
  const exercises = Object.values(QUIZ_CONFIG);

  // Title + collected count are client-only (localStorage).
  const [title, setTitle] = useState("Saved words");
  const [wordCount, setWordCount] = useState(0);
  useEffect(() => {
    setTitle(getSourceTitle(sourceId));
    setWordCount(getCollectedWords(sourceId).length);
  }, [sourceId]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">
          Practice · Vocabulary
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="text-sm text-slate-600">
          {wordCount} saved {wordCount === 1 ? "word" : "words"} in this set.
        </p>
      </header>

      <Link
        href={readHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <BookOpen className="size-4" />
        Add more words from the text
      </Link>

      <div className="grid gap-3 sm:grid-cols-2">
        {exercises.map((ex) => (
          <ExerciseLink
            key={ex.exerciseType}
            sourceId={sourceId}
            type={ex.exerciseType}
            label={ex.label}
            caption={ex.caption}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseLink({
  sourceId,
  type,
  label,
  caption,
}: {
  sourceId: string;
  type: McExerciseType;
  label: string;
  caption: string;
}) {
  return (
    <Link
      href={`/practice/vocab/${sourceId}/${type}`}
      className="group block focus-visible:outline-none"
    >
      <Card className="flex h-full items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
        <div className="space-y-0.5">
          <h2 className="font-semibold text-slate-900">{label}</h2>
          <p className="text-sm text-slate-600">{caption}</p>
        </div>
        <ArrowRight className="size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
      </Card>
    </Link>
  );
}
