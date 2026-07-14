import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { awardHtmlTestExp } from "@/lib/data/exp";
import { evaluateAndUnlockBadges } from "@/lib/data/badges";
import type { SkillArea } from "@/lib/database.types";

// Sane upper bound on the total question count a single HTML test can report
// for any skill. No realistic IELTS or platform exam has more than 200 items
// in a single skill area. Values above this indicate a tampered payload.
const MAX_TOTAL_CEILING = 200;

// The six skill areas the HTML tests can report scores for.
const SKILL_AREAS: SkillArea[] = [
  "GRAMMAR",
  "VOCABULARY",
  "READING",
  "LISTENING",
  "WRITING",
  "SPEAKING",
];

// ---------------------------------------------------------------------------
// TRUST LEVEL: HTML-test scores are SELF-REPORTED (lower-trust).
//
// Hosted HTML tests are self-contained exam files whose answer keys live
// entirely in the browser. The server has no independent answer key and
// CANNOT re-grade the submission. This means correct/total are client-supplied
// and could be tampered with.
//
// Defense-in-depth applied here (what we CAN enforce server-side):
//   1. Authentication + ownership: attempt must belong to the authenticated
//      STUDENT (getServerUser + student_id check).
//   2. Strict payload validation: correct/total must be finite non-negative
//      integers, correct <= total, total in (0, MAX_TOTAL_CEILING].
//   3. Once-per-test dedupe: awardHtmlTestExp uses a unique ledger key keyed
//      on html_test_id so XP is awarded at most once per test per student,
//      regardless of how many times the payload is sent.
//   4. XP is capped: awardHtmlTestExp caps at EXP_PER_TEST (100) scaled by
//      accuracy — even a 100 % forged score yields at most 100 XP, deduped.
//
// What we CANNOT enforce without a server answer key:
//   - Accuracy of the self-reported correct/total within the valid range.
//
// HTML-test results feed progress (excluded_from_progress: false) but the
// bounded, deduped XP and skill-score writes are as safe as the constraints
// above can make them. Server-graded /t/<token> tests (submit.ts) are the
// high-trust path for assessments that matter.
//
// Reads use the service-role client because: (a) the result/score tables are
// read-only to clients via RLS (see 0002_rls.sql), and (b) we need to verify
// ownership before operating on the attempt row. The client's RLS identity is
// established via getServerUser().
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "Backend not configured." },
      { status: 503 },
    );
  }

  const user = await getServerUser().catch(() => null);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== "STUDENT") {
    return NextResponse.json(
      { ok: false, error: "Only students submit test scores." },
      { status: 403 },
    );
  }

  // ---------------------------------------------------------------------------
  // Parse + validate the request body.
  // ---------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const { attemptId, skills } = body as Record<string, unknown>;

  if (typeof attemptId !== "string" || attemptId.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "attemptId must be a non-empty string." },
      { status: 400 },
    );
  }
  if (!Array.isArray(skills) || skills.length === 0) {
    return NextResponse.json(
      { ok: false, error: "skills must be a non-empty array." },
      { status: 400 },
    );
  }

  // Validate each skill entry.
  for (const entry of skills) {
    if (typeof entry !== "object" || entry === null) {
      return NextResponse.json(
        { ok: false, error: "Each skills entry must be an object." },
        { status: 400 },
      );
    }
    const { skill, correct, total } = entry as Record<string, unknown>;
    if (!SKILL_AREAS.includes(skill as SkillArea)) {
      return NextResponse.json(
        { ok: false, error: `Invalid skill area: ${String(skill)}. Must be one of ${SKILL_AREAS.join(", ")}.` },
        { status: 400 },
      );
    }
    if (
      typeof correct !== "number" ||
      !Number.isFinite(correct) ||
      !Number.isInteger(correct) ||
      correct < 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Each skills entry must have correct as a non-negative integer." },
        { status: 400 },
      );
    }
    if (
      typeof total !== "number" ||
      !Number.isFinite(total) ||
      !Number.isInteger(total) ||
      total <= 0 ||
      total > MAX_TOTAL_CEILING
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `Each skills entry must have total as a positive integer no greater than ${MAX_TOTAL_CEILING}.`,
        },
        { status: 400 },
      );
    }
    if (correct > total) {
      return NextResponse.json(
        { ok: false, error: "correct must be <= total for each skills entry." },
        { status: 400 },
      );
    }
  }

  // Deduplicate / merge repeated skill entries by summing (defensive — the HTML
  // should not repeat a skill, but protect against it so a doubled READING entry
  // doesn't create two result_skill_scores rows and violate the unique constraint).
  const perSkill = new Map<SkillArea, { correct: number; total: number }>();
  for (const entry of skills as Array<{ skill: SkillArea; correct: number; total: number }>) {
    const prev = perSkill.get(entry.skill) ?? { correct: 0, total: 0 };
    perSkill.set(entry.skill, {
      correct: prev.correct + entry.correct,
      total: prev.total + entry.total,
    });
  }

  // Re-check the ceiling AFTER merging: the per-entry validation above runs
  // before duplicate skills are summed, so repeated entries for the same skill
  // could otherwise push a merged total past MAX_TOTAL_CEILING.
  for (const t of perSkill.values()) {
    if (t.total > MAX_TOTAL_CEILING || t.correct > t.total) {
      return NextResponse.json(
        { ok: false, error: "Merged skill totals are out of range." },
        { status: 400 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Load the attempt (admin client — ownership check is our security gate).
  // ---------------------------------------------------------------------------
  const admin = createAdminClient();
  const { data: attempt, error: attErr } = await admin
    .from("attempts")
    .select("id, student_id, html_test_id, submitted_at")
    .eq("id", attemptId)
    .maybeSingle();

  if (attErr || !attempt) {
    return NextResponse.json(
      { ok: false, error: "Attempt not found." },
      { status: 404 },
    );
  }

  // Security: the attempt must belong to the authenticated student.
  if (attempt.student_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "You do not own this attempt." },
      { status: 403 },
    );
  }

  // Guard: this endpoint is only for HTML-test attempts.
  if (!attempt.html_test_id) {
    return NextResponse.json(
      { ok: false, error: "This attempt is not an HTML test attempt." },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------------------
  // Idempotency: if already submitted, return the existing result (no re-award).
  // ---------------------------------------------------------------------------
  if (attempt.submitted_at) {
    const { data: prior } = await admin
      .from("results")
      .select("id")
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      resultId: prior?.id ?? null,
      expAwarded: 0,
      alreadySubmitted: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Finalize the attempt and write results + skill scores.
  // ---------------------------------------------------------------------------

  // TODO(ordering): Ideally we would write the result row BEFORE stamping
  // submitted_at so that a crash between the two writes leaves the attempt
  // in a retryable state rather than "submitted but result missing". The
  // server-graded path does this safely via the finalize_attempt RPC
  // (migration 0019) which wraps both writes in a single DB transaction.
  // Reordering here without a similar transaction would introduce a window
  // where submitted_at is NOT set but the result row exists, causing the
  // idempotency check above to miss it and potentially re-insert on retry.
  // Deferring to a future migration that wraps this in an RPC like 0019's
  // finalize_attempt pattern. For now the current ordering (stamp first)
  // is the safer choice: a crashed result write is recoverable by an admin
  // but a double-awarded XP is not.
  const { error: updErr } = await admin
    .from("attempts")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", attempt.id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: "Could not finalize the attempt." },
      { status: 500 },
    );
  }

  // Insert the result row. HTML tests are never PLACEMENT, never PENDING_REVIEW
  // (the HTML grades locally, no AI/teacher check needed).
  const { data: result, error: rErr } = await admin
    .from("results")
    .insert({
      attempt_id: attempt.id,
      student_id: user.id,
      status: "COMPLETED" as const,
      excluded_from_progress: false,
    })
    .select("id")
    .single();
  if (rErr || !result) {
    return NextResponse.json(
      { ok: false, error: "Could not save the result." },
      { status: 500 },
    );
  }

  // One result_skill_scores row per skill reported by the HTML.
  const skillRows = [...perSkill.entries()].map(([skill_area, t]) => ({
    result_id: result.id,
    skill_area,
    correct_count: t.correct,
    total_count: t.total,
    accuracy: t.correct / t.total,
  }));
  if (skillRows.length > 0) {
    const { error: ssErr } = await admin
      .from("result_skill_scores")
      .insert(skillRows);
    // Surface the failure instead of swallowing it: without skill scores the
    // result contributes nothing to progress/leaderboard, so returning success
    // here would silently under-record the student's work.
    if (ssErr) {
      return NextResponse.json(
        { ok: false, error: "Could not save skill scores." },
        { status: 500 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // EXP: overall accuracy = total correct / total questions across all skills.
  // ---------------------------------------------------------------------------
  let totalCorrect = 0;
  let totalQuestions = 0;
  for (const t of perSkill.values()) {
    totalCorrect += t.correct;
    totalQuestions += t.total;
  }
  const accuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;
  const expAwarded = await awardHtmlTestExp(user.id, attempt.html_test_id, accuracy);

  // Badges: best-effort — a failure here must never block the result response.
  let newBadges: string[] = [];
  try {
    newBadges = await evaluateAndUnlockBadges(user.id);
  } catch {
    newBadges = [];
  }

  return NextResponse.json({ ok: true, resultId: result.id, expAwarded, newBadges });
}
