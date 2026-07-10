"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { QuizShell } from "@/components/QuizShell";
import { InteractiveExercise } from "@/components/InteractiveExercises";
import { isInteractiveExerciseType, isMcExerciseType } from "@/lib/vocab";
import { getSourceTitle } from "@/lib/vocab-store";

// /practice/vocab/:sourceId/:exerciseType — drills over one word set (a book
// unit or a text the student collected words from). Multiple-choice types run
// through the shared QuizShell; interactive types have their own engines.
export default function VocabPracticeExercisePage({
  params,
}: {
  params: Promise<{ sourceId: string; exerciseType: string }>;
}) {
  const { sourceId, exerciseType } = use(params);
  const unitTitle = getSourceTitle(sourceId);

  if (isMcExerciseType(exerciseType)) {
    return (
      <QuizShell
        unitId={sourceId}
        exerciseType={exerciseType}
        unitTitle={unitTitle}
      />
    );
  }

  if (isInteractiveExerciseType(exerciseType)) {
    return (
      <InteractiveExercise
        unitId={sourceId}
        exerciseType={exerciseType}
        unitTitle={unitTitle}
      />
    );
  }

  notFound();
}
