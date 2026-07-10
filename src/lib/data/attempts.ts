"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth-server";

export interface ShareTest {
  id: string;
  title: string;
  description: string;
  timeLimitSec: number | null;
}

// Resolve a share link (/t/<token>) to its test. RLS still requires a logged-in
// user to read tests, so the token identifies the test, not the student.
export async function getTestByShareToken(
  token: string,
): Promise<ShareTest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .select("id, title, description, time_limit_sec")
    .eq("share_token", token)
    .single();
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
  startedAt?: string;
  timeLimitSec?: number | null;
  /** True when this student already submitted — re-entry is refused. */
  alreadyCompleted?: boolean;
  resultId?: string;
  error?: string;
}

// Create-or-resume the student's single attempt for a test.
//   * already submitted -> refuse (alreadyCompleted), no new attempt
//   * in-progress        -> resume the same row (preserves the server start time)
//   * none               -> create one (the DB unique index makes this atomic)
// This is the anti-cheat core: one attempt row per (student, test) forever.
export async function startAttempt(testId: string): Promise<StartAttemptResult> {
  const user = await getServerUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (user.role !== "STUDENT") {
    return { ok: false, error: "Only students take tests." };
  }

  const supabase = await createClient();
  const { data: test, error: testErr } = await supabase
    .from("tests")
    .select("id, time_limit_sec")
    .eq("id", testId)
    .single();
  if (testErr || !test) return { ok: false, error: "Test not found." };

  // Existing attempt? (one per student per test, enforced by unique index)
  const { data: existing } = await supabase
    .from("attempts")
    .select("id, started_at, submitted_at")
    .eq("student_id", user.id)
    .eq("test_id", testId)
    .maybeSingle();

  if (existing) {
    if (existing.submitted_at) {
      const { data: result } = await supabase
        .from("results")
        .select("id")
        .eq("attempt_id", existing.id)
        .maybeSingle();
      return {
        ok: true,
        alreadyCompleted: true,
        resultId: result?.id,
      };
    }
    return {
      ok: true,
      attemptId: existing.id,
      startedAt: existing.started_at,
      timeLimitSec: test.time_limit_sec,
    };
  }

  // No attempt yet -> create. The partial unique index (student_id, test_id)
  // means a concurrent double-start fails the second insert rather than making
  // two attempts; treat that race as "resume".
  const { data: created, error: insErr } = await supabase
    .from("attempts")
    .insert({ student_id: user.id, test_id: testId })
    .select("id, started_at")
    .single();

  if (insErr || !created) {
    const { data: raced } = await supabase
      .from("attempts")
      .select("id, started_at, submitted_at")
      .eq("student_id", user.id)
      .eq("test_id", testId)
      .maybeSingle();
    if (raced && !raced.submitted_at) {
      return {
        ok: true,
        attemptId: raced.id,
        startedAt: raced.started_at,
        timeLimitSec: test.time_limit_sec,
      };
    }
    return { ok: false, error: "Could not start the test." };
  }

  return {
    ok: true,
    attemptId: created.id,
    startedAt: created.started_at,
    timeLimitSec: test.time_limit_sec,
  };
}
