"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { QuizShell } from "@/components/QuizShell";
import { isMcExerciseType } from "@/lib/vocab";
import { getVocabUnit } from "@/lib/vocab-store";

// /lexora/vocab/:unitId/:exerciseType — renders the config-driven QuizShell.
export default function VocabExercisePage({
  params,
}: {
  params: Promise<{ unitId: string; exerciseType: string }>;
}) {
  const { unitId, exerciseType } = use(params);
  if (!isMcExerciseType(exerciseType)) notFound();

  const unitTitle = getVocabUnit(unitId)?.title;

  return (
    <QuizShell
      unitId={unitId}
      exerciseType={exerciseType}
      unitTitle={unitTitle}
    />
  );
}
