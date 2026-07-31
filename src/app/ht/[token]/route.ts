import { getServerUser } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// ---------------------------------------------------------------------------
// Proctor lockdown injected into every hosted test (strict mode). It is a
// self-contained inline block (allowed by the page CSP's script-src/style-src
// 'unsafe-inline') that adds, around whatever the hosted HTML does:
//   * a "Begin secure test" gate that enters fullscreen on click;
//   * a re-enter guard when the student leaves fullscreen;
//   * blocking of copy/cut/paste, right-click, text-selection and devtools keys;
//   * recording of tab-switch / blur / fullscreen-exit as integrity events;
//   * a fetch() wrapper that attaches the integrity tally to the score POST, so
//     hosted tests report proctor data without any change to their own code.
//
// Event-type keys match the React proctor (Proctor.tsx) so teacher-facing data
// is uniform. TRUST NOTE: browser-side deterrence only — a hint, never proof,
// and it never alters the self-computed score.
//
// `alreadySubmitted` changes only the entry-gate copy: the submit endpoint
// refuses to score an attempt twice, so a student reopening a finished test must
// be told up front that this run is review-only and will not count.
function proctorBlock(alreadySubmitted: boolean): string {
  return `
<style>
  #lx-gate,#lx-guard{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;
    background:linear-gradient(135deg,#0f172a,#312e81);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  #lx-guard{display:none;background:rgba(15,23,42,.9);backdrop-filter:blur(6px)}
  .lx-panel{max-width:420px;width:100%;background:#fff;color:#1e293b;border-radius:20px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .lx-badge{display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:700;
    padding:5px 11px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
  .lx-panel h2{margin:14px 0 6px;font-size:22px;letter-spacing:-.02em}
  .lx-panel p{margin:0 0 12px;font-size:14px;color:#475569}
  .lx-rules{list-style:none;margin:0 0 18px;padding:0;font-size:13.5px;color:#334155}
  .lx-rules li{display:flex;gap:9px;align-items:flex-start;margin:9px 0}
  .lx-rules li b{color:#1e293b}
  .lx-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:#6366f1;margin-top:6px}
  .lx-btn{width:100%;border:none;cursor:pointer;background:#4f46e5;color:#fff;font-size:15px;font-weight:700;
    padding:13px;border-radius:12px;box-shadow:0 8px 20px rgba(79,70,229,.35)}
  .lx-btn:hover{background:#4338ca}
  #lx-pill{position:fixed;top:12px;right:12px;z-index:2147483645;display:none;align-items:center;gap:6px;
    background:rgba(15,23,42,.85);color:#c7d2fe;font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;
    padding:6px 11px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
  #lx-pill.flag{background:#7f1d1d;color:#fecaca}
  #lx-done{display:none;position:fixed;left:0;right:0;bottom:0;z-index:2147483646;
    align-items:center;justify-content:center;gap:14px;padding:12px 16px;text-align:center;
    background:rgba(255,255,255,.95);backdrop-filter:blur(8px);border-top:1px solid #e2e8f0;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  #lx-done.show{display:flex}
  #lx-done #lx-back{background:#4f46e5;color:#fff;font-weight:700;font-size:14px;padding:10px 22px;
    border-radius:10px;text-decoration:none;box-shadow:0 6px 16px rgba(79,70,229,.3)}
  #lx-done #lx-back:hover{background:#4338ca}
</style>
<div id="lx-gate">
  <div class="lx-panel">
    ${
      alreadySubmitted
        ? `<span class="lx-badge" style="background:#ecfdf5;color:#065f46">&#10003; Already completed</span>
    <h2>Review only</h2>
    <p>You have already completed this test and your score has been recorded. You can open it again to practise, but:</p>
    <ul class="lx-rules">
      <li><span class="lx-dot" style="background:#059669"></span><span><b>This run will not be scored.</b> Your recorded result and XP stay as they are.</span></li>
      <li><span class="lx-dot" style="background:#059669"></span><span>Whatever score the test shows you at the end is practice only.</span></li>
    </ul>
    <button class="lx-btn" id="lx-begin">Open for review</button>
    <a href="/tests" style="display:block;margin-top:12px;text-align:center;font-size:13px;color:#64748b;text-decoration:none">Back to Test Center</a>`
        : `<span class="lx-badge">&#128737; Proctored exam</span>
    <h2>Secure mode</h2>
    <p>This is a monitored, single-attempt test. Before you begin:</p>
    <ul class="lx-rules">
      <li><span class="lx-dot"></span><span>It runs in <b>fullscreen</b>. Leaving fullscreen is recorded.</span></li>
      <li><span class="lx-dot"></span><span><b>Switching tabs or apps is recorded</b> as an integrity flag.</span></li>
      <li><span class="lx-dot"></span><span>Copy, paste and right-click are disabled.</span></li>
    </ul>
    <button class="lx-btn" id="lx-begin">&#128737; Begin secure test</button>`
    }
  </div>
</div>
<div id="lx-guard">
  <div class="lx-panel" style="text-align:center">
    <h2>Return to secure mode</h2>
    <p>You left fullscreen. This test is proctored and the event was recorded. Re-enter to continue, or leave the test.</p>
    <button class="lx-btn" id="lx-reenter">Re-enter fullscreen</button>
    <a href="/tests" id="lx-leave" style="display:inline-block;margin-top:12px;font-size:13px;color:#64748b;text-decoration:none">Leave test</a>
  </div>
</div>
<div id="lx-pill"><span>&#128737; Secure</span><span id="lx-count"></span></div>
<div id="lx-done">
  <span style="font-size:14px;color:#475569;font-weight:600">Test complete.</span>
  <a href="/tests" id="lx-back">Back to Test Center</a>
</div>
<script>
(function(){
  var started=false, finished=false, integrity={violations:0,flags:{}};
  var gate=document.getElementById('lx-gate'), guard=document.getElementById('lx-guard'),
      pill=document.getElementById('lx-pill'), count=document.getElementById('lx-count'),
      done=document.getElementById('lx-done');
  function inFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
  // Called once the test's score has been submitted: lift the lockdown so the
  // student can leave fullscreen and return to the Test Center (fixes the trap
  // where the guard kept demanding re-entry after the test was already done).
  function release(){
    if(finished)return;finished=true;started=false;
    guard.style.display='none';pill.style.display='none';done.className='show';
    if(inFs()){var ex=document.exitFullscreen||document.webkitExitFullscreen;try{ex&&ex.call(document);}catch(x){}}
  }
  function reqFs(){var e=document.documentElement;var f=e.requestFullscreen||e.webkitRequestFullscreen;try{var r=f&&f.call(e);if(r&&r.catch)r.catch(function(){});}catch(x){}}
  function editable(el){if(!el||!el.tagName)return false;var t=el.tagName.toUpperCase();return t==='INPUT'||t==='TEXTAREA'||el.isContentEditable;}
  function render(){count.textContent=integrity.violations>0?('· '+integrity.violations):'';pill.className=integrity.violations>0?'flag':'';}
  function record(t){integrity.flags[t]=(integrity.flags[t]||0)+1;integrity.violations++;render();}

  // Attach the integrity tally to the score POST without touching the test's code.
  var _fetch=window.fetch;
  window.fetch=function(input,init){
    var isSubmit=false;
    try{
      var lt=window.LEXORA_TEST||{};var url=(typeof input==='string')?input:(input&&input.url);
      if(lt.submitUrl&&url&&url.indexOf(lt.submitUrl)!==-1){
        isSubmit=true;
        if(init&&typeof init.body==='string'){
          var b=JSON.parse(init.body);b.integrity={violations:integrity.violations,flags:integrity.flags};init.body=JSON.stringify(b);
        }
      }
    }catch(x){}
    var p=_fetch.apply(this,arguments);
    // The hosted test POSTs its score exactly once, at the end — releasing the
    // lockdown when that request settles lets the student navigate away.
    if(isSubmit){try{p.then(function(){release();},function(){release();});}catch(x){}}
    return p;
  };

  document.addEventListener('contextmenu',function(e){if(started){e.preventDefault();record('right_click');}});
  document.addEventListener('copy',function(e){if(started){e.preventDefault();record('copy');}});
  document.addEventListener('cut',function(e){if(started){e.preventDefault();record('cut');}});
  document.addEventListener('paste',function(e){if(started){e.preventDefault();record('paste');}});
  document.addEventListener('selectstart',function(e){if(started&&!editable(e.target))e.preventDefault();});
  document.addEventListener('keydown',function(e){
    if(!started)return;var k=(e.key||'').toLowerCase();var m=e.ctrlKey||e.metaKey;
    if(e.key==='F12'||(m&&e.shiftKey&&(k==='i'||k==='j'||k==='c'))||(m&&k==='u')){e.preventDefault();record('devtools_key');return;}
    if(m&&(k==='c'||k==='x'||k==='v'||k==='p'||k==='s'))e.preventDefault();
  });
  window.addEventListener('blur',function(){if(started)record('window_blur');});
  document.addEventListener('visibilitychange',function(){if(started&&document.hidden)record('tab_switch');});
  function onFs(){if(!started||finished)return;if(!inFs()){record('fullscreen_exit');guard.style.display='flex';}else{guard.style.display='none';}}
  document.addEventListener('fullscreenchange',onFs);
  document.addEventListener('webkitfullscreenchange',onFs);

  document.getElementById('lx-begin').addEventListener('click',function(){
    started=true;gate.style.display='none';pill.style.display='inline-flex';render();reqFs();
  });
  document.getElementById('lx-reenter').addEventListener('click',function(){reqFs();guard.style.display='none';});
})();
</script>`;
}

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

  // Resolve the share token to the test row. Under migration 0025 students can
  // no longer select html_tests rows they have no attempt on — tests are
  // unlisted and THE LINK IS THE KEY — so resolution goes through the SECURITY
  // DEFINER RPC, which requires a signed-in caller plus the exact token.
  const supabase = await createClient();
  const { data: test } = await supabase
    .rpc("resolve_share_html_test", { p_token: token })
    .maybeSingle<{ id: string; title: string; storage_path: string }>();

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
  //
  // Migration 0026 revoked direct INSERT on `attempts` from `authenticated`, so
  // this goes through the token-keyed SECURITY DEFINER RPC. That is the point:
  // holding the share token — not merely knowing a test id — is what mints the
  // attempt row that unlocks html_tests_select for this student.
  //
  // The RPC handles create-or-resume and the concurrent-open race internally
  // (insert ... on conflict do nothing, then select). It returns no rows for a
  // teacher/admin, who gets the file in unscored preview mode.
  let attemptId: string | null = null;
  let alreadySubmitted = false;
  try {
    const { data: started } = await supabase
      .rpc("start_share_html_attempt", { p_token: token })
      .maybeSingle<{ attempt_id: string; submitted_at: string | null }>();

    if (started) {
      attemptId = started.attempt_id;
      alreadySubmitted = started.submitted_at !== null;
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
  // Bridge (score reporting) needs a real attempt; the proctor lockdown is
  // injected regardless so the exam is secured even if scoring is unavailable.
  const bridge = attemptId
    ? `<script>window.LEXORA_TEST={attemptId:"${attemptId}",submitUrl:"/api/tests/html/submit",alreadySubmitted:${alreadySubmitted}};</script>`
    : "";
  const inject = bridge + proctorBlock(alreadySubmitted);
  const bodyClose = html.search(/<\/body>/i);
  if (bodyClose !== -1) {
    html = html.slice(0, bodyClose) + inject + html.slice(bodyClose);
  } else {
    // No </body> — append to the end (some minimal test HTML omits it).
    html = html + inject;
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
