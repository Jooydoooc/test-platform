import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// EXP config + awarding. This is NOT a "use server" action module: these helpers
// take a studentId and must never be client-callable endpoints (a student could
// otherwise grant themselves EXP). They are called only from trusted server code
// (submit.ts / the finalize_test_attempt RPC, and the HTML-test submit route).

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

// NOTE: DB-test EXP is now awarded transactionally inside the finalize_test_attempt
// RPC (migration 0019), which reuses computeTestExp + testExpKey above. The former
// standalone awardTestExp() helper was removed as dead code once submit.ts moved to
// the RPC. awardHtmlTestExp below remains because the HTML-test submit route has no
// server-side attempt RPC yet.

/** The ledger dedupe key for an HTML test's EXP: enforces "awarded once per HTML test". */
export function htmlTestExpKey(htmlTestId: string): string {
  return `html-test-exp:${htmlTestId}`;
}

// Award HTML-test EXP once, into the append-only ledger. Identical contract to
// awardTestExp but keyed on htmlTestId so DB-test and HTML-test EXP are tracked
// separately and neither can dedupe the other. Uses the service role because
// points_ledger is read-only to clients.
//
// Returns the XP actually written this call: >0 on a fresh grant, 0 on a
// duplicate (already earned) or a write error. Callers must not report XP to
// the student unless this returns >0.
export async function awardHtmlTestExp(
  studentId: string,
  htmlTestId: string,
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
        unique_key: htmlTestExpKey(htmlTestId),
      },
      { onConflict: "student_id,unique_key", ignoreDuplicates: true },
    )
    .select("id");
  // On a write error or a dedupe (empty data), report 0 — don't tell the
  // student they earned XP that was never recorded.
  if (error || !data || data.length === 0) return 0;
  return exp;
}
