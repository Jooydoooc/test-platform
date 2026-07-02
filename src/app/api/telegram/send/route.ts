import { NextResponse } from "next/server";
import { adminChatId, isConfigured, sendMessage } from "@/lib/telegram";

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
