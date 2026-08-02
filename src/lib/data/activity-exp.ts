"use server";

import { getServerUser } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { ESSENTIAL_WORDS_BOOK1 } from "@/lib/data/essential-words";
import { evaluateAndUnlockBadges } from "@/lib/data/badges";
import type { Json } from "@/lib/database.types";
import {
  QUIZ_CONFIG,
  INTERACTIVE_CONFIG,
  isMcExerciseType,
  isInteractiveExerciseType,
} from "@/lib/vocab";

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

  // Guard against non-finite / non-integer / out-of-range client input. score
  // and total are client-reported, so we reject anything the real UI can't
  // produce: non-integers, non-positive totals, negative scores, or score>total.
  // Without the score>total check a tampered payload (score=9999,total=1) writes
  // a poisoned correct_count into result_skill_scores and permanently inflates
  // the student's VOCABULARY mastery aggregate (accuracy is clamped below, but
  // the raw counts are summed elsewhere).
  if (
    !Number.isInteger(score) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    score < 0 ||
    score > total
  ) {
    return { status: "ineligible" };
  }

  const admin = createAdminClient();

  // -------------------------------------------------------------------------
  // Create-or-resume the attempt for (student_id, vocab_source_id).
  //
  // Strategy mirrors startAttempt / the html-submit route: select first so we
  // can resume an in-progress attempt (no result yet) rather than insert a
  // duplicate row. Whether it's already submitted is resolved below by the
  // atomic RPC, not here — so this never has to guess at partial-failure state.
  // The unique index on (student_id, vocab_source_id) guards against races —
  // on conflict we re-select.
  // -------------------------------------------------------------------------
  const { data: existing } = await admin
    .from("attempts")
    .select("id")
    .eq("student_id", user.id)
    .eq("vocab_source_id", unitId)
    .maybeSingle();

  let attemptId: string;

  if (existing) {
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
        .select("id")
        .eq("student_id", user.id)
        .eq("vocab_source_id", unitId)
        .maybeSingle();
      if (!raced) return { status: "error" };
      attemptId = raced.id;
    } else {
      attemptId = inserted.id;
    }
  }

  // -------------------------------------------------------------------------
  // Finalize atomically via the same `finalize_test_attempt` RPC used by the
  // DB-test submit path (migration 0019). It claims the attempt (submitted_at
  // IS NULL -> now(), inside the same PG transaction as the writes below), so
  // either everything below commits together or nothing does:
  //   - results (COMPLETED, never excluded_from_progress — vocab is never PLACEMENT)
  //   - result_skill_scores (one VOCABULARY row)
  // p_answers is intentionally `[]`: vocab tests have no DB `questions` rows to
  // grade against (client-graded word list), and an empty jsonb array makes the
  // RPC's `insert ... from jsonb_array_elements(...)` a no-op — no FK to satisfy.
  // p_exp is intentionally 0 / p_exp_unique_key null here: the RPC's XP step
  // hardcodes ledger reason 'TEST_EXP' (shared with DB tests), which would
  // mislabel vocab XP. XP is granted just below instead, under the correct
  // 'VOCAB_TEST_EXP' reason, using the same idempotent dedupe-key upsert as
  // before — safe to run on every call (first grant or retry) because the
  // ledger's (student_id, unique_key) unique index makes it a no-op on repeat.
  //
  // If this call itself fails (network/RPC error), submitted_at was never
  // touched (the claim is inside the same transaction as the failure), so a
  // retry re-enters this exact path and can still complete the grade — no
  // permanently-stamped-but-ungraded state is possible from this point on.
  const clampedScore = Math.max(0, Math.min(score, total));
  const accuracy = Math.max(0, Math.min(1, clampedScore / total));

  const { data: rpcRows, error: rpcErr } = await admin.rpc(
    "finalize_test_attempt",
    {
      p_attempt_id: attemptId,
      p_student_id: user.id,
      p_status: "COMPLETED",
      p_excluded: false,
      p_answers: [] as unknown as Json,
      p_skill_scores: [
        {
          skill_area: "VOCABULARY",
          correct_count: clampedScore,
          total_count: total,
          accuracy,
        },
      ] as unknown as Json,
      p_exp: 0,
      p_exp_unique_key: null,
    },
  );
  if (rpcErr || !rpcRows || rpcRows.length === 0) {
    return { status: "error" };
  }

  const resultId = rpcRows[0].result_id;
  // A null result_id can only mean: the RPC found the attempt already claimed
  // (submitted_at set) by a run that predates this fix and never committed a
  // results row — i.e. the exact stuck state this fix closes off going
  // forward. There is no in-app way to reclaim it (the CAS requires
  // submitted_at IS NULL); it needs a one-off data fix, out of scope here.
  if (!resultId) {
    return { status: "error" };
  }

  // -------------------------------------------------------------------------
  // EXP: score-proportional, granted once per unit via the deduped ledger.
  // Runs on every call (first grant AND retries) — ignoreDuplicates makes a
  // repeat call a safe no-op, so a retry that finds the RPC already committed
  // (e.g. a prior call's XP grant below failed) can still complete the grant.
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

  // If the RPC found this attempt already fully committed by a prior call AND
  // this call didn't recover any new XP, nothing new happened — report the
  // pre-existing duplicate. Otherwise (first-time grade, or a retry that just
  // recovered a previously-lost XP grant) report granted.
  if (rpcRows[0].was_already_submitted && xpGranted === 0) {
    return { status: "duplicate", resultId };
  }
  return { status: "granted", xp: xpGranted, resultId, newBadges };
}

// ---------------------------------------------------------------------------
// Practice exercises — small, capped, non-farmable XP
// ---------------------------------------------------------------------------

// EXP awarded per practice exercise completion, scaled by accuracy. Capped low
// (vs EXP_PER_VOCAB_TEST=100) so exercises don't substitute for the graded test
// and are still worth doing. Deduped once per (unit, exerciseType) so a student
// can't farm a single drill for infinite XP.
const EXP_PER_VOCAB_EXERCISE = 20;

// A valid exercise type is REQUIRED here: `exerciseType` arrives from a client-
// callable "use server" action and becomes part of the ledger dedupe key
// (`vocab-ex:<unitId>:<exerciseType>`). An open string lets any student mint
// unlimited XP by passing endless unique strings, so we validate against — and
// derive the per-exercise question-count cap FROM — the canonical vocab config
// (QUIZ_CONFIG / INTERACTIVE_CONFIG). Deriving from that single source means a
// new drill added in vocab.ts is automatically allowed and correctly capped,
// with no second list here to drift out of sync.

/** Server-side max question count for an exercise type, or null if unknown. */
function maxTotalForExercise(exerciseType: string): number | null {
  if (isMcExerciseType(exerciseType)) {
    return QUIZ_CONFIG[exerciseType].questionCount;
  }
  if (isInteractiveExerciseType(exerciseType)) {
    return INTERACTIVE_CONFIG[exerciseType].questionCount;
  }
  return null;
}

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

  // Reject any exerciseType the vocab config doesn't know about. This is the
  // primary anti-forgery guard: without it a student can pass any arbitrary
  // string and mint a new dedupe key (= new XP grant) each time. maxTotal is
  // the exercise's real question count; a null (unknown) type or a non-positive
  // count is rejected outright (the latter also avoids a divide-by-zero below).
  const maxTotal = maxTotalForExercise(exerciseType);
  if (maxTotal === null || maxTotal <= 0) {
    return { status: "ineligible" };
  }

  const user = await getServerUser().catch(() => null);
  if (!user || user.role !== "STUDENT") return { status: "ineligible" };

  // Guard against non-finite AND non-integer client input. Requiring integers
  // closes a fractional-payload bypass: score=0.01, total=0.01 would otherwise
  // clamp to a valid ratio of 1.0 and mint full XP without real completion.
  if (
    !Number.isInteger(score) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    score < 0
  ) {
    return { status: "ineligible" };
  }

  // Clamp `total` to the server-known maximum for this exercise type so a
  // tampered payload cannot inflate the denominator (and thus the accuracy) to
  // values that the real UI never produces. `score` is then also clamped to
  // [0, clampedTotal] to ensure correct <= total is preserved server-side.
  // maxTotal is guaranteed > 0 by the guard above, so clampedTotal is > 0.
  const clampedTotal = Math.min(total, maxTotal);
  const clampedScore = Math.max(0, Math.min(score, clampedTotal));

  const clampedAccuracy = Math.max(0, Math.min(1, clampedScore / clampedTotal));
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
