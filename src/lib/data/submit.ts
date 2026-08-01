"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/auth-server";
import { gradeQuestion } from "@/lib/data/grading";
import { computeTestExp, testExpKey } from "@/lib/data/exp";
import { evaluateAndUnlockBadges } from "@/lib/data/badges";
import { notifyGroupOfResult } from "@/lib/telegram-notify";
import type { Json, SkillArea } from "@/lib/database.types";

export interface SubmitResult {
  ok: boolean;
  resultId?: string;
  pendingReview?: boolean;
  /** EXP granted for this test (0 for placement/re-submit/no-score). */
  expAwarded?: number;
  /** Names of badges unlocked by this submission (empty when none). */
  newBadges?: string[];
  /** Points earned / possible for a freshly graded submission. Omitted on
   *  replay (already-submitted) paths and undefined until grading completes. */
  scoreEarned?: number;
  scoreTotal?: number;
  error?: string;
}

// Submit a test attempt. Grading runs HERE (server), never on the client.
// Reads use the user's RLS-scoped client; the graded writes (attempt, answers,
// result, per-skill scores, XP ledger) are all committed in one atomic PG
// transaction via the finalize_test_attempt RPC, using the service-role client.
//
// [Fixes High #6] The old code stamped attempts.submitted_at BEFORE writing
// answers/results, permanently bricking a student if a later write failed.
// Now the RPC claims submitted_at inside the same transaction: if any step
// fails the whole tx rolls back, leaving submitted_at NULL so the student can retry.
//
// [Fixes High #7] Per-skill accuracy is now POINTS-weighted, not question-count-
// weighted. See the perSkill accumulator below.
// Client-reported proctor tally (see Proctor.tsx / migration 0024). Best-effort
// integrity signal for teachers; never affects grading or XP.
export interface AttemptIntegrity {
  violations: number;
  flags: Record<string, number>;
}

export async function submitAttempt(
  testId: string,
  responses: Record<string, unknown>, // questionId -> raw response JSON
  integrity?: AttemptIntegrity | null,
): Promise<SubmitResult> {
  const user = await getServerUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (user.role !== "STUDENT") {
    return { ok: false, error: "Only students submit attempts." };
  }

  const supabase = await createClient();

  const { data: test, error: testErr } = await supabase
    .from("tests")
    .select("id, purpose, title")
    .eq("id", testId)
    .single();
  if (testErr || !test) return { ok: false, error: "Test not found." };

  // The single attempt must already exist (created by startAttempt). This is the
  // anti-cheat gate: no fresh attempt is minted here.
  const admin = createAdminClient();
  const { data: attemptRow, error: attemptErr } = await admin
    .from("attempts")
    .select("id, submitted_at")
    .eq("student_id", user.id)
    .eq("test_id", testId)
    .maybeSingle();
  // Distinguish an infra failure from a genuinely-missing attempt. This used to
  // discard `error` and fall through to "Start the test before submitting." —
  // when the service-role key once lacked a table grant, the query 403'd,
  // `data` came back null, and a student who HAD started the test was told it
  // was their fault. Only a null result with NO error means "never started."
  if (attemptErr) {
    console.error("[submitAttempt] admin lookup of attempts failed", {
      message: attemptErr.message,
      code: attemptErr.code,
      details: attemptErr.details,
      studentId: user.id,
      testId,
    });
    return {
      ok: false,
      error:
        "Something went wrong on our side. Your answers were not submitted — please try again.",
    };
  }
  if (!attemptRow) {
    return { ok: false, error: "Start the test before submitting." };
  }

  // Fast-path: if already submitted, return the prior result without hitting the RPC.
  // The RPC's step-1 also handles the concurrent double-submit race atomically, so
  // this pre-check is just a cheap short-circuit for the normal "already done" case.
  if (attemptRow.submitted_at) {
    const { data: prior, error: priorErr } = await admin
      .from("results")
      .select("id, status")
      .eq("attempt_id", attemptRow.id)
      .maybeSingle();
    // Same discarded-error hazard as the attempt lookup above: a swallowed error
    // here would report ok:true with a missing resultId instead of surfacing the
    // real infra failure, so check it before trusting a null `prior`.
    if (priorErr) {
      console.error("[submitAttempt] admin lookup of prior result failed", {
        message: priorErr.message,
        code: priorErr.code,
        details: priorErr.details,
        studentId: user.id,
        testId,
        attemptId: attemptRow.id,
      });
      return {
        ok: false,
        error:
          "Something went wrong on our side. Your answers were not submitted — please try again.",
      };
    }
    return {
      ok: true,
      resultId: prior?.id,
      pendingReview: prior?.status === "PENDING_REVIEW",
      expAwarded: 0,
    };
  }

  const { data: items, error: itemsErr } = await admin
    .from("test_items")
    .select("task_id")
    .eq("test_id", testId);
  // Same hazard again: an infra error here previously read as "Test has no
  // content," misreporting a DB/permission failure as a test-authoring problem.
  if (itemsErr) {
    console.error("[submitAttempt] admin lookup of test_items failed", {
      message: itemsErr.message,
      code: itemsErr.code,
      details: itemsErr.details,
      studentId: user.id,
      testId,
    });
    return {
      ok: false,
      error:
        "Something went wrong on our side. Your answers were not submitted — please try again.",
    };
  }
  const taskIds = (items ?? []).map((i) => i.task_id);
  if (taskIds.length === 0) return { ok: false, error: "Test has no content." };

  const { data: questions, error: questionsErr } = await admin
    .from("questions")
    .select("id, format, skill_area, points, answer_key")
    .in("task_id", taskIds);
  // Same hazard again: an infra error here previously read as "Test has no
  // questions," misreporting a DB/permission failure as a test-authoring problem.
  if (questionsErr) {
    console.error("[submitAttempt] admin lookup of questions failed", {
      message: questionsErr.message,
      code: questionsErr.code,
      details: questionsErr.details,
      studentId: user.id,
      testId,
    });
    return {
      ok: false,
      error:
        "Something went wrong on our side. Your answers were not submitted — please try again.",
    };
  }
  if (!questions || questions.length === 0) {
    return { ok: false, error: "Test has no questions." };
  }

  // Grade every question in TypeScript (gradeQuestion). Grading logic stays in
  // TS deliberately; only the persistence is delegated to the RPC.
  //
  // [Fixes High #7] Per-skill tallies now track POINTS, not question counts:
  //   pointsEarned = sum of awarded_points across questions in the skill
  //   pointsPossible = sum of q.points across questions in the skill
  // This means a 2-pt question weighs twice as much as a 1-pt question, giving
  // a correct points-proportional accuracy. correct_count/total_count in
  // result_skill_scores carry POINTS (not question counts) so accuracy = earned/possible.
  const perSkill = new Map<
    SkillArea,
    { pointsEarned: number; pointsPossible: number }
  >();
  let anyPending = false;
  let totalPointsEarned = 0;
  let totalPointsPossible = 0;

  const answerRows = questions.map((q) => {
    const outcome = gradeQuestion({
      format: q.format,
      points: q.points,
      answerKey: q.answer_key,
      response: responses[q.id] ?? {},
    });
    if (outcome.pending) anyPending = true;

    const tally = perSkill.get(q.skill_area) ?? {
      pointsEarned: 0,
      pointsPossible: 0,
    };
    tally.pointsPossible += q.points;
    tally.pointsEarned += outcome.awardedPoints;
    perSkill.set(q.skill_area, tally);

    totalPointsPossible += q.points;
    totalPointsEarned += outcome.awardedPoints;

    return {
      question_id: q.id,
      response: (responses[q.id] ?? {}) as object,
      is_correct: outcome.isCorrect,
      awarded_points: outcome.awardedPoints,
      needs_teacher_check: outcome.needsTeacherCheck,
    };
  });

  // Build the per-skill score rows. correct_count/total_count carry POINTS so
  // mixed-weight tests score correctly (High #7 fix). The RPC additionally
  // clamps correct_count <= total_count server-side for belt-and-suspenders safety.
  const skillScoreRows = [...perSkill.entries()].map(([skill, t]) => ({
    skill_area: skill,
    correct_count: t.pointsEarned,    // POINTS earned (not question count)
    total_count: t.pointsPossible,    // POINTS possible (not question count)
    accuracy: t.pointsPossible > 0 ? t.pointsEarned / t.pointsPossible : 0,
  }));

  // EXP: placement tests are diagnostic and grant no XP. For other tests,
  // accuracy is computed from total POINTS (already points-weighted) and fed to
  // computeTestExp — the same formula as exp.ts#awardTestExp, but we pass the
  // result directly into the RPC so the ledger write is inside the same
  // transaction (no separate awardTestExp call, which would double-write).
  //
  // testExpKey produces the identical `test-exp:${testId}` key that the old
  // awardTestExp helper used, so the ledger's (student_id, unique_key) unique
  // constraint provides the same "awarded once per test" guarantee.
  const isPlacement = test.purpose === "PLACEMENT";
  const overallAccuracy =
    totalPointsPossible > 0 ? totalPointsEarned / totalPointsPossible : 0;
  const expToAward = isPlacement ? 0 : computeTestExp(overallAccuracy);
  const expKey = isPlacement ? null : testExpKey(testId);

  const status = anyPending ? "PENDING_REVIEW" : "COMPLETED";

  // Delegate ALL persistence to the atomic RPC. This is a single PG transaction:
  //   1. Claim submitted_at (CAS, prevents double-submit race)
  //   2. Insert attempt_answers
  //   3. Insert result
  //   4. Insert result_skill_scores (with correct_count <= total_count clamp)
  //   5. Insert points_ledger ON CONFLICT DO NOTHING (idempotent XP dedup)
  // If any step throws, the tx rolls back and submitted_at remains NULL.
  const { data: rpcRows, error: rpcErr } = await admin.rpc(
    "finalize_test_attempt",
    {
      p_attempt_id: attemptRow.id,
      p_student_id: user.id,
      p_status: status,
      p_excluded: isPlacement,
      p_answers: answerRows as unknown as Json,
      p_skill_scores: skillScoreRows as unknown as Json,
      p_exp: expToAward,
      p_exp_unique_key: expKey,
    },
  );

  if (rpcErr || !rpcRows || rpcRows.length === 0) {
    return { ok: false, error: "Could not finalize attempt." };
  }

  const rpcRow = rpcRows[0];
  const resultId = rpcRow.result_id;
  const expAwarded = rpcRow.exp_awarded ?? 0;
  // was_already_submitted means the CAS found submitted_at already set (race);
  // in that case we return the prior result without re-awarding badges.
  const alreadyDone = rpcRow.was_already_submitted;

  // A null result_id means the claim path could not resolve a persisted result
  // (attempt missing / not owned by this student). Never report false success.
  if (!resultId) {
    return { ok: false, error: "Could not finalize attempt." };
  }

  if (alreadyDone) {
    // A concurrent submit already persisted this attempt. Report the STORED
    // result's status (returned by the RPC), not this request's re-grade —
    // anyPending reflects the current payload, which may differ from what the
    // winning request actually saved.
    return {
      ok: true,
      resultId,
      pendingReview: rpcRow.status === "PENDING_REVIEW",
      expAwarded: 0,
    };
  }

  // Record proctor integrity on the result (best-effort, additive column from
  // migration 0024). Never blocks the submit: if the column doesn't exist yet
  // or the write fails, we swallow it — integrity is a teacher hint, not part of
  // the graded transaction. Only written when the client reported a violation.
  if (integrity && integrity.violations > 0) {
    await admin
      .from("results")
      .update({
        integrity_violations: integrity.violations,
        integrity_flags: integrity.flags,
      })
      .eq("id", resultId);
    // Intentionally ignore the returned error — see note above.
  }

  // Badges reuse the shared catalog/rule; best-effort so a failure never blocks
  // the result. Only evaluated when we actually wrote new data (not a replay).
  let newBadges: string[] = [];
  try {
    newBadges = await evaluateAndUnlockBadges(user.id);
  } catch {
    newBadges = [];
  }

  // Post the result to the class Telegram channel (no-op unless configured).
  // correct/total carry POINTS here, matching the points-weighted accuracy above.
  // Runs AFTER the response is sent (via next/server `after`) so Telegram's
  // network latency never delays the student's submit; `after` keeps the
  // serverless function alive so the message still sends reliably.
  after(() => {
    void notifyGroupOfResult({
      studentId: user.id,
      testTitle: test.title,
      correct: totalPointsEarned,
      total: totalPointsPossible,
      pendingReview: anyPending,
    });
  });

  return {
    ok: true,
    resultId,
    pendingReview: anyPending,
    expAwarded,
    newBadges,
    scoreEarned: totalPointsEarned,
    scoreTotal: totalPointsPossible,
  };
}
