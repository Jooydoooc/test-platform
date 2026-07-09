"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { QuizShell } from "@/components/QuizShell";
import { isMcExerciseType } from "@/lib/vocab";
import { getVocabUnit } from "@/lib/vocab-store";
import { useTests } from "@/lib/store";

// /lexora/vocab/:unitId/:exerciseType — renders the config-driven QuizShell.
export default function VocabExercisePage({
  params,
}: {
  params: Promise<{ unitId: string; exerciseType: string }>;
}) {
  const { unitId, exerciseType } = use(params);
  const testTitle = useTests().find((t) => t.id === unitId)?.title;
  if (!isMcExerciseType(exerciseType)) notFound();

  const unitTitle = getVocabUnit(unitId)?.title ?? testTitle;

  return (
    <QuizShell
      unitId={unitId}
      exerciseType={exerciseType}
      unitTitle={unitTitle}
    />
  );
}
