import "server-only";
import { NextResponse } from "next/server";
import { getServerUser, type ServerUser } from "@/lib/auth-server";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// Gate for the admin-only student-management API. "Full control over students"
// is a real-ADMIN power (not the TEACHER/ADMIN merge used elsewhere), so these
// routes check the DB role strictly. On failure it returns the response to send;
// on success it returns the authenticated admin user.
export async function requireAdmin(): Promise<
  { ok: true; user: ServerUser } | { ok: false; res: NextResponse }
> {
  if (!SUPABASE_ENABLED) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Admin tools require the Supabase backend." },
        { status: 503 },
      ),
    };
  }

  const user = await getServerUser().catch(() => null);
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Authentication required." },
        { status: 401 },
      ),
    };
  }
  if (user.role !== "ADMIN") {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Admin access required." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user };
}
