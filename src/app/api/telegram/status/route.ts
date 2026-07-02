import { NextResponse } from "next/server";
import { adminChatId, getMe, isConfigured } from "@/lib/telegram";

// Reports whether the bot is configured and, if so, its @username — so the
// settings page can show a live connection status without exposing the token.
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({
      configured: false,
      hasAdminChat: false,
    });
  }
  const me = await getMe();
  return NextResponse.json({
    configured: true,
    hasAdminChat: adminChatId() !== null,
    ok: me.ok,
    username: me.result?.username ?? null,
    error: me.ok ? null : me.description ?? "Could not reach Telegram",
  });
}
