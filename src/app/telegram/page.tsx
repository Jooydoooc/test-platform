"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import {
  fetchStatus,
  sendMessage,
  useTelegramConfig,
  type TelegramStatus,
} from "@/lib/telegram-client";

export default function TelegramPage() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const refreshStatus = async () => {
    setChecking(true);
    setStatus(await fetchStatus());
    setChecking(false);
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Telegram</h1>
        <p className="text-sm text-slate-600">
          Connect a bot to send announcements, submission alerts, and student
          results.
        </p>
      </div>

      <ConnectionCard
        status={status}
        checking={checking}
        onRecheck={refreshStatus}
      />

      {status?.configured && status?.ok && (
        <>
          <SettingsCard />
          <AnnounceCard />
          <StudentChatsCard />
        </>
      )}
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
      aria-hidden
    />
  );
}

function ConnectionCard({
  status,
  checking,
  onRecheck,
}: {
  status: TelegramStatus | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  const connected = status?.configured && status?.ok;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <StatusDot
            color={
              checking
                ? "bg-amber-400"
                : connected
                  ? "bg-emerald-500"
                  : "bg-red-500"
            }
          />
          <span className="font-medium">
            {checking
              ? "Checking…"
              : connected
                ? `Connected as @${status?.username}`
                : status?.configured
                  ? "Token set, but Telegram rejected it"
                  : "Not connected"}
          </span>
        </div>
        <Button variant="secondary" onClick={onRecheck} disabled={checking}>
          Re-check
        </Button>
      </div>

      {status && !connected && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          {status.error && (
            <p className="text-red-600">Error: {status.error}</p>
          )}
          <p className="font-medium">Create a bot in 4 steps:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Open Telegram and message{" "}
              <a
                className="text-blue-600 underline"
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
              >
                @BotFather
              </a>
              .
            </li>
            <li>
              Send <code className="rounded bg-white px-1">/newbot</code> and
              follow the prompts (pick a name, then a username ending in{" "}
              <code className="rounded bg-white px-1">bot</code>).
            </li>
            <li>
              Copy the token it gives you (looks like{" "}
              <code className="rounded bg-white px-1">
                123456:ABC-DEF…
              </code>
              ).
            </li>
            <li>
              Paste it into <code className="rounded bg-white px-1">.env.local</code>{" "}
              as <code className="rounded bg-white px-1">TELEGRAM_BOT_TOKEN</code>,
              then restart the dev server and press{" "}
              <span className="font-medium">Re-check</span>.
            </li>
          </ol>
        </div>
      )}
    </Card>
  );
}

function SettingsCard() {
  const [cfg, setCfg] = useTelegramConfig();
  const [testState, setTestState] = useState<string | null>(null);

  async function sendTest() {
    if (!cfg.notifyChatId.trim()) {
      setTestState("Enter a notification chat id first.");
      return;
    }
    setTestState("Sending…");
    const res = await sendMessage({
      chatId: cfg.notifyChatId,
      text: "✅ <b>Lexora</b> connected. Notifications will arrive here.",
    });
    setTestState(res.ok ? "Sent! Check Telegram." : `Failed: ${res.error}`);
  }

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Notifications</h2>

      <Field label="Notifications chat id (admin)">
        <input
          className={inputClass}
          value={cfg.notifyChatId}
          onChange={(e) => setCfg({ ...cfg, notifyChatId: e.target.value })}
          placeholder="e.g. 123456789"
        />
      </Field>
      <p className="-mt-2 text-xs text-slate-500">
        To find your id, message{" "}
        <a
          className="text-blue-600 underline"
          href="https://t.me/userinfobot"
          target="_blank"
          rel="noreferrer"
        >
          @userinfobot
        </a>
        . Also send your bot a message once so it&rsquo;s allowed to reply to
        you.
      </p>

      <Toggle
        label="Notify me when a test is submitted"
        checked={cfg.notifyOnSubmit}
        onChange={(v) => setCfg({ ...cfg, notifyOnSubmit: v })}
      />
      <Toggle
        label="Also DM each student their own result (if their name is mapped below)"
        checked={cfg.sendResultToStudent}
        onChange={(v) => setCfg({ ...cfg, sendResultToStudent: v })}
      />

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={sendTest}>
          Send test message
        </Button>
        {testState && (
          <span className="text-sm text-slate-600">{testState}</span>
        )}
      </div>
    </Card>
  );
}

function AnnounceCard() {
  const [cfg, setCfg] = useTelegramConfig();
  const [text, setText] = useState("");
  const [state, setState] = useState<string | null>(null);

  async function broadcast() {
    const target = cfg.channelChatId.trim();
    if (!target) {
      setState("Set a channel/group id first.");
      return;
    }
    if (!text.trim()) {
      setState("Write an announcement first.");
      return;
    }
    setState("Sending…");
    const res = await sendMessage({
      chatId: target,
      text: `📢 <b>Announcement</b>\n\n${escapeHtml(text.trim())}`,
    });
    if (res.ok) {
      setState("Announcement sent.");
      setText("");
    } else {
      setState(`Failed: ${res.error}`);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Broadcast announcement</h2>

      <Field label="Channel / group id or @username">
        <input
          className={inputClass}
          value={cfg.channelChatId}
          onChange={(e) => setCfg({ ...cfg, channelChatId: e.target.value })}
          placeholder="e.g. @myclass or -1001234567890"
        />
      </Field>
      <p className="-mt-2 text-xs text-slate-500">
        Add your bot to the channel/group as an admin so it can post there.
      </p>

      <Field label="Message">
        <textarea
          className={`${inputClass} min-h-[96px] resize-y`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reminder: the mock exam is on Friday…"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button onClick={broadcast}>Send announcement</Button>
        {state && <span className="text-sm text-slate-600">{state}</span>}
      </div>
    </Card>
  );
}

function StudentChatsCard() {
  const [cfg, setCfg] = useTelegramConfig();
  const [name, setName] = useState("");
  const [chatId, setChatId] = useState("");

  const rows = Object.entries(cfg.studentChats);

  function add() {
    const key = name.trim().toLowerCase();
    const value = chatId.trim();
    if (!key || !value) return;
    setCfg({
      ...cfg,
      studentChats: { ...cfg.studentChats, [key]: value },
    });
    setName("");
    setChatId("");
  }

  function remove(key: string) {
    const next = { ...cfg.studentChats };
    delete next[key];
    setCfg({ ...cfg, studentChats: next });
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Student chat ids</h2>
        <p className="text-sm text-slate-600">
          Map a student&rsquo;s name (as they type it when taking a test) to
          their Telegram chat id so results can be DM&rsquo;d to them.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map(([key, value]) => (
            <li
              key={key}
              className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
            >
              <span className="capitalize text-slate-800">{key}</span>
              <span className="ml-auto font-mono text-xs text-slate-500">
                {value}
              </span>
              <button
                onClick={() => remove(key)}
                className="text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Student name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Maya"
          />
        </Field>
        <Field label="Chat id">
          <input
            className={inputClass}
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 987654321"
          />
        </Field>
        <Button variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span className="text-slate-700">{label}</span>
    </label>
  );
}

// Local mirror of the server-side HTML escaping (announcements are user text).
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
