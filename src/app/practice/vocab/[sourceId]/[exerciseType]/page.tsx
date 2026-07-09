"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { QuizShell } from "@/components/QuizShell";
import { isMcExerciseType } from "@/lib/vocab";
import { getSourceTitle } from "@/lib/vocab-store";

// /practice/vocab/:sourceId/:exerciseType — drills over the student's saved
// words for one text, via the shared config-driven QuizShell.
export default function VocabPracticeExercisePage({
  params,
}: {
  params: Promise<{ sourceId: string; exerciseType: string }>;
}) {
  const { sourceId, exerciseType } = use(params);
  if (!isMcExerciseType(exerciseType)) notFound();

  const unitTitle = getSourceTitle(sourceId);

  return (
    <QuizShell
      unitId={sourceId}
      exerciseType={exerciseType}
      unitTitle={unitTitle}
    />
  );
}
