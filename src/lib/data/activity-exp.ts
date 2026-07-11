"use server";

import { getServerUser } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// Server action: award EXP for a completed interactive vocab exercise, so the
// leaderboard reflects practice activity — not just graded tests. Called from
// the client when an exercise finishes (InteractiveExercises `Results`).
//
// Trust boundary: interactive exercises are graded on the client (there is no
// server-side answer key for them), so score/total are client-reported. We
// contain the blast radius: (1) EXP is only ever granted to the AUTHENTICATED
// caller — never a client-passed id; (2) it is capped at EXP_PER_EXERCISE; and
// (3) the (student_id, unique_key) ledger constraint grants each exercise once,
// so a completion can't be replayed for repeat EXP. A student can still earn by
// actually doing more distinct exercises — which is the point.
const EXP_PER_EXERCISE = 30;

export async function awardExerciseExp(
  unitId: string,
  exerciseType: string,
  score: number,
  total: number,
): Promise<number> {
  if (!SUPABASE_ENABLED) return 0;
  if (!unitId || !exerciseType) return 0;

  const user = await getServerUser().catch(() => null);
  if (!user || user.role !== "STUDENT") return 0;

  const pct = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const exp = Math.round(EXP_PER_EXERCISE * pct);
  if (exp <= 0) return 0;

  const admin = createAdminClient();
  await admin.from("points_ledger").upsert(
    {
      student_id: user.id,
      reason: "EXERCISE_EXP",
      points: exp,
      unique_key: `vocab-ex:${unitId}:${exerciseType}`,
    },
    { onConflict: "student_id,unique_key", ignoreDuplicates: true },
  );
  return exp;
}
