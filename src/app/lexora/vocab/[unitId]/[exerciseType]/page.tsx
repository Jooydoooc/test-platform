import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuizShell } from "@/components/QuizShell";
import { isMcExerciseType } from "@/lib/vocab";

// /lexora/vocab/:unitId/:exerciseType — renders the config-driven QuizShell.
export default async function VocabExercisePage({
  params,
}: {
  params: Promise<{ unitId: string; exerciseType: string }>;
}) {
  const { unitId, exerciseType } = await params;
  if (!isMcExerciseType(exerciseType)) notFound();

  // Unit title is cosmetic (shown in the quiz header); a failure must not block.
  let unitTitle: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("units")
      .select("title")
      .eq("id", unitId)
      .single();
    unitTitle = data?.title ?? undefined;
  } catch {
    // ignore — render without the title
  }

  return (
    <QuizShell
      unitId={unitId}
      exerciseType={exerciseType}
      unitTitle={unitTitle}
    />
  );
}
