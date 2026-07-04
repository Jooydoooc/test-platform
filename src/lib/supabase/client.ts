import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Browser (client component) Supabase client. Uses the public anon key — RLS is
// the real enforcement, so the anon key is safe to expose. NEVER import the
// service-role client (src/lib/supabase/admin.ts) into client code.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
