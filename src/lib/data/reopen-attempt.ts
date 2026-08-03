"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerUser, isAdminRole } from "@/lib/auth-server";

// Admin-only "reopen a completed test" (migration 0037).
//
// SUPERSEDE, DON'T OVERWRITE: reopening never mutates the old attempt back to
// in-progress. It marks it `superseded_at = now()`, flags its result
// `excluded_from_progress = true`, and writes an append-only audit row — the
// old attempt, its answers, and its result stay exactly as they were forever.
// See supabase/migrations/0037_reopen_attempt.sql for the full reasoning
// (in particular why nulling submitted_at instead would deadlock a resubmit).
//
// Uses the SESSION client (createClient()), not the admin/service-role
// client — mirrors setTestPublished / setHtmlTestPublished in tests.ts. The
// RPC is SECURITY DEFINER and does its own ADMIN check by reading
// profiles.role for auth.uid(); that check is only meaningful if the call
// carries the caller's real session, not a service role that would always
// pass it.
export interface ReopenAttemptResult {
  ok: boolean;
  error?: string;
}

// Defence in depth, not a replacement for the SQL check: refuse an obvious
// non-admin before spending a database round trip. The RPC re-checks ADMIN
// itself regardless (see 0037's `if v_role is distinct from 'ADMIN'`), so a
// caller that somehow bypassed this guard (e.g. a stale role read) still
// can't get anywhere.
const NOT_ADMIN = "Only admins can reopen a test attempt.";

// Map every SQLSTATE the RPC can raise to a distinct, safe message — never
// forward raw Postgres text to the client. Mirrors the mapping convention in
// tests.ts (setTestPublished/setHtmlTestPublished) and attempts.ts
// (startAttempt). The RPC's P0002 refusals are distinguished only by message
// text (there is no separate code per reason), so match on that text rather
// than collapsing all three into one generic failure — a teacher acting on
// this needs to know WHICH refusal happened.
const ALREADY_SUPERSEDED = "This attempt has already been reopened.";
const NOT_SUBMITTED = "This attempt hasn't been submitted yet — there's nothing to reopen.";
const NOT_FOUND = "That attempt could not be found.";
const REOPEN_FAILED = "Could not reopen this attempt. Please try again.";

export async function reopenAttempt(
  attemptId: string,
  reason?: string,
): Promise<ReopenAttemptResult> {
  const user = await getServerUser().catch(() => null);
  if (!user || !isAdminRole(user.role)) {
    return { ok: false, error: NOT_ADMIN };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_test_attempt", {
    p_attempt_id: attemptId,
    p_reason: reason ?? null,
  });

  if (error) {
    if (error.code === "42501") return { ok: false, error: NOT_ADMIN };
    if (error.code === "P0002") {
      // The RPC's exact wording distinguishes the three P0002 refusals
      // (see reopen_test_attempt in 0037): match on it rather than
      // collapsing them into one message.
      if (error.message.includes("already reopened")) {
        return { ok: false, error: ALREADY_SUPERSEDED };
      }
      if (error.message.includes("not submitted")) {
        return { ok: false, error: NOT_SUBMITTED };
      }
      return { ok: false, error: NOT_FOUND };
    }
    return { ok: false, error: REOPEN_FAILED };
  }

  return { ok: true };
}
