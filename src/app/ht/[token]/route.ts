import { getServerUser } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// Serve a hosted HTML test at /ht/<share_token>. Login is required (closed
// platform, like /t/<token>). The bucket is private and students have no direct
// object access, so we resolve the token under the caller's RLS, then stream the
// file with the service-role client. The raw HTML is returned as a full page —
// these are full-screen exam UIs, no app chrome needed.
//
// Score capture (Phase 2): when the student loads the page we create-or-resume
// an attempt row (mirroring startAttempt for DB tests) and inject a small bridge
// script so the HTML can POST its self-computed score back to /api/tests/html/submit.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!SUPABASE_ENABLED) {
    return new Response("Backend not configured.", { status: 503 });
  }

  const user = await getServerUser().catch(() => null);
  if (!user) {
    return new Response("Sign in to take this test.", { status: 401 });
  }

  const { token } = await params;

  // Resolve the share token to the test row. The user's RLS-scoped client
  // enforces that only signed-in users can read html_tests metadata.
  const supabase = await createClient();
  const { data: test } = await supabase
    .from("html_tests")
    .select("id, storage_path")
    .eq("share_token", token)
    .maybeSingle();

  if (!test) {
    return new Response("Test not found.", { status: 404 });
  }

  // Download the HTML file with the service-role client — students have no
  // direct bucket access (see 0012_html_tests.sql storage policies).
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from("html-tests")
    .download(test.storage_path);

  if (error || !blob) {
    return new Response("Could not load the test file.", { status: 500 });
  }

  // Create-or-resume the student's single attempt for this HTML test.
  // We use the RLS-scoped client for the insert so the attempts_insert policy
  // (student_id = auth.uid()) is the enforcing gate — not application logic.
  //
  // Race handling mirrors startAttempt in src/lib/data/attempts.ts:
  //   * existing + submitted  -> resume (student reviews); keep attemptId
  //   * existing + in-progress -> resume the same row
  //   * none                  -> insert; on unique-index collision re-select
  let attemptId: string | null = null;
  try {
    const { data: existing } = await supabase
      .from("attempts")
      .select("id, submitted_at")
      .eq("student_id", user.id)
      .eq("html_test_id", test.id)
      .maybeSingle();

    if (existing) {
      // Already have a row (submitted or in-progress) — reuse it.
      attemptId = existing.id;
    } else {
      // No row yet — create one. The partial unique index makes a concurrent
      // double-open fail the second insert rather than producing two rows.
      const { data: created, error: insErr } = await supabase
        .from("attempts")
        .insert({ student_id: user.id, html_test_id: test.id })
        .select("id")
        .single();

      if (insErr || !created) {
        // Likely lost a concurrent race — re-select the winner.
        const { data: raced } = await supabase
          .from("attempts")
          .select("id")
          .eq("student_id", user.id)
          .eq("html_test_id", test.id)
          .maybeSingle();
        attemptId = raced?.id ?? null;
      } else {
        attemptId = created.id;
      }
    }
  } catch {
    // Non-fatal: attempt creation failing must not block the student from
    // loading the test. The submit endpoint will 404 on an unknown attemptId.
    attemptId = null;
  }

  let html = await blob.text();

  // Inject the bridge script so the HTML can report its self-computed score.
  // The script sets two globals the HTML reads after it finishes grading:
  //   window.LEXORA_TEST.attemptId  — the row to close out
  //   window.LEXORA_TEST.submitUrl  — the endpoint to POST to
  // Only inject when we have a real attemptId (the attempt must exist before
  // the HTML can submit a score against it).
  if (attemptId) {
    const bridge = `<script>window.LEXORA_TEST={attemptId:"${attemptId}",submitUrl:"/api/tests/html/submit"};</script>`;
    const bodyClose = html.search(/<\/body>/i);
    if (bodyClose !== -1) {
      html = html.slice(0, bodyClose) + bridge + html.slice(bodyClose);
    } else {
      // No </body> — append to the end (some minimal test HTML omits it).
      html = html + bridge;
    }
  }

  // -------------------------------------------------------------------------
  // Security headers for the served HTML document.
  //
  // These tests are self-contained HTML files with inline scripts/styles and
  // no external resource dependencies. The bridge script injected above uses
  // a same-origin fetch to POST scores to /api/tests/html/submit.
  //
  // CSP rationale:
  //   script-src 'unsafe-inline'  — all scripts are inline (self-contained HTML
  //                                  + the injected bridge above); no external JS.
  //   style-src  'unsafe-inline'  — all styles are inline; no external CSS.
  //   img-src    data: blob:      — tests may embed data-URI or blob images.
  //   font-src   data:            — tests may embed data-URI fonts.
  //   connect-src 'self'          — bridge POSTs to same-origin submit endpoint.
  //   base-uri   'none'           — prevent <base href> hijack.
  //   form-action 'none'          — no HTML forms post externally.
  //   frame-ancestors 'self'      — only our own pages may embed this (replaces
  //                                  X-Frame-Options: SAMEORIGIN, which we still
  //                                  send for older clients).
  //   default-src 'none'          — deny everything not explicitly listed.
  // -------------------------------------------------------------------------
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Private to the signed-in student; never cache on shared proxies.
      "Cache-Control": "private, no-store",
      // Contain the uploaded HTML: disallow external resource loads and script
      // execution beyond what the self-contained tests and score bridge need.
      "Content-Security-Policy": [
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        "img-src data: blob:",
        "font-src data:",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'self'",
      ].join("; "),
      // Belt-and-suspenders framing protection for older clients that don't
      // honour frame-ancestors.
      "X-Frame-Options": "SAMEORIGIN",
      // Prevent MIME-type sniffing on the served document.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
