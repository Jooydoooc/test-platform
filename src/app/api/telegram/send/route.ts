import { NextResponse } from "next/server";
import { adminChatId, isConfigured, sendMessage } from "@/lib/telegram";
import { getServerUser, isAdminRole } from "@/lib/auth-server";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

interface SendBody {
  /** Explicit chat/channel id or @username. */
  chatId?: string;
  /** When true, fall back to TELEGRAM_ADMIN_CHAT_ID if chatId is omitted. */
  useAdmin?: boolean;
  /** Message body. May contain a safe subset of Telegram HTML. */
  text?: string;
}

// Single send endpoint used by every feature (notify-on-submit, broadcast,
// student result, test message). The token never leaves the server.
export async function POST(req: Request) {
  // Authorization is enforced HERE, in the handler — NOT via path-prefix
  // middleware. This route lives at /api/telegram/send, which is outside every
  // ADMIN_PREFIX, and middleware is skipped entirely when Supabase is
  // disabled; relying on it would leave this bot relay open to the internet.
  //
  // Fail closed. Without Supabase there is no server-side identity at all
  // (legacy/localStorage mode authenticates only in the browser), so we cannot
  // verify an admin and must refuse rather than relay for anyone.
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sending is disabled without server authentication (Supabase not configured).",
      },
      { status: 503 },
    );
  }

  // Only a signed-in teacher/admin may relay a message through the bot.
  let user: Awaited<ReturnType<typeof getServerUser>>;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
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
    return NextResponse.json(
      { ok: false, error: "Bot token not configured on the server." },
      { status: 503 },
    );
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json(
      { ok: false, error: "Message text is required." },
      { status: 400 },
    );
  }

  const chatId = body.chatId?.trim() || (body.useAdmin ? adminChatId() : null);
  if (!chatId) {
    return NextResponse.json(
      { ok: false, error: "No destination chat id provided." },
      { status: 400 },
    );
  }

  const result = await sendMessage(chatId, text);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.description ?? "Telegram rejected the message." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
