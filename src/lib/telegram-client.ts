"use client";

// Browser-side Telegram helpers. Non-secret settings (chat ids, toggles) live
// in localStorage; the bot token stays on the server behind /api/telegram/*.

import { useCallback, useEffect, useState } from "react";

const CONFIG_KEY = "tp.telegram";

export interface TelegramConfig {
  /** Where submission notifications are sent (teacher/admin chat id). */
  notifyChatId: string;
  /** Channel/group id or @username for broadcast announcements. */
  channelChatId: string;
  /** Send a summary to notifyChatId whenever a test is submitted. */
  notifyOnSubmit: boolean;
  /** Also DM the taker their result if their name is mapped below. */
  sendResultToStudent: boolean;
  /** Lowercased taker name -> their personal chat id. */
  studentChats: Record<string, string>;
}

export const defaultConfig: TelegramConfig = {
  notifyChatId: "",
  channelChatId: "",
  notifyOnSubmit: true,
  sendResultToStudent: false,
  studentChats: {},
};

export function loadConfig(): TelegramConfig {
  if (typeof window === "undefined") return defaultConfig;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw
      ? { ...defaultConfig, ...(JSON.parse(raw) as Partial<TelegramConfig>) }
      : defaultConfig;
  } catch {
    return defaultConfig;
  }
}

export function saveConfig(cfg: TelegramConfig): void {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new Event("tp.telegram.change"));
}

export function useTelegramConfig(): [
  TelegramConfig,
  (next: TelegramConfig) => void,
] {
  const [cfg, setCfg] = useState<TelegramConfig>(defaultConfig);

  const refresh = useCallback(() => setCfg(loadConfig()), []);
  useEffect(() => {
    refresh();
    window.addEventListener("tp.telegram.change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("tp.telegram.change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const update = useCallback((next: TelegramConfig) => {
    saveConfig(next);
    setCfg(next);
  }, []);

  return [cfg, update];
}

export interface TelegramStatus {
  configured: boolean;
  ok?: boolean;
  username?: string | null;
  hasAdminChat?: boolean;
  /** Whether TELEGRAM_CHANNEL_CHAT_ID is set — the auto-post-to-group switch. */
  hasChannel?: boolean;
  error?: string | null;
}

export async function fetchStatus(): Promise<TelegramStatus> {
  try {
    const res = await fetch("/api/telegram/status", { cache: "no-store" });
    return (await res.json()) as TelegramStatus;
  } catch {
    return { configured: false, error: "Could not reach the server." };
  }
}

export interface SendArgs {
  chatId?: string;
  useAdmin?: boolean;
  text: string;
}

/** Sends a message via the server. Returns { ok, error? }. */
export async function sendMessage(
  args: SendArgs,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    return data;
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}
