// Build-time guard against shipping the localStorage demo-auth fallback to
// production.
//
// When NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are absent, SUPABASE_ENABLED is
// false and the app falls back to auth-legacy.ts — which hardcodes demo
// credentials in the client bundle. That fallback is fine for local dev and
// throwaway previews, but if a *production* deploy ever ships without those
// vars, anyone can read the demo credentials in devtools and sign in as a
// teacher. So: fail a production build that isn't Supabase-configured.
//
// Kept deliberately narrow so it never breaks local builds:
//   * Only trips on a real production deploy (Vercel sets VERCEL_ENV=production),
//     or when REQUIRE_SUPABASE=true is set explicitly (e.g. other CI).
//   * ALLOW_LEGACY_AUTH=true is an explicit, documented escape hatch for the
//     rare intentional demo-in-prod case.
// A local `next build` in legacy mode still succeeds (with a warning).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const configured = Boolean(url && anon);

const isProductionDeploy =
  process.env.VERCEL_ENV === "production" ||
  process.env.REQUIRE_SUPABASE === "true";
const allowLegacy = process.env.ALLOW_LEGACY_AUTH === "true";

if (configured) {
  console.log("✓ Supabase env present — real auth enabled.");
  process.exit(0);
}

if (isProductionDeploy && !allowLegacy) {
  console.error(
    [
      "",
      "✖ Refusing to build for production without Supabase.",
      "",
      "  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set,",
      "  so the app would fall back to the localStorage demo-auth path, which",
      "  ships hardcoded demo credentials in the client bundle. That must not",
      "  reach production.",
      "",
      "  Fix: set both env vars for this deployment.",
      "  Override (only for an intentional demo deploy): ALLOW_LEGACY_AUTH=true",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.warn(
  "⚠ Supabase env not set — building with the localStorage demo-auth fallback. " +
    "Intended for local dev / preview only; do NOT use this build in production.",
);
process.exit(0);
