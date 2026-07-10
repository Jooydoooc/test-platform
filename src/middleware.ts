import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// Server-side route protection (request #7) — enforced IN ADDITION TO RLS, not
// instead of it. RLS still guards direct data access; this just keeps
// unauthenticated/underprivileged users from loading protected pages.
const PUBLIC_PREFIXES = ["/login", "/auth"];
const ADMIN_PREFIXES = ["/author", "/admin", "/telegram"];

export async function middleware(request: NextRequest) {
  // Not configured -> skip Supabase entirely and let the client-side AuthGate
  // handle protection (original prototype behavior). Prevents 500s pre-provision.
  if (!SUPABASE_ENABLED) return NextResponse.next();

  const { response, supabase, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return response;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const needsAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  if (needsAdmin) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const isAdmin = profile?.role === "ADMIN" || profile?.role === "TEACHER";
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/tests";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
