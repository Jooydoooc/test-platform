"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui";
import {
  ALL_EXERCISE_ORDER,
  INTERACTIVE_CONFIG,
  QUIZ_CONFIG,
  isMcExerciseType,
  type AnyExerciseType,
} from "@/lib/vocab";
import {
  getReadingPassage,
  getSourceTitle,
  getVocabUnit,
  getVocabWords,
} from "@/lib/vocab-store";

// Vocabulary practice hub — the drills for one word set. A word set is either a
// built-in book unit (fixed words) or a text the student collected words from.
export default function VocabPracticePage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = use(params);
  const isUnit = Boolean(getVocabUnit(sourceId));
  const isSeededPassage = Boolean(getReadingPassage(sourceId));
  // Only collected-word sets (passages / uploaded books) let you add more.
  const readHref = isSeededPassage
    ? `/lexora/vocab/read/${sourceId}`
    : `/books/read/${sourceId}`;

  // Title + word count are client-only (localStorage / unit lookup).
  const [title, setTitle] = useState("Word set");
  const [wordCount, setWordCount] = useState(0);
  useEffect(() => {
    setTitle(getSourceTitle(sourceId));
    setWordCount(getVocabWords(sourceId).length);
  }, [sourceId]);

  const exercises = ALL_EXERCISE_ORDER.map((type) => {
    const cfg = isMcExerciseType(type)
      ? QUIZ_CONFIG[type]
      : INTERACTIVE_CONFIG[type];
    return { type, label: cfg.label, caption: cfg.caption };
  });

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
          {wordCount} {wordCount === 1 ? "word" : "words"} in this set · pick an
          exercise below.
        </p>
      </header>

      {!isUnit && (
        <Link
          href={readHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <BookOpen className="size-4" />
          Add more words from the text
        </Link>
      )}

      {/* Skills test — the graded assessment that earns XP, kept distinct from
          the practice drills below (which are for learning and earn no XP). */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Test your skills
        </h2>
        <Link
          href={`/practice/vocab/${sourceId}/test`}
          className="group block focus-visible:outline-none"
        >
          <Card className="flex h-full items-center justify-between gap-3 border-brand-200 bg-brand-50/40 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                <GraduationCap className="size-4" />
              </span>
              <div className="space-y-0.5">
                <h3 className="font-semibold text-slate-900">Skills test</h3>
                <p className="text-sm text-slate-600">
                  Graded check over this set · earns XP
                </p>
              </div>
            </div>
            <ArrowRight className="size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
          </Card>
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Practice exercises
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {exercises.map((ex) => (
            <ExerciseLink
              key={ex.type}
              sourceId={sourceId}
              type={ex.type}
              label={ex.label}
              caption={ex.caption}
            />
          ))}
        </div>
      </section>
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
  type: AnyExerciseType;
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
