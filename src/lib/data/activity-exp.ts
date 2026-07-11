"use server";

import { getServerUser } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { ESSENTIAL_WORDS_BOOK1 } from "@/lib/data/essential-words";

// The only units that ship a graded skills test are the seeded vocab units
// (eew1-u1 … eew1-uN). Deriving the allow-list from the same seed the client
// drills over keeps them from drifting. Reading/collected sources have no
// fixed word set and grant no test XP, so they are intentionally excluded.
const VALID_TEST_UNIT_IDS = new Set(
  ESSENTIAL_WORDS_BOOK1.map((u) => `eew1-u${u.unit}`),
);

// Result of an award attempt. `0` used to be overloaded to mean "granted zero",
// "already earned", "not eligible" AND "write failed" — callers could not tell a
// dedupe from a network error. This makes each outcome explicit.
// Not exported: a "use server" file may only export async functions. Clients
// that need this shape derive it via `Awaited<ReturnType<typeof awardVocabTestExp>>`.
type VocabTestExpResult =
  | { status: "granted"; xp: number } // XP written now
  | { status: "duplicate" } // already earned on a prior attempt (deduped)
  | { status: "ineligible" } // disabled / not a student / unknown unit / zero score
  | { status: "error" }; // the write failed — nothing was recorded

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
): Promise<VocabTestExpResult> {
  if (!SUPABASE_ENABLED) return { status: "ineligible" };
  // Reject unknown/invented unit ids. score/total are client-reported (there is
  // no server answer key), so without this a student could POST arbitrary ids
  // and mint EXP_PER_VOCAB_TEST for each new dedupe key — unbounded. Pinning to
  // real seeded units caps the total to EXP_PER_VOCAB_TEST × (number of units).
  if (!VALID_TEST_UNIT_IDS.has(unitId)) return { status: "ineligible" };

  const user = await getServerUser().catch(() => null);
  if (!user || user.role !== "STUDENT") return { status: "ineligible" };

  // Guard against non-finite client input (Infinity/NaN) reaching the score math.
  if (!Number.isFinite(score) || !Number.isFinite(total)) {
    return { status: "ineligible" };
  }

  const pct = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const exp = Math.round(EXP_PER_VOCAB_TEST * pct);
  if (exp <= 0) return { status: "ineligible" };

  const admin = createAdminClient();
  // ignoreDuplicates skips the write when this unit's test was already earned.
  // `.select()` then returns the inserted row only on a real insert, so an empty
  // result means "deduped" and a thrown/errored result means "write failed" —
  // three outcomes the caller can now tell apart.
  const { data, error } = await admin
    .from("points_ledger")
    .upsert(
      {
        student_id: user.id,
        reason: "VOCAB_TEST_EXP",
        points: exp,
        unique_key: `vocab-test:${unitId}`,
      },
      { onConflict: "student_id,unique_key", ignoreDuplicates: true },
    )
    .select("id");

  if (error) return { status: "error" };
  if (!data || data.length === 0) return { status: "duplicate" };
  return { status: "granted", xp: exp };
}
