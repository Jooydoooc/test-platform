import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { botToken, channelChatId, escapeHtml, sendMessage } from "@/lib/telegram";

interface ResultNotice {
  studentId: string;
  testTitle: string;
  /** Score numerator (questions correct, or points earned for graded tests). */
  correct: number;
  /** Score denominator (question count, or points possible). */
  total: number;
  /** True when part of the test still needs a teacher check. */
  pendingReview?: boolean;
}

// Post a single student's result to the class Telegram channel. Best-effort by
// contract: it swallows every error and returns void, so a Telegram outage or
// misconfig can never block or fail a student's submission. It is also a no-op
// unless BOTH the bot token and TELEGRAM_CHANNEL_CHAT_ID are set — that env pair
// is the feature's on-switch.
export async function notifyGroupOfResult(notice: ResultNotice): Promise<void> {
  try {
    const chatId = channelChatId();
    if (!botToken() || !chatId) return;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", notice.studentId)
      .maybeSingle();

    const name =
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      "A student";

    const pct =
      notice.total > 0 ? Math.round((notice.correct / notice.total) * 100) : 0;
    const scoreLine = `${notice.correct}/${notice.total} (${pct}%)`;

    const text =
      `📝 <b>${escapeHtml(name)}</b> finished <b>${escapeHtml(notice.testTitle)}</b>\n` +
      `Score: <b>${scoreLine}</b>` +
      (notice.pendingReview ? " · <i>pending review</i>" : "");

    await sendMessage(chatId, text);
  } catch {
    // Notifications must never affect the submission path — stay silent.
  }
}
