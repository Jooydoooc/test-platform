"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth-server";

export interface ShareTest {
  id: string;
  title: string;
  description: string;
  timeLimitSec: number | null;
}

// Resolve a share link (/t/<token>) to its test.
//
// THE LINK IS THE KEY (migration 0025): students can no longer select `tests`
// rows they have no attempt on, so a plain .from("tests") lookup would find
// nothing here. Resolution goes through the SECURITY DEFINER RPC, which
// requires a signed-in caller AND the exact token. That is the whole gate:
// tests are unlisted, and only an admin-sent link opens one.
export async function getTestByShareToken(
  token: string,
): Promise<ShareTest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("resolve_share_test", { p_token: token })
    .maybeSingle<{
      id: string;
      title: string;
      description: string;
      time_limit_sec: number | null;
    }>();
  if (error || !data) return null;
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    timeLimitSec: data.time_limit_sec,
  };
}

export interface ExistingAttemptResult {
  ok: boolean;
  /** True when no attempt row exists yet for this student/test. */
  none?: boolean;
  attemptId?: string;
  startedAt?: string;
  /** True when this student already submitted. */
  alreadyCompleted?: boolean;
  resultId?: string;
  error?: string;
}

// Read-only check for an existing attempt — creates nothing.
//
// Used on mount so the briefing screen can tell, before the student clicks
// Begin, whether this is a fresh test (no countdown yet — clock starts on
// Begin), a resume of an in-progress attempt (deadline anchored to the
// existing started_at, never reset), or an already-completed test (skip the
// briefing entirely). Students retain SELECT on `attempts` and RLS scopes it
// to their own rows, so this is a plain client read — no RPC, no insert.
export async function getExistingAttempt(
  testId: string,
): Promise<ExistingAttemptResult> {
  const user = await getServerUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attempts")
    .select("id, started_at, submitted_at")
    .eq("test_id", testId)
    .eq("student_id", user.id)
    .maybeSingle<{
      id: string;
      started_at: string;
      submitted_at: string | null;
    }>();

  // Mirror startAttempt's error-code mapping: session failures arrive as
  // PostgREST codes, not the DB's own 42501.
  if (error) {
    if (
      error.code === "42501" ||
      error.code === "PGRST301" ||
      error.code === "PGRST303"
    ) {
      return { ok: false, error: STALE_SESSION };
    }
    return { ok: false, error: "Could not load the test." };
  }

  if (!data) return { ok: true, none: true };

  if (data.submitted_at) {
    const { data: result } = await supabase
      .from("results")
      .select("id")
      .eq("attempt_id", data.id)
      .maybeSingle();
    return {
      ok: true,
      alreadyCompleted: true,
      resultId: result?.id,
    };
  }

  return {
    ok: true,
    attemptId: data.id,
    startedAt: data.started_at,
  };
}

export interface StartAttemptResult {
  ok: boolean;
  /** Present when a fresh or in-progress attempt is ready to take. */
  attemptId?: string;
  /** The resolved test id — the caller only ever holds the share token. */
  testId?: string;
  startedAt?: string;
  timeLimitSec?: number | null;
  /** True when this student already submitted — re-entry is refused. */
  alreadyCompleted?: boolean;
  resultId?: string;
  error?: string;
}

// Create-or-resume the student's single attempt, keyed by the SHARE TOKEN.
//
// Keying on the token (not a raw test id) is deliberate. Minting an attempt is
// what opens the tests read policy from migration 0025, so if this accepted a
// bare test id a student could guess/enumerate ids and unlock a test they were
// never sent. With the token as the key, "has the link" and "may take it" are
// the same condition.
//
// The RPC is the anti-cheat core: one attempt row per (student, test) forever.
//   * already submitted  -> refuse (alreadyCompleted), no new attempt
//   * in-progress        -> resume the same row (server start time preserved)
//   * none               -> insert (the DB unique index makes this atomic)
// Shown whenever a token resolves to no test: the link itself is the thing the
// student can act on, so name it rather than reporting a generic failure.
const BAD_LINK = "This test link isn't valid. Ask your teacher for a new one.";

// The RPC's own signed-in/STUDENT guard. Both checks already ran above, so
// reaching it means the session changed mid-request. Deliberately hardcoded
// rather than echoing the DB's message, which would leak internals to a caller
// who never passed the grant.
const STALE_SESSION = "Your session has changed. Sign in again to take this test.";

export async function startAttempt(token: string): Promise<StartAttemptResult> {
  const user = await getServerUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (user.role !== "STUDENT") {
    return { ok: false, error: "Only students take tests." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("start_share_attempt", { p_token: token })
    .maybeSingle<{
      attempt_id: string;
      test_id: string;
      started_at: string;
      submitted_at: string | null;
      time_limit_sec: number | null;
    }>();

  // start_share_attempt raises a distinct SQLSTATE per refusal reason; keep them
  // distinct here. Collapsing them told a student with a stale or mistyped link
  // only that something failed, so they had no way to know the link was the
  // problem.
  //
  // Session failures arrive as PostgREST codes, not as the function's own 42501:
  // an expired token is rejected by PostgREST (PGRST303) before the function
  // runs, so the DB guard is never reached. Verified locally against a 60s
  // token — a revoked-but-unexpired token still succeeds, since access tokens
  // are stateless. 42501 remains for the grant/role refusals that do reach it.
  if (error) {
    if (error.code === "P0002") return { ok: false, error: BAD_LINK };
    if (
      error.code === "42501" ||
      error.code === "PGRST301" ||
      error.code === "PGRST303"
    ) {
      return { ok: false, error: STALE_SESSION };
    }
    return { ok: false, error: "Could not start the test." };
  }
  // The RPC inserts then returns, so no-error-no-row shouldn't happen; treat it
  // as an unresolvable token rather than failing silently.
  if (!data) return { ok: false, error: BAD_LINK };

  if (data.submitted_at) {
    const { data: result } = await supabase
      .from("results")
      .select("id")
      .eq("attempt_id", data.attempt_id)
      .maybeSingle();
    return {
      ok: true,
      testId: data.test_id,
      alreadyCompleted: true,
      resultId: result?.id,
    };
  }

  return {
    ok: true,
    attemptId: data.attempt_id,
    testId: data.test_id,
    startedAt: data.started_at,
    timeLimitSec: data.time_limit_sec,
  };
}
