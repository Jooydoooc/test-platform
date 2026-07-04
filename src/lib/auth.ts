"use client";

// Auth facade. Picks the implementation at module load based on the build-time
// SUPABASE_ENABLED flag: real Supabase Auth when configured, else the original
// localStorage prototype (so a deploy without Supabase env stays working).

import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { useSupabaseSession, supabaseLogout } from "@/lib/auth-supabase";
import {
  useLegacySession,
  legacyLogout,
  authenticate as legacyAuthenticate,
  login as legacyLogin,
  DEMO_CREDENTIALS as LEGACY_DEMO,
} from "@/lib/auth-legacy";

export type { Role, User } from "@/lib/auth-types";

// Stable selection — SUPABASE_ENABLED is a build-time constant, so hook identity
// never changes across renders (rules-of-hooks safe).
export const useSession = SUPABASE_ENABLED ? useSupabaseSession : useLegacySession;
export const logout = SUPABASE_ENABLED ? supabaseLogout : legacyLogout;

// Legacy-only helpers used by the fallback login form.
export const authenticate = legacyAuthenticate;
export const login = legacyLogin;
export const DEMO_CREDENTIALS = LEGACY_DEMO;
export { SUPABASE_ENABLED };
