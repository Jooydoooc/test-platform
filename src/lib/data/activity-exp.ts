"use server";

import { getServerUser } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { ESSENTIAL_WORDS_BOOK1 } from "@/lib/data/essential-words";
import { evaluateAndUnlockBadges } from "@/lib/data/badges";

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
// that need this shape derive it via `Awaited<ReturnType<typeof submitVocabTest>>`.
type VocabExpResult =
  | { status: "granted"; xp: number; resultId?: string; newBadges?: string[] } // written now
  | { status: "duplicate"; resultId?: string }   // already earned (deduped)
  | { status: "ineligible" }                      // disabled / not a student / unknown unit / zero score
  | { status: "error" };                          // the write failed — nothing was recorded

// ---------------------------------------------------------------------------
// Skills test — full-pipeline graded event
// ---------------------------------------------------------------------------

// EXP awarded per graded skills test, scaled by accuracy. Matches EXP_PER_TEST
// in exp.ts so vocab and DB-test rewards feel equivalent to students.
const EXP_PER_VOCAB_TEST = 100;

// Server action: submit a completed vocabulary SKILLS TEST as a first-class
// graded event. Writes attempts → results → result_skill_scores so XP, badges,
// and VOCABULARY skill-progress tracking all see the event, then grants XP
// once per unit via the deduped ledger.
//
// Trust boundary: the vocab test is graded on the client (there is no server-
// side answer key for the word set), so score/total are client-reported. We
// contain the blast radius: (1) EXP is only ever granted to the AUTHENTICATED
// caller — never a client-passed id; (2) it is capped at EXP_PER_VOCAB_TEST;
// (3) the (student_id, vocab_source_id) unique index grants each unit's test
// once, so a retake can't be replayed for repeat EXP or badge counts.
export async function submitVocabTest(
  unitId: string,
  score: number,
  total: number,
): Promise<VocabExpResult> {
  if (!SUPABASE_ENABLED) return { status: "ineligible" };
  // Reject unknown/invented unit ids. score/total are client-reported (there is
  // no server answer key), so without this a student could POST arbitrary ids
  // and mint EXP_PER_VOCAB_TEST for each new dedupe key — unbounded. Pinning to
  // real seeded units caps the total to EXP_PER_VOCAB_TEST × (number of units).
  if (!VALID_TEST_UNIT_IDS.has(unitId)) return { status: "ineligible" };

  const user = await getServerUser().catch(() => null);
  if (!user || user.role !== "STUDENT") return { status: "ineligible" };

  // Guard against non-finite client input (Infinity/NaN) reaching the score math.
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
    return { status: "ineligible" };
  }

  const admin = createAdminClient();

  // -------------------------------------------------------------------------
  // Create-or-resume the attempt for (student_id, vocab_source_id).
  //
  // Strategy mirrors startAttempt / the html-submit route: select first so we
  // can distinguish "already submitted" (duplicate path) vs "in progress" (resume)
  // vs "none yet" (insert). The unique index on (student_id, vocab_source_id)
  // guards against races — on conflict we re-select.
  // -------------------------------------------------------------------------
  const { data: existing } = await admin
    .from("attempts")
    .select("id, submitted_at")
    .eq("student_id", user.id)
    .eq("vocab_source_id", unitId)
    .maybeSingle();

  if (existing?.submitted_at) {
    // Already graded — look up the result and return idempotent duplicate.
    const { data: prior } = await admin
      .from("results")
      .select("id")
      .eq("attempt_id", existing.id)
      .maybeSingle();
    return { status: "duplicate", resultId: prior?.id };
  }

  let attemptId: string;

  if (existing) {
    // Un-submitted in-progress attempt — reuse it.
    attemptId = existing.id;
  } else {
    // No attempt yet — insert one, handling the unique-index race by re-selecting.
    const { data: inserted, error: insErr } = await admin
      .from("attempts")
      .insert({ student_id: user.id, vocab_source_id: unitId })
      .select("id")
      .single();

    if (insErr || !inserted) {
      // Unique-index race: another request beat us. Re-select and reuse it.
      const { data: raced } = await admin
        .from("attempts")
        .select("id, submitted_at")
        .eq("student_id", user.id)
        .eq("vocab_source_id", unitId)
        .maybeSingle();
      if (!raced) return { status: "error" };
      if (raced.submitted_at) {
        const { data: prior } = await admin
          .from("results")
          .select("id")
          .eq("attempt_id", raced.id)
          .maybeSingle();
        return { status: "duplicate", resultId: prior?.id };
      }
      attemptId = raced.id;
    } else {
      attemptId = inserted.id;
    }
  }

  // -------------------------------------------------------------------------
  // Finalize the attempt (mark submitted_at first — if a later write fails, the
  // idempotency check above catches a retry and prevents double-award).
  // -------------------------------------------------------------------------
  await admin
    .from("attempts")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", attemptId);

  // Insert the result row. Vocab tests are never PLACEMENT, never PENDING_REVIEW
  // (graded locally; no AI/teacher check needed).
  const { data: result, error: rErr } = await admin
    .from("results")
    .insert({
      attempt_id: attemptId,
      student_id: user.id,
      status: "COMPLETED" as const,
      excluded_from_progress: false,
    })
    .select("id")
    .single();
  if (rErr || !result) return { status: "error" };

  // One result_skill_scores row for VOCABULARY (the only skill a vocab test covers).
  const accuracy = Math.max(0, Math.min(1, score / total));
  await admin.from("result_skill_scores").insert({
    result_id: result.id,
    skill_area: "VOCABULARY" as const,
    correct_count: score,
    total_count: total,
    accuracy,
  });

  // -------------------------------------------------------------------------
  // EXP: score-proportional, granted once per unit via the deduped ledger.
  // ignoreDuplicates skips the write when this unit's test was already earned.
  // An empty `.select()` result means "deduped"; an error means "write failed".
  // -------------------------------------------------------------------------
  const exp = Math.round(EXP_PER_VOCAB_TEST * accuracy);
  let xpGranted = 0;
  if (exp > 0) {
    const { data: ledgerData, error: ledgerErr } = await admin
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
    if (!ledgerErr && ledgerData && ledgerData.length > 0) {
      xpGranted = exp;
    }
  }

  // Badges reuse the shared catalog/rule; best-effort so a failure never blocks
  // the result.
  let newBadges: string[] = [];
  try {
    newBadges = await evaluateAndUnlockBadges(user.id);
  } catch {
    newBadges = [];
  }

  return { status: "granted", xp: xpGranted, resultId: result.id, newBadges };
}

// ---------------------------------------------------------------------------
// Practice exercises — small, capped, non-farmable XP
// ---------------------------------------------------------------------------

// EXP awarded per practice exercise completion, scaled by accuracy. Capped low
// (vs EXP_PER_VOCAB_TEST=100) so exercises don't substitute for the graded test
// and are still worth doing. Deduped once per (unit, exerciseType) so a student
// can't farm a single drill for infinite XP.
const EXP_PER_VOCAB_EXERCISE = 20;

// Server action: award a small XP reward for completing a vocabulary PRACTICE
// EXERCISE (gap-fill, sentence-builder, matching, multiple-choice drills).
//
// Intentionally does NOT write attempts/results/result_skill_scores: exercises
// must not inflate badge or skill-progress counts — only the graded skills test
// (submitVocabTest above) feeds those. This is the anti-farming boundary.
//
// Bounded by VALID_TEST_UNIT_IDS: only the 5 seeded EEW Book 1 units grant
// exercise XP. Collected/reading sources have no fixed word set and grant
// nothing, consistent with the test-XP design comment above.
export async function awardVocabExerciseExp(
  unitId: string,
  exerciseType: string,
  score: number,
  total: number,
): Promise<VocabExpResult> {
  if (!SUPABASE_ENABLED) return { status: "ineligible" };
  if (!VALID_TEST_UNIT_IDS.has(unitId)) return { status: "ineligible" };

  const user = await getServerUser().catch(() => null);
  if (!user || user.role !== "STUDENT") return { status: "ineligible" };

  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
    return { status: "ineligible" };
  }

  const clampedAccuracy = Math.max(0, Math.min(1, score / total));
  const exp = Math.round(EXP_PER_VOCAB_EXERCISE * clampedAccuracy);
  if (exp <= 0) return { status: "ineligible" };

  const admin = createAdminClient();
  // Dedupe key: one grant per (student, unit, exerciseType) — a student earns
  // exercise XP once per drill type per unit. Retakes are free practice, not
  // additional XP.
  const { data, error } = await admin
    .from("points_ledger")
    .upsert(
      {
        student_id: user.id,
        reason: "VOCAB_EXERCISE_EXP",
        points: exp,
        unique_key: `vocab-ex:${unitId}:${exerciseType}`,
      },
      { onConflict: "student_id,unique_key", ignoreDuplicates: true },
    )
    .select("id");

  if (error) return { status: "error" };
  if (!data || data.length === 0) return { status: "duplicate" };
  return { status: "granted", xp: exp };
}
