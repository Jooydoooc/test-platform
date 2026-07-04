// Build-time flag: is Supabase configured? NEXT_PUBLIC_* vars are inlined at
// build time, so this constant is statically known in both client and server
// bundles. When false, the app falls back to the original localStorage prototype
// so a deploy without Supabase env stays fully working (no 500s). Set the env
// vars and redeploy to activate the real backend.
export const SUPABASE_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
