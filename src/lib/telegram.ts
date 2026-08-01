// Server-only Telegram Bot API helper.
//
// The bot token lives in TELEGRAM_BOT_TOKEN (.env.local) and must NEVER be sent
// to the browser. Only import this from route handlers / server code — never
// from a "use client" module, or the token would be bundled into the browser.

const API = "https://api.telegram.org";

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function adminChatId(): string | null {
  return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || null;
}

// The class channel/group the bot posts student results to. Server-side (unlike
// the localStorage channelChatId used for manual broadcasts) because result
// posting fires automatically on submit, with no browser in the loop. Setting
// this env is the on-switch for the auto-post feature.
export function channelChatId(): string | null {
  return process.env.TELEGRAM_CHANNEL_CHAT_ID?.trim() || null;
}

export function isConfigured(): boolean {
  return botToken() !== null;
}

/** Escape text for Telegram HTML parse mode. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface TelegramResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function call<T>(
  method: string,
  body?: Record<string, unknown>,
): Promise<TelegramResult<T>> {
  const token = botToken();
  if (!token) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  }
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    return (await res.json()) as TelegramResult<T>;
  } catch (err) {
    return {
      ok: false,
      description: err instanceof Error ? err.message : "Network error",
    };
  }
}

export interface BotInfo {
  id: number;
  username: string;
  first_name: string;
}

export function getMe() {
  return call<BotInfo>("getMe");
}

export function sendMessage(chatId: string, text: string) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
