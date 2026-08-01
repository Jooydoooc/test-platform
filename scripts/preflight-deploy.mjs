// Pre-deploy guard: refuse to ship app code whose database dependencies are
// missing from the target project.
//
// Why this exists. `main` can be merged long before its migrations are applied
// (that is deliberate — see docs/prod-migration-runbook-0024-0030.md). The
// token-gated test flow calls SECURITY DEFINER RPCs introduced in 0025/0026.
// Deploying that code against a database without them means every student hits
// a failure the moment they open a share link: the RPC 404s, startAttempt()
// returns "Could not start the test.", and nobody can sit an exam. Nothing in
// `vercel deploy` notices, because the build succeeds — the breakage is purely
// a runtime schema mismatch.
//
// So: before deploying, probe the target database for each RPC the code needs.
//
// How the probe works. It uses the ANON key only — the same key already shipped
// in the client bundle, so this asks the database nothing a browser couldn't.
// It never writes: `anon` has no EXECUTE grant on these functions, so a call
// against a correctly-migrated database is *rejected*. That rejection is the
// signal we want:
//
//   PGRST202 / HTTP 404  -> PostgREST cannot find the function  -> MISSING
//   42501 permission denied -> the function exists, anon may not call it -> PRESENT
//   anything else         -> the function exists and responded    -> PRESENT
//
// Distinguishing "absent" from "present but forbidden" is the whole trick, and
// it needs no service-role key, no database password, and no write access.
//
// Escape hatch: SKIP_DEPLOY_PREFLIGHT=true. Documented, deliberate, and loud.

import { readFileSync, existsSync } from "node:fs";

// --- env ---------------------------------------------------------------------
// Prefer the real environment; fall back to .env.local so a local
// `npm run deploy` works without exporting anything by hand.
function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (process.env.SKIP_DEPLOY_PREFLIGHT === "true") {
  console.warn(
    "⚠ SKIP_DEPLOY_PREFLIGHT=true — database preflight bypassed. You are on your own.",
  );
  process.exit(0);
}

if (!url || !anon) {
  console.error(
    "✗ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set.\n" +
      "  Cannot verify the target database before deploying. Set them, or set\n" +
      "  SKIP_DEPLOY_PREFLIGHT=true if you genuinely mean to skip this.",
  );
  process.exit(1);
}

// --- what the app requires ---------------------------------------------------
// Each entry: the RPC the deployed code calls, and the migration that adds it.
// `args` matters: PostgREST resolves overloads by ARGUMENT NAME, so probing a
// function with the wrong parameter names returns PGRST202 ("could not find the
// function") even when it exists. Each probe must therefore use that function's
// real signature, or the check reports a false missing.
const TOKEN_ARG = { p_token: "00000000-0000-0000-0000-000000000000" };

const REQUIRED_RPCS = [
  { fn: "resolve_share_test", migration: "0025", args: TOKEN_ARG, why: "resolves /t/<token> to a test" },
  { fn: "share_test_questions", migration: "0025", args: TOKEN_ARG, why: "the only student path to question content" },
  { fn: "start_share_attempt", migration: "0025", args: TOKEN_ARG, why: "mints the single attempt row" },
  { fn: "start_share_html_attempt", migration: "0026", args: TOKEN_ARG, why: "same, for hosted HTML tests" },
  {
    fn: "finalize_test_attempt",
    migration: "0019",
    why: "atomic submit + grading",
    args: {
      p_attempt_id: "00000000-0000-0000-0000-000000000000",
      p_student_id: "00000000-0000-0000-0000-000000000000",
      p_status: "COMPLETED",
      p_excluded: false,
      p_answers: [],
      p_skill_scores: [],
      p_exp: 0,
      p_exp_unique_key: "preflight",
    },
  },
];

async function probe(fn, args) {
  // Syntactically valid but meaningless arguments. If the function exists we
  // are refused by the grant long before anything is evaluated, so nothing runs
  // and nothing is written.
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  let code = null;
  try {
    code = (await res.json())?.code ?? null;
  } catch {
    /* empty or non-JSON body still tells us the function responded */
  }
  // PGRST202 is PostgREST's "could not find the function in the schema cache".
  const missing = res.status === 404 || code === "PGRST202";
  return { missing, status: res.status, code };
}

// --- run ---------------------------------------------------------------------
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
})();

console.log(`Preflight: checking database dependencies against ${host}`);

const results = [];
for (const r of REQUIRED_RPCS) {
  try {
    results.push({ ...r, ...(await probe(r.fn, r.args)) });
  } catch (err) {
    console.error(
      `✗ Could not reach ${host} while probing ${r.fn}: ${err.message}\n` +
        "  Refusing to deploy against a database that cannot be verified.",
    );
    process.exit(1);
  }
}

const missing = results.filter((r) => r.missing);

for (const r of results) {
  const mark = r.missing ? "✗" : "✓";
  const state = r.missing
    ? `MISSING (needs migration ${r.migration})`
    : `present (HTTP ${r.status}${r.code ? `, ${r.code}` : ""})`;
  console.log(`  ${mark} ${r.fn} — ${state}`);
}

if (missing.length === 0) {
  console.log("✓ All required database functions are present. Safe to deploy.");
  process.exit(0);
}

const needed = [...new Set(missing.map((m) => m.migration))].sort();
console.error(
  `\n✗ DEPLOY BLOCKED — ${missing.length} required function(s) missing from ${host}.\n\n` +
    `  Deploying now would break test-taking for every student: the code calls\n` +
    `  these functions the moment a share link is opened.\n\n` +
    `  Missing migration(s): ${needed.join(", ")}\n` +
    `  Follow docs/prod-migration-runbook-0024-0030.md — apply the migrations,\n` +
    `  then deploy. Do not bypass this to "get the deploy out".\n`,
);
process.exit(1);
