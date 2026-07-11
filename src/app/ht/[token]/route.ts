import { getServerUser } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// Serve a hosted HTML test at /ht/<share_token>. Login is required (closed
// platform, like /t/<token>). The bucket is private and students have no direct
// object access, so we resolve the token under the caller's RLS, then stream the
// file with the service-role client. The raw HTML is returned as a full page —
// these are full-screen exam UIs, no app chrome needed.
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

  const supabase = await createClient();
  const { data: test } = await supabase
    .from("html_tests")
    .select("storage_path")
    .eq("share_token", token)
    .maybeSingle();

  if (!test) {
    return new Response("Test not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from("html-tests")
    .download(test.storage_path);

  if (error || !blob) {
    return new Response("Could not load the test file.", { status: 500 });
  }

  const html = await blob.text();
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Private to the signed-in student; never cache on shared proxies.
      "Cache-Control": "private, no-store",
    },
  });
}
