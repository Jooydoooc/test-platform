import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// EXP config + awarding. This is NOT a "use server" action module: awardTestExp
// takes a studentId and must never be a client-callable endpoint (a student
// could otherwise grant themselves EXP). It is called only from trusted server
// code (submit.ts) after real grading.

// EXP awarded per test, config-driven (points are tunable per spec, never
// hardcoded across features). A test grants up to EXP_PER_TEST, scaled by the
// student's overall accuracy — score-proportional, granted once.
export const EXP_PER_TEST = 100;

export function computeTestExp(accuracy: number): number {
  const a = Math.max(0, Math.min(1, accuracy));
  return Math.round(EXP_PER_TEST * a);
}

/** The ledger dedupe key for a test's EXP: enforces "awarded once per test". */
export function testExpKey(testId: string): string {
  return `test-exp:${testId}`;
}

// Award test EXP once, into the append-only ledger. The (student_id, unique_key)
// constraint makes a re-award a no-op, so a replayed submit never double-grants.
// Placement tests are diagnostic and grant no EXP. Uses the service role because
// points_ledger is read-only to clients.
//
// Returns the XP actually written this call: >0 on a fresh grant, 0 on a
// duplicate (already earned) or a write error. Callers must not report XP to
// the student unless this returns >0.
export async function awardTestExp(
  studentId: string,
  testId: string,
  accuracy: number,
): Promise<number> {
  const exp = computeTestExp(accuracy);
  if (exp <= 0) return 0;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("points_ledger")
    .upsert(
      {
        student_id: studentId,
        reason: "TEST_EXP",
        points: exp,
        unique_key: testExpKey(testId),
      },
      { onConflict: "student_id,unique_key", ignoreDuplicates: true },
    )
    .select("id");
  // On a write error or a dedupe (empty data), report 0 — don't tell the
  // student they earned XP that was never recorded.
  if (error || !data || data.length === 0) return 0;
  return exp;
}
