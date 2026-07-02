"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, inputClass } from "@/components/ui";
import {
  gradeQuestion,
  gradeTest,
  getTest,
  maxScore,
  saveAttempt,
  uid,
} from "@/lib/store";
import { LEVELS, type Level, type Question, type Test } from "@/lib/types";
import { loadConfig, sendMessage } from "@/lib/telegram-client";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Fire off any configured Telegram notifications for a finished attempt.
// Best-effort: failures are swallowed so they never block the results screen.
async function notifyTelegram(
  test: Test,
  takerName: string,
  score: number,
  total: number,
  group: string,
  level: string,
) {
  const cfg = loadConfig();
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const who = escapeHtml(takerName);

  if (cfg.notifyOnSubmit && cfg.notifyChatId.trim()) {
    const meta = [group && `Group: ${group}`, level && `Level: ${level}`]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" · ");
    void sendMessage({
      chatId: cfg.notifyChatId,
      text:
        `📝 <b>${who}</b> finished <b>${escapeHtml(test.title)}</b>\n` +
        `Score: <b>${score}/${total}</b> (${pct}%)` +
        (meta ? `\n${meta}` : ""),
    });
  }

  if (cfg.sendResultToStudent) {
    const chatId = cfg.studentChats[takerName.trim().toLowerCase()];
    if (chatId) {
      void sendMessage({
        chatId,
        text:
          `Hi ${who}! Your result for <b>${escapeHtml(test.title)}</b>:\n` +
          `<b>${score}/${total}</b> (${pct}%)`,
      });
    }
  }
}

type Answers = Record<string, string[]>;

export default function TakeTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<Test | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const t = getTest(id);
    if (!t) {
      router.replace("/tests");
      return;
    }
    setTest(t);
  }, [id, router]);

  if (!test) return <p className="text-slate-500">Loading…</p>;

  function setAnswer(qid: string, value: string[]) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  const answeredCount = test.questions.filter(
    (q) => (answers[q.id]?.length ?? 0) > 0 && answers[q.id]?.[0] !== "",
  ).length;

  function submit() {
    const score = gradeTest(test!, answers);
    const total = maxScore(test!);
    const takerName = name.trim() || "Anonymous";
    saveAttempt({
      id: uid(),
      testId: test!.id,
      testTitle: test!.title,
      takerName,
      group: group.trim() || undefined,
      level: level || undefined,
      answers,
      score,
      maxScore: total,
      submittedAt: Date.now(),
    });
    void notifyTelegram(test!, takerName, score, total, group.trim(), level);
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submitted) {
    return (
      <Results test={test} answers={answers} name={name.trim() || "Anonymous"} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{test.title}</h1>
        {test.description && (
          <p className="mt-1 text-slate-600">{test.description}</p>
        )}
      </div>

      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label="Your name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Group">
          <input
            className={inputClass}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="e.g. Class A"
          />
        </Field>
        <Field label="Level">
          <select
            className={inputClass}
            value={level}
            onChange={(e) => setLevel(e.target.value as Level | "")}
          >
            <option value="">—</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <div className="space-y-4">
        {test.questions.map((q, i) => (
          <QuestionInput
            key={q.id}
            index={i}
            question={q}
            value={answers[q.id] ?? []}
            onChange={(v) => setAnswer(q.id, v)}
          />
        ))}
      </div>

      <Card className="flex items-center justify-between">
        <span className="text-sm text-slate-600">
          {answeredCount} / {test.questions.length} answered
        </span>
        <Button onClick={submit}>Submit test</Button>
      </Card>
    </div>
  );
}

function QuestionInput({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: Question;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const q = question;

  return (
    <Card className="space-y-3">
      <div className="flex justify-between gap-4">
        <h3 className="font-medium">
          <span className="mr-2 text-slate-400">Q{index + 1}.</span>
          {q.prompt}
        </h3>
        <span className="shrink-0 text-xs text-slate-400">
          {q.points} pt{q.points === 1 ? "" : "s"}
        </span>
      </div>

      {(q.type === "single" || q.type === "boolean") && (
        <div className="space-y-2">
          {(q.type === "boolean"
            ? [
                { id: "true", text: "True" },
                { id: "false", text: "False" },
              ]
            : q.choices
          ).map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={q.id}
                checked={value[0] === c.id}
                onChange={() => onChange([c.id])}
              />
              {c.text}
            </label>
          ))}
        </div>
      )}

      {q.type === "multiple" && (
        <div className="space-y-2">
          {q.choices.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.includes(c.id)}
                onChange={() =>
                  onChange(
                    value.includes(c.id)
                      ? value.filter((id) => id !== c.id)
                      : [...value, c.id],
                  )
                }
              />
              {c.text}
            </label>
          ))}
        </div>
      )}

      {q.type === "short" && (
        <input
          className={inputClass}
          value={value[0] ?? ""}
          onChange={(e) => onChange([e.target.value])}
          placeholder="Type your answer…"
        />
      )}
    </Card>
  );
}

function Results({
  test,
  answers,
  name,
}: {
  test: Test;
  answers: Answers;
  name: string;
}) {
  const score = gradeTest(test, answers);
  const total = maxScore(test);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  function label(q: Question, ids: string[]): string {
    if (q.type === "short") return ids[0] || "—";
    if (q.type === "boolean") return ids[0] === "false" ? "False" : ids[0] === "true" ? "True" : "—";
    const texts = ids
      .map((id) => q.choices.find((c) => c.id === id)?.text)
      .filter(Boolean);
    return texts.length ? texts.join(", ") : "—";
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-2 text-center">
        <p className="text-sm text-slate-500">Results for {name}</p>
        <h1 className="text-4xl font-bold">
          {score} / {total}
        </h1>
        <p
          className={`text-lg font-semibold ${
            pct >= 50 ? "text-green-600" : "text-red-600"
          }`}
        >
          {pct}%
        </p>
      </Card>

      <div className="space-y-3">
        {test.questions.map((q, i) => {
          const earned = gradeQuestion(q, answers[q.id]);
          const correct = earned === q.points;
          return (
            <Card key={q.id} className="space-y-1">
              <div className="flex justify-between gap-4">
                <h3 className="font-medium">
                  <span className="mr-2 text-slate-400">Q{i + 1}.</span>
                  {q.prompt}
                </h3>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    correct ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {correct ? "✓" : "✗"} {earned}/{q.points}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                Your answer: {label(q, answers[q.id] ?? [])}
              </p>
              {!correct && (
                <p className="text-sm text-green-700">
                  Correct: {label(q, q.correct)}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2">
        <a
          href="/tests"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to tests
        </a>
        <a
          href="/results"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          View all results
        </a>
      </div>
    </div>
  );
}
