"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui";
import { QUIZ_CONFIG, type McExerciseType } from "@/lib/vocab";
import { getVocabUnit } from "@/lib/vocab-store";

// Unit vocab hub — entry point + "Back to unit" target for the MC exercises.
// Learn Cards / Sentence Order / Sentence Making will be added here later,
// consuming the same vocab data.
export default function VocabUnitPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);
  const unit = getVocabUnit(unitId);
  const wordCount = unit?.words.length ?? 0;
  const exercises = Object.values(QUIZ_CONFIG);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">Vocabulary practice</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {unit?.title ?? "Unit"}
        </h1>
        <p className="text-sm text-slate-600">
          {wordCount} {wordCount === 1 ? "word" : "words"} in this unit
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {exercises.map((ex) => (
          <ExerciseLink
            key={ex.exerciseType}
            unitId={unitId}
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
  unitId,
  type,
  label,
  caption,
}: {
  unitId: string;
  type: McExerciseType;
  label: string;
  caption: string;
}) {
  return (
    <Link
      href={`/lexora/vocab/${unitId}/${type}`}
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
