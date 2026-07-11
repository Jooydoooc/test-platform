"use server";

import { getServerUser } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// Server action: award EXP for a completed vocabulary SKILLS TEST (not the
// practice exercises). Called from the client when the test finishes (QuizShell
// in test mode). Practice drills grant no EXP — only the skills test does.
//
// Trust boundary: the vocab test is graded on the client (there is no server-side
// answer key for the word set), so score/total are client-reported. We contain
// the blast radius: (1) EXP is only ever granted to the AUTHENTICATED caller —
// never a client-passed id; (2) it is capped at EXP_PER_VOCAB_TEST; and (3) the
// (student_id, unique_key) ledger constraint grants each unit's test once, so a
// retake can't be replayed for repeat EXP.
const EXP_PER_VOCAB_TEST = 100;

export async function awardVocabTestExp(
  unitId: string,
  score: number,
  total: number,
): Promise<number> {
  if (!SUPABASE_ENABLED) return 0;
  if (!unitId) return 0;

  const user = await getServerUser().catch(() => null);
  if (!user || user.role !== "STUDENT") return 0;

  const pct = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const exp = Math.round(EXP_PER_VOCAB_TEST * pct);
  if (exp <= 0) return 0;

  const admin = createAdminClient();
  await admin.from("points_ledger").upsert(
    {
      student_id: user.id,
      reason: "VOCAB_TEST_EXP",
      points: exp,
      unique_key: `vocab-test:${unitId}`,
    },
    { onConflict: "student_id,unique_key", ignoreDuplicates: true },
  );
  return exp;
}
