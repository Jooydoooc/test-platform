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

  if (error || !data) {
    return { ok: false, error: "Could not start the test." };
  }

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
