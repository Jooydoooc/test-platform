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
//   * first tab/app switch warns; the second forces the test to submit;
//   * recording of blur / fullscreen-exit and other integrity events;
//   * a fetch() wrapper that attaches the integrity tally to the score POST, so
//     hosted tests report proctor data without any change to their own code.
//
// Event-type keys match the React proctor (Proctor.tsx) so teacher-facing data
// is uniform. TRUST NOTE: browser-side deterrence only — a hint, never proof,
// and it never alters the self-computed score.
//
// Hosted tests expose a global submitTest() function or a submit control marked
// with data-lexora-submit. That small contract lets the shell submit partial
// answers consistently without knowing each test's internal question model.
function proctorBlock(): string {
  return `
<style>
  #lx-gate,#lx-guard,#lx-warning{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;
    background:#1b2130;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  #lx-guard,#lx-warning{display:none;background:rgba(27,33,48,.94);backdrop-filter:blur(6px)}
  .lx-panel{max-width:420px;width:100%;background:#fff;color:#1b2130;border:1px solid #e3e1db;border-radius:18px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
  .lx-badge{display:inline-flex;align-items:center;gap:6px;background:#fdf7ea;color:#7d561c;font-size:12px;font-weight:700;
    padding:5px 11px;border-radius:999px}
  .lx-panel h2{margin:14px 0 6px;font-size:22px;letter-spacing:-.02em}
  .lx-panel p{margin:0 0 12px;font-size:14px;color:#475569}
  .lx-rules{list-style:none;margin:0 0 18px;padding:0;font-size:13.5px;color:#334155}
  .lx-rules li{display:flex;gap:9px;align-items:flex-start;margin:9px 0}
  .lx-rules li b{color:#1b2130}
  .lx-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:#e3a82b;margin-top:6px}
  .lx-btn{width:100%;border:none;cursor:pointer;background:#1b2130;color:#fff;font-size:15px;font-weight:700;padding:13px;border-radius:10px}
  .lx-btn:hover{background:#333a4a}
  #lx-pill{position:fixed;top:12px;right:12px;z-index:2147483645;display:none;align-items:center;gap:6px;
    background:rgba(27,33,48,.9);color:#fff;font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;
    padding:6px 11px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
  #lx-pill.flag{background:#7f1d1d;color:#fecaca}
  #lx-done{display:none;position:fixed;left:0;right:0;bottom:0;z-index:2147483646;
    align-items:center;justify-content:center;gap:14px;padding:12px 16px;text-align:center;
    background:rgba(255,255,255,.95);backdrop-filter:blur(8px);border-top:1px solid #e2e8f0;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  #lx-done.show{display:flex}
  #lx-done #lx-back{background:#1b2130;color:#fff;font-weight:700;font-size:14px;padding:10px 22px;border-radius:10px;text-decoration:none}
  #lx-done #lx-back:hover{background:#333a4a}
</style>
<div id="lx-gate">
  <div class="lx-panel">
    <span class="lx-badge">Secure test</span>
    <h2>Secure mode</h2>
    <p>This is a monitored, single-attempt test. Before you begin:</p>
    <ul class="lx-rules">
      <li><span class="lx-dot"></span><span>It runs in <b>fullscreen</b>. Leaving fullscreen is recorded.</span></li>
      <li><span class="lx-dot"></span><span><b>First tab or app switch:</b> warning. <b>Second switch:</b> automatic submission.</span></li>
      <li><span class="lx-dot"></span><span>Copy, paste and right-click are disabled.</span></li>
    </ul>
    <button class="lx-btn" id="lx-begin">Begin secure test</button>
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
<div id="lx-warning">
  <div class="lx-panel" style="text-align:center">
    <span class="lx-badge">First warning</span>
    <h2 id="lx-warning-title">You left the test</h2>
    <p id="lx-warning-text">This switch was recorded. If you switch tabs or apps again, your test will be submitted automatically.</p>
    <button class="lx-btn" id="lx-continue">Continue test</button>
  </div>
</div>
<div id="lx-pill"><span>Secure</span><span id="lx-count"></span></div>
<div id="lx-done">
  <span style="font-size:14px;color:#475569;font-weight:600">Test complete.</span>
  <a href="/tests" id="lx-back">Back to Test Center</a>
</div>
<script>
(function(){
  // started marks the primary exam flow (gate passed, not yet finished).
  // guarded marks whether lockdown protections are armed -- it is set
  // alongside started on Begin, but unlike started it is NOT cleared when
  // a forced submit fires or fails. That split is what lets a student sit in
  // the "submit failed, please retry" state with copy/paste/tab/fullscreen
  // protections still fully live. guarded only drops in release() (real
  // success) since that is the sole point every protection may legitimately
  // stand down.
  var started=false, guarded=false, finished=false, autoSubmitting=false, tabStrikes=0, pendingWarning=false;
  // Preview mode: teacher/admin viewing the test. The bridge script above sets
  // window.LEXORA_TEST only when a real attempt row exists (see route.ts) --
  // for a previewer it is never injected, so there is no submitUrl for the
  // hosted test to POST to and no attemptId to close out. Lockdown must never
  // arm in that case: forceSubmit() calls the hosted page's submitTest(), and
  // with no bridge that never issues a matching POST, so the fetch wrapper's
  // isSubmit match never fires and neither release() nor submitFailed() would
  // ever run, stranding the previewer on the "Submitting your test" overlay
  // forever. previewMode is computed once, up front, from a global the bridge
  // script (injected before this one, same payload) has already set by now.
  var previewMode=!(window.LEXORA_TEST&&window.LEXORA_TEST.submitUrl);
  var integrity={violations:0,flags:{}};
  var gate=document.getElementById('lx-gate'), guard=document.getElementById('lx-guard'),
      warning=document.getElementById('lx-warning'), warningTitle=document.getElementById('lx-warning-title'),
      warningText=document.getElementById('lx-warning-text'),
      pill=document.getElementById('lx-pill'), count=document.getElementById('lx-count'),
      done=document.getElementById('lx-done');
  function inFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
  // Called once the test's score has been submitted: lift the lockdown so the
  // student can leave fullscreen and return to the Test Center (fixes the trap
  // where the guard kept demanding re-entry after the test was already done).
  // The done bar is fixed to the bottom of the viewport, and hosted tests
  // commonly put their OWN fixed bar there (prev/next + question dots). Ours
  // has a near-max z-index, so it silently covered theirs — after submitting,
  // "See detailed answers" opened review with no way to reach questions 2..N.
  // Lift anything else anchored to bottom:0 above our bar, and pad the body so
  // normal page content can still scroll clear of it.
  function clearBottomBar(){
    var h=done.offsetHeight||56;
    var all=document.body.getElementsByTagName('*');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el===done||el===guard||el===warning||el===gate||el===pill)continue;
      try{
        var cs=getComputedStyle(el);
        if(cs.position==='fixed'&&Math.abs(parseFloat(cs.bottom))<1){el.style.bottom=h+'px';}
      }catch(x){}
    }
    var pb=parseFloat(getComputedStyle(document.body).paddingBottom)||0;
    if(pb<h)document.body.style.paddingBottom=h+'px';
  }
  function release(){
    if(finished)return;finished=true;started=false;guarded=false;
    guard.style.display='none';warning.style.display='none';pill.style.display='none';done.className='show';
    if(inFs()){var ex=document.exitFullscreen||document.webkitExitFullscreen;try{ex&&ex.call(document);}catch(x){}}
    // Measure after the bar is displayed, and again once the test has had a
    // chance to reveal its own review nav (which starts hidden).
    clearBottomBar();setTimeout(clearBottomBar,300);setTimeout(clearBottomBar,1500);
  }
  function reqFs(){var e=document.documentElement;var f=e.requestFullscreen||e.webkitRequestFullscreen;try{var r=f&&f.call(e);if(r&&r.catch)r.catch(function(){});}catch(x){}}
  function editable(el){if(!el||!el.tagName)return false;var t=el.tagName.toUpperCase();return t==='INPUT'||t==='TEXTAREA'||el.isContentEditable;}
  function render(){count.textContent=integrity.violations>0?('· '+integrity.violations):'';pill.className=integrity.violations>0?'flag':'';}
  function record(t){integrity.flags[t]=(integrity.flags[t]||0)+1;integrity.violations++;render();}
  function showWarning(){
    pendingWarning=false;
    warningTitle.textContent='You left the test';
    warningText.textContent='This switch was recorded. If you switch tabs or apps again, your test will be submitted automatically.';
    document.getElementById('lx-continue').style.display='block';
    warning.style.display='flex';
  }
  function forceSubmit(){
    if(autoSubmitting||finished)return;
    // Guarded is never armed in preview (see the Begin handler below), so this
    // path should be unreachable there -- but if that ever changes, fail safe
    // rather than hang on a submit that has nowhere to go.
    if(previewMode){release();return;}
    // started drops so callers know the primary exam flow ended, but guarded
    // is deliberately left alone here: lockdown protections must stay armed
    // through submitFailed() in case this forced submit does not succeed.
    autoSubmitting=true;started=false;guard.style.display='none';warning.style.display='flex';
    warningTitle.textContent='Submitting your test';
    warningText.textContent='You left the test a second time. Your current answers are being submitted.';
    document.getElementById('lx-continue').style.display='none';
    try{window.dispatchEvent(new CustomEvent('lexora:force-submit'));}catch(x){}
    setTimeout(function(){
      try{
        if(typeof window.submitTest==='function'){window.submitTest();return;}
        var btn=document.querySelector('[data-lexora-submit],#btnFinalSubmit,#submitTest,#submit-test');
        if(btn&&typeof btn.click==='function'){btn.click();return;}
      }catch(x){}
      submitFailed('Submission needs attention','The test could not submit automatically. Press "Try again" on the test below, or tell your teacher if it keeps failing.');
    },0);
  }

  // A submit POST that failed (non-ok response OR network rejection), or a
  // forced submit that could not even be attempted (no submitTest()/button
  // found). The full-screen warning has to come down so the hosted test's own
  // "Try again" control underneath is clickable, but lockdown stays real:
  // guarded was never cleared (only started was, by forceSubmit), so
  // copy/paste/keyboard/context-menu blocking, tab-switch and blur recording,
  // visibility monitoring and the fullscreen guard are all still live and
  // still recording into integrity while the student sits on this screen.
  // release() only runs on a verified success, so exitFullscreen/pill-hide/
  // done-bar never fire on a failure. A later successful retry still goes
  // through the fetch wrapper below, still carries the accumulated integrity
  // tally, and calls release() exactly as before.
  function submitFailed(title,text){
    if(finished)return;
    warningTitle.textContent=title||'Submission did not save';
    warningText.textContent=text||'Your test did not save. Press "Try again" on the test below to resubmit.';
    warning.style.display='none';
  }

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
    // The hosted test POSTs its score exactly once, at the end — release the
    // lockdown only once that POST actually succeeded (resolved AND ok). A
    // non-ok response (400/401/500/etc) or a network rejection must NOT
    // release: the student stays proctored and can use "Try again" while the
    // page still shows the score could not be saved.
    if(isSubmit){try{p.then(function(r){if(r&&r.ok){release();}else{submitFailed();}},function(){submitFailed();});}catch(x){}}
    return p;
  };

  document.addEventListener('contextmenu',function(e){if(guarded){e.preventDefault();record('right_click');}});
  document.addEventListener('copy',function(e){if(guarded){e.preventDefault();record('copy');}});
  document.addEventListener('cut',function(e){if(guarded){e.preventDefault();record('cut');}});
  document.addEventListener('paste',function(e){if(guarded){e.preventDefault();record('paste');}});
  document.addEventListener('selectstart',function(e){if(guarded&&!editable(e.target))e.preventDefault();});
  document.addEventListener('keydown',function(e){
    if(!guarded)return;var k=(e.key||'').toLowerCase();var m=e.ctrlKey||e.metaKey;
    if(e.key==='F12'||(m&&e.shiftKey&&(k==='i'||k==='j'||k==='c'))||(m&&k==='u')){e.preventDefault();record('devtools_key');return;}
    if(m&&(k==='c'||k==='x'||k==='v'||k==='p'||k==='s'))e.preventDefault();
  });
  window.addEventListener('blur',function(){if(guarded)record('window_blur');});
  document.addEventListener('visibilitychange',function(){
    if(!guarded)return;
    if(document.hidden){
      record('tab_switch');tabStrikes++;
      // forceSubmit() no-ops once autoSubmitting is set (it is never reset),
      // so extra strikes while a failed forced submit awaits "Try again"
      // are still recorded but cannot pile up a second forced submission
      // or loop.
      if(tabStrikes>=2)forceSubmit();
    }else if(tabStrikes===1&&!autoSubmitting){
      if(inFs())showWarning();else pendingWarning=true;
    }
  });
  function onFs(){
    if(!guarded||finished)return;
    if(!inFs()){record('fullscreen_exit');guard.style.display='flex';warning.style.display='none';}
    else{guard.style.display='none';if(pendingWarning)showWarning();}
  }
  document.addEventListener('fullscreenchange',onFs);
  document.addEventListener('webkitfullscreenchange',onFs);

  document.getElementById('lx-begin').addEventListener('click',function(){
    started=true;gate.style.display='none';
    // Preview: let the previewer straight through, unguarded. No copy/paste
    // blocking, no fullscreen requirement, no tab-switch tracking, no forced
    // submit -- there is nothing on the other end for a forced submit to
    // reach, so the lockdown that would normally follow a Begin click simply
    // never arms.
    if(previewMode)return;
    guarded=true;pill.style.display='inline-flex';render();reqFs();
  });
  document.getElementById('lx-reenter').addEventListener('click',function(){reqFs();guard.style.display='none';if(pendingWarning)setTimeout(showWarning,100);});
  document.getElementById('lx-continue').addEventListener('click',function(){warning.style.display='none';});
})();
</script>`;
}

function completedTestResponse(): Response {
  return new Response(
    `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test completed</title><style>
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#fafaf8;color:#1b2130;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
      main{width:min(100%,420px);border:1px solid #e3e1db;border-radius:18px;background:#fff;padding:28px;text-align:center;box-shadow:0 8px 24px rgba(27,33,48,.08)}
      span{display:grid;place-items:center;width:44px;height:44px;margin:auto;border-radius:12px;background:#edf7f1;color:#3f8f5f;font-size:24px}h1{margin:16px 0 8px;font-size:24px}p{margin:0;color:#5f6675;line-height:1.55}a{display:inline-flex;min-height:44px;align-items:center;justify-content:center;margin-top:20px;border-radius:10px;background:#1b2130;color:#fff;padding:0 18px;font-weight:700;text-decoration:none}a:hover{background:#333a4a}
    </style><main><span aria-hidden="true">&#10003;</span><h1>Test already completed</h1><p>This was a single-attempt test. Your saved result has not changed.</p><a href="/tests">Back to Test Center</a></main></html>`,
    {
      status: 409,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
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
  //
  // FAIL CLOSED: completion-gating outranks availability here. An RPC error is
  // NOT distinguishable from "no rows" by shape alone, and treating an error as
  // "no rows" would silently degrade into the teacher/admin preview path for a
  // student — serving full question content to someone whose attempt status we
  // failed to confirm, possibly one who already submitted. So an explicit
  // `error` on the call refuses to serve the test outright, even though that
  // now also blocks a student on a transient failure. (The old comment here
  // said attempt-creation failure "must not block the student" — that is
  // superseded: confirming non-completion now matters more than availability.)
  let attemptId: string | null = null;
  let alreadySubmitted = false;
  const { data: started, error: startError } = await supabase
    .rpc("start_share_html_attempt", { p_token: token })
    .maybeSingle<{ attempt_id: string; submitted_at: string | null }>();

  if (startError) {
    return new Response(
      "We could not verify your test attempt. Please try again, or contact your teacher if this keeps happening.",
      { status: 503 },
    );
  }

  if (started) {
    attemptId = started.attempt_id;
    alreadySubmitted = started.submitted_at !== null;
  }
  // else: no row and no error — the RPC's documented teacher/admin preview
  // case. attemptId stays null, which is also what suppresses the bridge
  // script below, so preview stays unscored as before.

  // Completion is terminal for a graded test. Do not hand question content
  // back to a student through an old share link after their attempt is closed.
  if (alreadySubmitted) return completedTestResponse();

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
    ? `<script>window.LEXORA_TEST={attemptId:"${attemptId}",submitUrl:"/api/tests/html/submit"};</script>`
    : "";
  const inject = bridge + proctorBlock();
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
