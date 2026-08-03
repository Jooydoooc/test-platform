import { NextResponse, after } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { awardHtmlTestExp } from "@/lib/data/exp";
import { evaluateAndUnlockBadges } from "@/lib/data/badges";
import { notifyGroupOfResult } from "@/lib/telegram-notify";
import { regrade, type AnswerKey } from "@/lib/data/html-regrade";
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

// Cap on how many answer entries a payload may carry (matches the ceiling on
// reported question counts — anything larger is a tampered or broken client).
const MAX_ANSWERS = MAX_TOTAL_CEILING;

// Sanitize the client-reported proctor tally (migration 0024). Best-effort
// telemetry: we never reject a submit over bad integrity data — we just drop it.
// Caps guard against a tampered payload bloating the row.
function sanitizeIntegrity(
  raw: unknown,
): { violations: number; flags: Record<string, number> } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const v = obj.violations;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  const violations = Math.min(Math.floor(v), 100_000);
  const flags: Record<string, number> = {};
  if (typeof obj.flags === "object" && obj.flags !== null) {
    let keys = 0;
    for (const [k, val] of Object.entries(obj.flags as Record<string, unknown>)) {
      if (keys >= 20) break; // cap distinct types
      if (typeof val === "number" && Number.isFinite(val) && val > 0) {
        flags[k.slice(0, 40)] = Math.min(Math.floor(val), 100_000);
        keys++;
      }
    }
  }
  return { violations, flags };
}

// ---------------------------------------------------------------------------
// TRUST LEVEL: depends on whether the test has a server-side answer key.
//
// WITH a key (html_test_answer_keys, migration 0027) — the default for tests
// that have been keyed: the submitted ANSWERS are re-graded here and the
// client's claimed correct/total is discarded. Posting a fabricated score no
// longer works; the payload has to contain answers, exactly as many as the key
// declares, with no duplicate ids. Residual risk: the questions and answers
// still ship inside the self-contained HTML, so a student who reads the page
// source can look them up. That is inherent to hosted HTML and is the reason
// server-graded /t/<token> tests remain the high-trust rail.
//
// WITHOUT a key (older hosted tests): scores stay SELF-REPORTED and lower-trust
// exactly as before — the server has no way to check them.
//
// Defense-in-depth applied here in both cases:
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
// What we still cannot enforce for an UNKEYED test:
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

  const { attemptId, skills, integrity, answers } = body as Record<
    string,
    unknown
  >;

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

  // Validate the optional answers array (present when the test supports
  // server-side re-grading). Shape: [{ id: string|number, value: string|null }].
  let parsedAnswers: { id: string; value: string | null }[] | null = null;
  if (answers !== undefined) {
    if (!Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json(
        { ok: false, error: "answers must be a non-empty array when present." },
        { status: 400 },
      );
    }
    if (answers.length > MAX_ANSWERS) {
      return NextResponse.json(
        { ok: false, error: `answers may not contain more than ${MAX_ANSWERS} entries.` },
        { status: 400 },
      );
    }
    parsedAnswers = [];
    for (const raw of answers) {
      if (typeof raw !== "object" || raw === null) {
        return NextResponse.json(
          { ok: false, error: "Each answers entry must be an object." },
          { status: 400 },
        );
      }
      const { id, value } = raw as Record<string, unknown>;
      if (typeof id !== "string" && typeof id !== "number") {
        return NextResponse.json(
          { ok: false, error: "Each answers entry must have a string or number id." },
          { status: 400 },
        );
      }
      if (value !== null && typeof value !== "string") {
        return NextResponse.json(
          { ok: false, error: "Each answers entry value must be a string or null." },
          { status: 400 },
        );
      }
      parsedAnswers.push({
        id: String(id),
        // Bound the text so a huge payload can't be used to bloat grading work.
        value: value === null ? null : value.slice(0, 500),
      });
    }

    // Reject repeats: one question answered thirty times is not thirty answers.
    const seen = new Set(parsedAnswers.map((a) => a.id));
    if (seen.size !== parsedAnswers.length) {
      return NextResponse.json(
        { ok: false, error: "answers must not contain duplicate ids." },
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
    .select("id, student_id, html_test_id, submitted_at, started_at")
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
  // Server-side re-grade (migration 0027). If this test has a stored key, the
  // score is computed HERE from the submitted answers and whatever the client
  // claimed is thrown away. `require_answers` makes the answers mandatory, so a
  // tampered client cannot dodge re-grading by simply omitting them.
  // ---------------------------------------------------------------------------
  const { data: keyRow } = await admin
    .from("html_test_answer_keys")
    .select("answer_key, require_answers")
    .eq("html_test_id", attempt.html_test_id)
    .maybeSingle();

  let serverGraded = false;
  if (keyRow) {
    const key = keyRow.answer_key as unknown as AnswerKey;
    if (!parsedAnswers) {
      if (keyRow.require_answers) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This test is graded on the server and the submission carried no answers. Reload the test page and submit again.",
          },
          { status: 400 },
        );
      }
      // Key present but not yet enforced (the updated test file isn't live) —
      // fall through to the self-reported score.
    } else {
      // Fail closed on a missing/invalid declared count. `key.count` is the
      // denominator the server insists on (see html-regrade.ts) — without it,
      // grading would silently fall back to trusting parsedAnswers.length,
      // exactly the forgery migration 0027 exists to prevent ("submit one
      // correct answer, score 1/1 = 100%"). Both seeded keys set `count`
      // today, so this should never fire in practice; it exists because keys
      // are hand-written SQL with nothing else enforcing the field. The
      // reason is logged server-side (html_test_id only — no answers/PII) so
      // a misconfigured key is visible without exposing internals to the
      // client, which gets a generic "can't grade right now" message.
      if (
        typeof key.count !== "number" ||
        !Number.isInteger(key.count) ||
        key.count <= 0
      ) {
        console.error(
          "[html submit] answer key has no valid count; refusing to grade",
          { htmlTestId: attempt.html_test_id },
        );
        return NextResponse.json(
          {
            ok: false,
            error: "This test cannot be graded right now. Please contact your teacher.",
          },
          { status: 500 },
        );
      }
      // The key declares how many questions an attempt serves; a payload that
      // doesn't carry exactly that many is malformed or trimmed.
      if (parsedAnswers.length !== key.count) {
        return NextResponse.json(
          {
            ok: false,
            error: `This test expects ${key.count} answers but the submission carried ${parsedAnswers.length}.`,
          },
          { status: 400 },
        );
      }
      const graded = regrade(key, parsedAnswers);
      perSkill.clear();
      perSkill.set(key.skill, graded);
      serverGraded = true;
    }
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
  // Atomic finalize (migration 0036). Stamping submitted_at and writing the
  // result used to be two separate statements. If the result insert failed
  // after the stamp landed, a retry saw submitted_at already set, took the
  // idempotency branch above, found no result, and returned ok:true with a
  // null resultId — success reported to the student, score gone, and no code
  // path able to re-insert it. finalize_html_test_attempt does the stamp, the
  // result and the skill scores in ONE transaction: either everything commits
  // or nothing does and the attempt stays retryable.
  //
  // XP is deliberately NOT delegated to the RPC (p_exp 0). awardHtmlTestExp
  // below owns the TEST_EXP reason and the once-per-test ledger key, and is
  // idempotent, so a retry recovers a grant missed by an earlier failure.
  const integrityCols = sanitizeIntegrity(integrity);
  const skillRows = [...perSkill.entries()].map(([skill_area, t]) => ({
    skill_area,
    correct_count: t.correct,
    total_count: t.total,
    accuracy: t.correct / t.total,
  }));

  const { data: finalized, error: finErr } = await admin
    .rpc("finalize_html_test_attempt", {
      p_attempt_id: attempt.id,
      p_student_id: user.id,
      p_skill_scores: skillRows,
      p_exp: 0,
      p_exp_unique_key: null,
      p_integrity_violations: integrityCols?.violations ?? 0,
      p_integrity_flags: integrityCols?.flags ?? null,
    })
    .maybeSingle<{
      result_id: string;
      exp_awarded: number;
      was_already_submitted: boolean;
    }>();

  if (finErr || !finalized) {
    console.error("[api/tests/html/submit] finalize failed", {
      message: finErr?.message,
      code: finErr?.code,
      details: finErr?.details,
      attemptId: attempt.id,
      studentId: user.id,
    });
    return NextResponse.json(
      { ok: false, error: "Could not save your result. Please try again." },
      { status: 500 },
    );
  }

  const result = { id: finalized.result_id };

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

  // Post the result to the class Telegram channel (no-op unless configured).
  // Best-effort: notifyGroupOfResult swallows its own errors. Runs AFTER the
  // response is sent so the title lookup + Telegram round-trip never delay the
  // student's submit; `after` keeps the function alive so it still delivers.
  // Capture before the closure: `after` may run later, which loses the earlier
  // non-null narrowing of attempt.html_test_id.
  const htmlTestId = attempt.html_test_id;
  after(async () => {
    const { data: htmlTest } = await admin
      .from("html_tests")
      .select("title")
      .eq("id", htmlTestId)
      .maybeSingle();
    await notifyGroupOfResult({
      studentId: user.id,
      testTitle: htmlTest?.title ?? "a test",
      correct: totalCorrect,
      total: totalQuestions,
    });
  });

  return NextResponse.json({
    ok: true,
    resultId: result.id,
    expAwarded,
    newBadges,
    // True when the score stored was computed here rather than reported by the
    // test file. Useful when auditing a result that a student disputes.
    serverGraded,
  });
}
