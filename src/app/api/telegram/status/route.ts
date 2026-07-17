import { NextResponse } from "next/server";
import { adminChatId, channelChatId, getMe, isConfigured } from "@/lib/telegram";
import { getServerUser, isAdminRole } from "@/lib/auth-server";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

// Reports whether the bot is configured and, if so, its @username — so the
// settings page can show a live connection status without exposing the token.
export async function GET() {
  // Admin-only. This route sits outside every ADMIN_PREFIX and middleware is
  // skipped when Supabase is disabled, so authorization is enforced HERE — the
  // same fail-closed pattern as /api/telegram/send. Without this guard the bot
  // @username and admin/channel wiring leak to any unauthenticated caller.
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 503 },
    );
  }
  let user: Awaited<ReturnType<typeof getServerUser>>;
  try {
    user = await getServerUser();
  } catch {
    user = null;
  }
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: "Admin access required." },
      { status: 403 },
    );
  }

  if (!isConfigured()) {
    return NextResponse.json({
      configured: false,
      hasAdminChat: false,
      hasChannel: channelChatId() !== null,
    });
  }
  const me = await getMe();
  return NextResponse.json({
    configured: true,
    hasAdminChat: adminChatId() !== null,
    hasChannel: channelChatId() !== null,
    ok: me.ok,
    username: me.result?.username ?? null,
    error: me.ok ? null : me.description ?? "Could not reach Telegram",
  });
}
